import { Document, NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import {
  CRISTO_IMPERADOR,
  HANGAR,
  UNIACADEMIA,
  WORKSHOP,
  cityLayout,
  deliveryRampData,
  terrainHeight,
} from './world-data';
import { bairrosBlocks, bairrosData, bairrosLots, buildBairrosMesh } from './bairros';

interface Segment {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  half: number;
}

function distToSegment(s: Segment, x: number, z: number): number {
  const dx = s.x1 - s.x0, dz = s.z1 - s.z0, len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((x - s.x0) * dx + (z - s.z0) * dz) / len2)) : 0;
  return Math.hypot(x - s.x0 - dx * t, z - s.z0 - dz * t);
}

function pointInPoly(pts: number[], x: number, z: number): boolean {
  if (pts.length < 6) return false;
  let c = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], zi = pts[i + 1], xj = pts[j], zj = pts[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

describe('bairros de Juiz de Fora', () => {
  it('gera malha válida, determinística e dentro do orçamento de vértices e GLB', async () => {
    const mesh = bairrosData();
    const rebuilt = buildBairrosMesh();
    const lots = bairrosLots();
    const blocks = bairrosBlocks();

    expect(rebuilt).toEqual(mesh);
    expect(blocks.length).toBeGreaterThan(20);

    const vertCount = mesh.pos.length / 3;
    const triCount = mesh.idx.length / 3;
    expect(lots.length).toBeGreaterThan(2000);
    expect(lots.length).toBeLessThan(7000);
    expect(vertCount).toBeGreaterThan(20_000);
    expect(vertCount).toBeLessThanOrEqual(65_535);
    expect(mesh.pos.length % 3).toBe(0);
    expect(mesh.idx.length % 3).toBe(0);
    expect(mesh.normals).toHaveLength(mesh.pos.length);
    expect(mesh.col).toHaveLength(vertCount * 4);
    expect(mesh.pos.every(Number.isFinite)).toBe(true);
    expect(mesh.normals.every(Number.isFinite)).toBe(true);
    expect(mesh.idx.every((i) => Number.isInteger(i) && i >= 0 && i < vertCount)).toBe(true);

    // Verifica tamanho real do GLB exportado (mesmo formato do exportar-mundo.mjs: sem normals)
    const doc = new Document();
    const buf = doc.createBuffer();
    const acc = (type: 'VEC3' | 'VEC4' | 'SCALAR', arr: Float32Array | Uint8Array | Uint16Array) =>
      doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
    const prim = doc.createPrimitive()
      .setMaterial(doc.createMaterial('Bairros').setMetallicFactor(0).setRoughnessFactor(0.85))
      .setAttribute('POSITION', acc('VEC3', new Float32Array(mesh.pos)))
      .setAttribute('COLOR_0', acc('VEC4', new Uint8Array(mesh.col)).setNormalized(true))
      .setIndices(acc('SCALAR', new Uint16Array(mesh.idx)));
    doc.createScene('Bairros').addChild(doc.createNode('Bairros').setMesh(doc.createMesh('Bairros').addPrimitive(prim)));
    const glbBytes = await new NodeIO().writeBinary(doc);

    expect(triCount).toBeGreaterThan(20_000);
    expect(glbBytes.byteLength).toBeLessThanOrEqual(1_550_000);
  });

  it('não coloca nenhum prédio sobre vias, rio, UniAcademia, praças, estádios, universidades, pista ou marcos', () => {
    const layout = cityLayout();
    const lots = bairrosLots();
    const mesh = bairrosData();

    const HASH = 64;
    const key = (gx: number, gz: number) => gx * 4096 + gz;
    const grid = new Map<number, Segment[]>();
    const add = (s: Segment) => {
      for (let gx = Math.floor(Math.min(s.x0, s.x1) / HASH); gx <= Math.floor(Math.max(s.x0, s.x1) / HASH); gx++) {
        for (let gz = Math.floor(Math.min(s.z0, s.z1) / HASH); gz <= Math.floor(Math.max(s.z0, s.z1) / HASH); gz++) {
          const k = key(gx, gz);
          let list = grid.get(k);
          if (!list) grid.set(k, (list = []));
          list.push(s);
        }
      }
    };
    for (const group of layout.roadLines) {
      const half = group.width / 0.72 / 2;
      for (const line of group.lines) {
        for (let i = 0; i + 3 < line.length; i += 2) {
          add({ x0: line[i], z0: line[i + 1], x1: line[i + 2], z1: line[i + 3], half });
        }
      }
    }
    for (const line of layout.river.lines) {
      for (let i = 0; i + 3 < line.length; i += 2) {
        add({ x0: line[i], z0: line[i + 1], x1: line[i + 2], z1: line[i + 3], half: layout.river.width / 2 });
      }
    }
    const minCorridorGap = (x: number, z: number) => {
      const gx = Math.floor(x / HASH), gz = Math.floor(z / HASH);
      let best = Infinity;
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          for (const s of grid.get(key(gx + a, gz + b)) ?? []) {
            const g = distToSegment(s, x, z) - s.half;
            if (g < best) best = g;
          }
        }
      }
      return best;
    };

    const polys = [
      ...layout.parkPolygons.map((p) => p.pts),
      ...layout.stadiumPolygons.map((p) => p.pts),
      ...layout.universityPolygons.map((p) => p.pts),
      ...(layout.airportPolygon.length >= 6 ? [layout.airportPolygon] : []),
    ];
    const rwyA = layout.runwayLine.a, rwyB = layout.runwayLine.b;
    const rwyLen = Math.hypot(rwyB.x - rwyA.x, rwyB.z - rwyA.z);
    const rwyUx = (rwyB.x - rwyA.x) / rwyLen, rwyUz = (rwyB.z - rwyA.z) / rwyLen;
    const ramps = deliveryRampData().ramps;

    let corridorViolations = 0;
    let uniViolations = 0;
    let landmarkViolations = 0;
    let polyViolations = 0;
    let runwayViolations = 0;
    let rampViolations = 0;

    for (const lot of lots) {
      const rx = Math.cos(lot.angle), rz = Math.sin(lot.angle);
      const fx = -rz, fz = rx;
      const hw = lot.w / 2, hd = lot.d / 2;
      const pts: [number, number][] = [
        [lot.cx, lot.cz],
        [lot.cx - hw * rx + hd * fx, lot.cz - hw * rz + hd * fz],
        [lot.cx + hw * rx + hd * fx, lot.cz + hw * rz + hd * fz],
        [lot.cx + hw * rx - hd * fx, lot.cz + hw * rz - hd * fz],
        [lot.cx - hw * rx - hd * fx, lot.cz - hw * rz - hd * fz],
      ];

      for (const [x, z] of pts) {
        if (minCorridorGap(x, z) <= 0.4) corridorViolations++;
        if (Math.hypot(x - UNIACADEMIA.x, z - UNIACADEMIA.z) <= UNIACADEMIA.radius) uniViolations++;
        if (
          Math.hypot(x - WORKSHOP.x, z - WORKSHOP.z) <= 14 ||
          Math.hypot(x - CRISTO_IMPERADOR.x, z - CRISTO_IMPERADOR.z) <= 20 ||
          Math.hypot(x - layout.helipad.x, z - layout.helipad.z) <= 18
        ) landmarkViolations++;
        if (polys.some((p) => pointInPoly(p, x, z))) polyViolations++;
        const s = (x - rwyA.x) * rwyUx + (z - rwyA.z) * rwyUz;
        const l = (x - rwyA.x) * -rwyUz + (z - rwyA.z) * rwyUx;
        if (
          (s >= -50 && s <= rwyLen + 50 && Math.abs(l) <= 80) ||
          (x >= HANGAR.x0 && x <= HANGAR.x1 && z >= HANGAR.z0 && z <= HANGAR.z1)
        ) runwayViolations++;
        if (
          ramps.some(
            (q) =>
              x >= Math.min(q.x0, q.x1) - 4 && x <= Math.max(q.x0, q.x1) + 4 &&
              z >= Math.min(q.z0, q.z1) - 4 && z <= Math.max(q.z0, q.z1) + 4,
          )
        ) rampViolations++;
      }
    }

    let meshUniViolations = 0;
    for (let i = 0; i < mesh.pos.length; i += 3) {
      const x = mesh.pos[i], z = mesh.pos[i + 2];
      if (Math.hypot(x - UNIACADEMIA.x, z - UNIACADEMIA.z) <= UNIACADEMIA.radius) meshUniViolations++;
    }

    expect({
      corridorViolations,
      uniViolations,
      meshUniViolations,
      landmarkViolations,
      polyViolations,
      runwayViolations,
      rampViolations,
    }).toEqual({
      corridorViolations: 0,
      uniViolations: 0,
      meshUniViolations: 0,
      landmarkViolations: 0,
      polyViolations: 0,
      runwayViolations: 0,
      rampViolations: 0,
    });
  });

  it('assenta casas no relevo, varia tipologias (1-6 andares e 3 telhados) e concentra densidade perto do Centro', () => {
    const layout = cityLayout();
    const centro = layout.landmarks.centro;
    const lots = bairrosLots();

    const floors = new Set<number>();
    const roofs = new Set<string>();
    let nearCentro = 0;
    let midBairros = 0;
    let farPeriphery = 0;
    let slopeViolations = 0;
    let groundViolations = 0;

    for (const lot of lots) {
      floors.add(lot.floors);
      roofs.add(lot.roof);
      if (lot.floors < 1 || lot.floors > 6) groundViolations++;

      const hCenter = terrainHeight(lot.cx, lot.cz);
      if (!(lot.yBase < hCenter && lot.yGround >= hCenter - 0.01 && lot.yTop > lot.yGround + 2.5)) groundViolations++;

      const d = 8;
      const slope = Math.hypot(
        (terrainHeight(lot.cx + d, lot.cz) - terrainHeight(lot.cx - d, lot.cz)) / (2 * d),
        (terrainHeight(lot.cx, lot.cz + d) - terrainHeight(lot.cx, lot.cz - d)) / (2 * d),
      );
      if (slope > 0.43) slopeViolations++;

      const dc = Math.hypot(lot.cx - centro.x, lot.cz - centro.z);
      if (dc < 1000) nearCentro++;
      else if (dc < 2000) midBairros++;
      else farPeriphery++;
    }

    expect(groundViolations).toBe(0);
    expect(slopeViolations).toBe(0);
    expect([...floors].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...roofs].sort()).toEqual(['gable', 'hip', 'slab']);
    const densityNear = nearCentro / (Math.PI * 1000 * 1000);
    const densityMid = midBairros / (Math.PI * (2000 * 2000 - 1000 * 1000));
    const densityFar = farPeriphery / (Math.PI * (3000 * 3000 - 2000 * 2000));
    expect(densityNear).toBeGreaterThan(densityMid);
    expect(densityMid).toBeGreaterThan(densityFar);
    expect(nearCentro).toBeGreaterThan(750);
    expect(midBairros).toBeGreaterThan(750);
  });
});
