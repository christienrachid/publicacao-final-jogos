import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Vitest runs in Node; this browser project has no @types/node dependency.
import { readFileSync } from 'node:fs';
import { BoundingBox, Entity, Vec3, type AppBase } from 'playcanvas';
import { boxesOverlap2D, CarDynamics, type CarCollider } from '../car';
import { createWorldPhysics } from '../world-data';
import { computeLocalAabb, cornersHitboxFromAabb, extractHitboxFootprint } from './glb';
import { buildVehicleModel } from './index';

interface ParsedGlbMesh {
  name: string;
  translation: [number, number, number];
  positions: number[];
  aabb: BoundingBox;
}

/** Lê vértices reais da cena ativa de um arquivo GLB binário sem depender de WebGL ou @types/node. */
function parseGlbSceneMeshes(path: string): ParsedGlbMesh[] {
  const bytes = readFileSync(path) as Uint8Array;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLen = view.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen))) as {
    scene?: number;
    scenes?: Array<{ nodes?: number[] }>;
    nodes?: Array<{ name?: string; mesh?: number; translation?: [number, number, number]; children?: number[] }>;
    meshes?: Array<{ primitives: Array<{ attributes: { POSITION?: number } }> }>;
    accessors?: Array<{ bufferView: number; byteOffset?: number; count: number }>;
    bufferViews?: Array<{ byteOffset?: number; byteStride?: number }>;
  };
  const binOff = 20 + jsonLen + 8;
  const nodes = gltf.nodes ?? [];
  const meshes = gltf.meshes ?? [];
  const accessors = gltf.accessors ?? [];
  const bufferViews = gltf.bufferViews ?? [];

  const roots = gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? [];
  const active = new Set<number>();
  const parents = new Map<number, number>();
  nodes.forEach((n, idx) => (n.children ?? []).forEach((c) => parents.set(c, idx)));
  const visit = (idx: number) => {
    active.add(idx);
    for (const c of nodes[idx]?.children ?? []) visit(c);
  };
  roots.forEach(visit);

  const worldTranslation = (idx: number): [number, number, number] => {
    let x = 0, y = 0, z = 0;
    let cur: number | undefined = idx;
    while (cur !== undefined) {
      const t = nodes[cur]?.translation;
      if (t) {
        x += t[0];
        y += t[1];
        z += t[2];
      }
      cur = parents.get(cur);
    }
    return [x, y, z];
  };

  const out: ParsedGlbMesh[] = [];
  for (const idx of active) {
    const node = nodes[idx];
    if (node?.mesh === undefined) continue;
    const mesh = meshes[node.mesh];
    if (!mesh) continue;
    const positions: number[] = [];
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const prim of mesh.primitives) {
      const accIdx = prim.attributes.POSITION;
      if (accIdx === undefined) continue;
      const acc = accessors[accIdx];
      const bv = bufferViews[acc.bufferView];
      const stride = bv.byteStride || 12;
      const start = binOff + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
      for (let k = 0; k < acc.count; k++) {
        const vx = view.getFloat32(start + k * stride, true);
        const vy = view.getFloat32(start + k * stride + 4, true);
        const vz = view.getFloat32(start + k * stride + 8, true);
        positions.push(vx, vy, vz);
        if (vx < minX) minX = vx;
        if (vx > maxX) maxX = vx;
        if (vy < minY) minY = vy;
        if (vy > maxY) maxY = vy;
        if (vz < minZ) minZ = vz;
        if (vz > maxZ) maxZ = vz;
      }
    }
    if (positions.length === 0) continue;
    out.push({
      name: node.name ?? `node_${idx}`,
      translation: worldTranslation(idx),
      positions,
      aabb: new BoundingBox(
        new Vec3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5),
        new Vec3((maxX - minX) * 0.5, (maxY - minY) * 0.5, (maxZ - minZ) * 0.5),
      ),
    });
  }
  return out;
}

/** Calcula os limites reais da carroceria (excluindo retrovisores finos e antena de teto) para conferência. */
function measureRealBodyBounds(meshes: ParsedGlbMesh[]) {
  const bx: number[] = [];
  const by: number[] = [];
  const bz: number[] = [];
  let wMinX = Infinity, wMaxX = -Infinity, wMinY = Infinity, wMaxY = -Infinity, wMinZ = Infinity, wMaxZ = -Infinity;
  let hasWheel = false;

  for (const m of meshes) {
    const isWheel = /^roda_/i.test(m.name);
    const [tx, ty, tz] = m.translation;
    for (let i = 0; i < m.positions.length; i += 3) {
      const x = m.positions[i] + tx;
      const y = m.positions[i + 1] + ty;
      const z = m.positions[i + 2] + tz;
      if (isWheel) {
        hasWheel = true;
        if (x < wMinX) wMinX = x;
        if (x > wMaxX) wMaxX = x;
        if (y < wMinY) wMinY = y;
        if (y > wMaxY) wMaxY = y;
        if (z < wMinZ) wMinZ = z;
        if (z > wMaxZ) wMaxZ = z;
      } else {
        bx.push(x);
        by.push(y);
        bz.push(z);
      }
    }
  }
  const q = (arr: number[], p: number) => {
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.max(0, Math.min(s.length - 1, Math.floor((s.length - 1) * p)))];
  };
  const minX = Math.min(q(bx, 0.015), hasWheel ? wMinX : Infinity);
  const maxX = Math.max(q(bx, 0.985), hasWheel ? wMaxX : -Infinity);
  const minY = Math.max(0, Math.min(q(by, 0.002), hasWheel ? wMinY : Infinity));
  const maxY = Math.max(q(by, 0.995), hasWheel ? wMaxY : -Infinity);
  const minZ = Math.min(q(bz, 0.002), hasWheel ? wMinZ : Infinity);
  const maxZ = Math.max(q(bz, 0.998), hasWheel ? wMaxZ : -Infinity);
  return {
    width: maxX - minX,
    height: maxY - minY,
    length: maxZ - minZ,
    rawWidth: q(bx, 1) - q(bx, 0),
    rawHeight: q(by, 1),
  };
}

function buildGlbEntityTree(app: AppBase, meshes: ParsedGlbMesh[]): Entity {
  const glbRoot = new Entity('GlbRoot', app);
  for (const m of meshes) {
    const node = new Entity(m.name, app);
    node.setLocalPosition(...m.translation);
    Object.defineProperty(node, 'render', {
      value: {
        enabled: true,
        meshInstances: [
          {
            node,
            mesh: {
              aabb: m.aabb,
              getPositions(out: number[]) {
                for (let i = 0; i < m.positions.length; i++) out.push(m.positions[i]);
                return m.positions.length / 3;
              },
            },
          },
        ],
      },
      writable: true,
      configurable: true,
    });
    glbRoot.addChild(node);
  }
  return glbRoot;
}

const CAR_GLBS: ReadonlyArray<{ file: string; kind: 'car' | 'tuned'; variant: number }> = [
  { file: 'carro.glb', kind: 'car', variant: 0 },
  { file: 'carro-tunado.glb', kind: 'tuned', variant: 0 },
  { file: 'carro-compacto.glb', kind: 'car', variant: 3 },
  { file: 'carro-picape.glb', kind: 'car', variant: 1 },
  { file: 'carro-esportivo.glb', kind: 'car', variant: 2 },
];

describe('hitbox justa dos carros a partir dos GLBs reais e colisões carro×prédio / carro×carro', () => {
  it.each(CAR_GLBS)('mantém hitbox de $file justa à carroceria (folga <= 5 cm, sem retrovisor/antena exagerados)', ({
    file,
    kind,
    variant,
  }) => {
    const app = { _entityIndex: {}, systems: {} } as unknown as AppBase;
    const meshes = parseGlbSceneMeshes(`public/models/${file}`);
    expect(meshes.length).toBeGreaterThan(0);

    const body = measureRealBodyBounds(meshes);
    const glbRoot = buildGlbEntityTree(app, meshes);
    const aabb = computeLocalAabb(glbRoot, { trimCarOutliers: true });
    expect(aabb).not.toBeNull();

    const hitbox = cornersHitboxFromAabb(aabb!);
    const fp = extractHitboxFootprint(hitbox);
    expect(fp).not.toBeNull();

    const hitW = fp!.halfWidth * 2;
    const hitL = fp!.halfLength * 2;
    const hitH = fp!.height;

    // A hitbox envolve a carroceria real com folga máxima de 5 cm por lado (10 cm total) e sem ultrapassar o envelope bruto
    expect(hitW).toBeGreaterThanOrEqual(body.width - 0.01);
    expect(hitW - body.width).toBeLessThanOrEqual(0.1);
    expect(hitL).toBeGreaterThanOrEqual(body.length - 0.01);
    expect(hitL - body.length).toBeLessThanOrEqual(0.1);
    expect(hitH).toBeGreaterThanOrEqual(body.height - 0.01);
    expect(hitH - body.height).toBeLessThanOrEqual(0.05);

    // Base encostada no chão (sem vértice abaixo de y=0)
    const minY = Math.min(...hitbox.map((p) => p[1]));
    expect(minY).toBeGreaterThanOrEqual(0);
    expect(minY).toBeLessThanOrEqual(0.05);

    // Sem antena de teto do Fiesta (1,73 m) nem retrovisores exagerados do Fiesta (1,93 m) e da Picape (1,95 m)
    if (file === 'carro.glb') {
      // hatch em alta qualidade (Meshy): sem antena; só os retrovisores ficam fora da hitbox
      expect(hitW).toBeLessThanOrEqual(body.rawWidth);
    }
    if (file === 'carro-picape.glb') {
      expect(hitW).toBeLessThan(body.rawWidth - 0.04);
    }

    // Fallback procedural de buildVehicleModel também alinhado à carroceria real (<= 5 cm por lado)
    const spy = vi.spyOn(Entity.prototype, 'addComponent').mockImplementation(() => null);
    try {
      const parent = new Entity('Root', app);
      const model = buildVehicleModel(app, kind, variant, parent);
      const fb = extractHitboxFootprint(model.hitbox);
      expect(fb).not.toBeNull();
      expect(Math.abs(fb!.halfWidth * 2 - body.width)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(fb!.halfLength * 2 - body.length)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(fb!.height - body.height)).toBeLessThanOrEqual(0.08);
    } finally {
      spy.mockRestore();
    }
  });

  it('usa hitbox orientada na colisão carro×prédio (passa rente pela lateral sem parede invisível de 2,2 m)', () => {
    // Parede em x = 1.0..3.0 ao longo de Z
    const wall = { x0: 1.0, x1: 3.0, z0: -100, z1: 100, top: 20 };
    const world = createWorldPhysics([wall], 0);
    const car = new CarDynamics(world);
    car.halfWidth = 0.86;
    car.halfLength = 1.99;
    car.height = 1.43;

    // Carro trafegando paralelo à parede (heading 0 = -Z) a apenas 14 cm de folga lateral (x = 0 -> lateral direita em 0.86 < 1.0)
    car.reset(0, 0, 0, 0);
    for (let i = 0; i < 60; i++) car.step({ drive: 1, steer: 0, handbrake: false }, 1 / 120);
    expect(car.z).toBeLessThan(-1.5);

    // Agora de frente contra a parede (heading 90 = +X): para exatamente no para-choque (x ≈ 1.0 - 1.99 = -0.99)
    car.reset(-5, 0, 0, 90);
    for (let i = 0; i < 240; i++) car.step({ drive: 1, steer: 0, handbrake: false }, 1 / 120);
    expect(car.x).toBeLessThanOrEqual(1.0 - car.halfLength + 0.03);
    expect(car.x).toBeGreaterThan(1.0 - car.halfLength - 0.35);
  });

  it('usa hitbox orientada na colisão carro×carro (bloqueia no para-choque e permite ultrapassagem rente na faixa ao lado)', () => {
    const emptyWorld = createWorldPhysics([], 0);
    const other: CarCollider = { x: 0, y: 0, z: -10, heading: 0, halfWidth: 0.85, halfLength: 1.98, height: 1.4 };

    // 1) Dois carros lado a lado na mesma direção separados por 1,80 m (> 0,86 + 0,85 = 1,71 m) NÃO colidem
    expect(boxesOverlap2D(0, 0, 0, 0.86, 1.99, 1.8, 0, 0, 0.85, 1.98)).toBe(false);
    // Aproximando para 1,65 m (< 1,71 m) colidem
    expect(boxesOverlap2D(0, 0, 0, 0.86, 1.99, 1.65, 0, 0, 0.85, 1.98)).toBe(true);

    // 2) Carro do jogador indo de frente contra o carro de tráfego/estacionado para rente ao para-choque
    const car = new CarDynamics(emptyWorld, false, () => [other]);
    car.halfWidth = 0.86;
    car.halfLength = 1.99;
    car.height = 1.43;
    car.reset(0, 0, 0, 0);
    for (let i = 0; i < 240; i++) car.step({ drive: 1, steer: 0, handbrake: false }, 1 / 120);
    // Para antes de encostar (z >= -10 + 1.98 + 1.99 = -6.03) e não para a 4+ metros de distância
    expect(car.z).toBeGreaterThanOrEqual(-6.05);
    expect(car.z).toBeLessThan(-5.7);

    // 3) Na faixa ao lado (x = 1.95 m -> folga lateral de 24 cm), ultrapassa livremente
    car.reset(1.95, 0, 0, 0);
    for (let i = 0; i < 240; i++) car.step({ drive: 1, steer: 0, handbrake: false }, 1 / 120);
    expect(car.z).toBeLessThan(-14);
  });
});
