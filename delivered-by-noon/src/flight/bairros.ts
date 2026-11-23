import { calculateNormals } from 'playcanvas';
import { rng, smoothstep } from './noise';
import {
  CRISTO_IMPERADOR,
  HANGAR,
  UNIACADEMIA,
  WORKSHOP,
  cityLayout,
  deliveryRampData,
  protectedSpots,
  terrainHeight,
  type MeshData,
} from './world-data';

// ---------------------------------------------------------------------------
// Bairros de Juiz de Fora: lotes contínuos ao longo das vias e quarteirões
// fechados preenchidos, com fileiras de casas (1-2 andares nos bairros) e
// prédios de 2 a 6 andares perto do Centro, telhados de telha vermelha e lajes.
// ---------------------------------------------------------------------------

export type RoofKind = 'gable' | 'hip' | 'slab';

export interface BairroLot {
  cx: number;
  cz: number;
  w: number;
  d: number;
  angle: number;
  floors: number;
  roof: RoofKind;
  yBase: number;
  yGround: number;
  yTop: number;
}

export interface UrbanBlock {
  pts: number[];
  cx: number;
  cz: number;
  area: number;
  angle: number;
  dc: number;
}

interface Segment {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  half: number;
  cls: number;
}

interface Poly {
  pts: number[];
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

interface OBB {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  rx: number;
  rz: number;
  fx: number;
  fz: number;
  rad: number;
  tower?: boolean;
}

const HASH = 64;
const OBB_CELL = 40;
const RIVER_CLS = 9;
const MAX_VERTS = 42_600; // mantém índices Uint16 (<= 65535) e mundo inteiro < 5,1 MB com TEXCOORD_0
const MAX_SLOPE = 0.42; // Juiz de Fora tem muitos bairros em encosta (Granbery, Santa Helena, Bairu, São Pedro)
const MAX_FOOTPRINT_DROP = 7.2; // base estendida acompanha o declive (muro de arrimo)
const ROAD_MARGIN = 0.85; // folga além da calçada desenhada (asfalto / 0,72)
const FLOOR_H = 3.1;
const TEX_WINDOWS = 8;
const TEX_ROWS = 16;
const ROOF_UV = 0.5;

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

// Paleta realista de Juiz de Fora: bege, creme, areia, terracota suave, cinza claro e azul-acinzentado
const WALL_COLORS = [
  '#e7ded0', '#dfd2bd', '#d8c7ab', '#ebe5d8',
  '#d3bf9f', '#ccbfa9', '#dac5ad', '#cba58f',
  '#c7b09b', '#d4d7d9', '#c7ced4', '#b7c3ce',
  '#e2dbcc', '#d0c8b9',
].map(hex);

// Telhas cerâmicas variadas (terracota, barro envelhecido, siena, ocre-marrom — sem laranja uniforme)
const TILE_COLORS = [
  '#9e4831', '#8c3f2b', '#ae583b', '#7d3c2b', '#95533a',
  '#723f32', '#a66243', '#844b36', '#984430', '#683d33',
].map(hex);

const SLAB_COLORS = ['#b3afa7', '#a4a19a', '#bfbab1', '#979691'].map(hex);
const MURO_COLORS = ['#dad2c4', '#cec7ba', '#e2dbce', '#c5bfb3'].map(hex);

const hashKey = (gx: number, gz: number) => gx * 4096 + gz;

function toPoly(pts: number[]): Poly | null {
  if (pts.length < 6) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < x0) x0 = pts[i];
    if (pts[i] > x1) x1 = pts[i];
    if (pts[i + 1] < z0) z0 = pts[i + 1];
    if (pts[i + 1] > z1) z1 = pts[i + 1];
  }
  return { pts, x0, x1, z0, z1 };
}

function pointInPoly(p: Poly, x: number, z: number): boolean {
  if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) return false;
  let c = false;
  const pts = p.pts;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], zi = pts[i + 1], xj = pts[j], zj = pts[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function distToSegment(s: Segment, x: number, z: number): number {
  const dx = s.x1 - s.x0, dz = s.z1 - s.z0, len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((x - s.x0) * dx + (z - s.z0) * dz) / len2)) : 0;
  return Math.hypot(x - s.x0 - dx * t, z - s.z0 - dz * t);
}

function obbOverlap(a: OBB, b: OBB, pad: number): boolean {
  const dx = b.cx - a.cx, dz = b.cz - a.cz;
  const rSum = a.rad + b.rad + pad;
  if (dx * dx + dz * dz > rSum * rSum) return false;
  const axes: [number, number][] = [
    [a.rx, a.rz],
    [a.fx, a.fz],
    [b.rx, b.rz],
    [b.fx, b.fz],
  ];
  for (const [ax, az] of axes) {
    const dist = Math.abs(dx * ax + dz * az);
    const pa = a.hw * Math.abs(a.rx * ax + a.rz * az) + a.hd * Math.abs(a.fx * ax + a.fz * az);
    const pb = b.hw * Math.abs(b.rx * ax + b.rz * az) + b.hd * Math.abs(b.fx * ax + b.fz * az);
    if (dist > pa + pb + pad) return false;
  }
  return true;
}

function terrainSlope(x: number, z: number): number {
  const d = 8;
  const gx = (terrainHeight(x + d, z) - terrainHeight(x - d, z)) / (2 * d);
  const gz = (terrainHeight(x, z + d) - terrainHeight(x, z - d)) / (2 * d);
  return Math.hypot(gx, gz);
}

/** Extrai os polígonos fechados (quarteirões) formados pela malha viária planar. */
function extractRoadBlocks(
  roadLines: { lines: number[][] }[],
  centro: { x: number; z: number },
): UrbanBlock[] {
  // 1. Coleta segmentos e encontra cruzamentos internos via grade espacial
  const rawSegs: { x0: number; z0: number; x1: number; z1: number; splits: number[] }[] = [];
  const sGrid = new Map<number, number[]>();
  const CELL = 80;
  for (const group of roadLines) {
    for (const line of group.lines) {
      for (let i = 0; i + 3 < line.length; i += 2) {
        const x0 = line[i], z0 = line[i + 1], x1 = line[i + 2], z1 = line[i + 3];
        if (Math.hypot(x1 - x0, z1 - z0) < 2) continue;
        const id = rawSegs.length;
        rawSegs.push({ x0, z0, x1, z1, splits: [0, 1] });
        const gx0 = Math.floor(Math.min(x0, x1) / CELL), gx1 = Math.floor(Math.max(x0, x1) / CELL);
        const gz0 = Math.floor(Math.min(z0, z1) / CELL), gz1 = Math.floor(Math.max(z0, z1) / CELL);
        for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
          const k = hashKey(gx, gz);
          let list = sGrid.get(k);
          if (!list) sGrid.set(k, (list = []));
          list.push(id);
        }
      }
    }
  }

  const tested = new Set<number>();
  for (const list of sGrid.values()) {
    for (let a = 0; a < list.length; a++) {
      const ia = list[a], sa = rawSegs[ia];
      for (let b = a + 1; b < list.length; b++) {
        const ib = list[b];
        const pair = ia < ib ? ia * 65536 + ib : ib * 65536 + ia;
        if (tested.has(pair)) continue;
        tested.add(pair);
        const sb = rawSegs[ib];
        const dax = sa.x1 - sa.x0, daz = sa.z1 - sa.z0;
        const dbx = sb.x1 - sb.x0, dbz = sb.z1 - sb.z0;
        const det = dax * dbz - daz * dbx;
        if (Math.abs(det) < 1e-3) continue;
        const rx = sb.x0 - sa.x0, rz = sb.z0 - sa.z0;
        const ta = (rx * dbz - rz * dbx) / det;
        const tb = (rx * daz - rz * dax) / det;
        if (ta > 0.01 && ta < 0.99 && tb > -0.02 && tb < 1.02) sa.splits.push(ta);
        if (tb > 0.01 && tb < 0.99 && ta > -0.02 && ta < 1.02) sb.splits.push(tb);
      }
    }
  }

  // 2. Funde nós próximos (tolerância 5 m) e monta grafo de semi-arestas
  const SNAP = 5;
  const nodeGrid = new Map<number, number[]>();
  const nodes: { x: number; z: number }[] = [];
  const getNode = (x: number, z: number): number => {
    const gx = Math.floor(x / SNAP), gz = Math.floor(z / SNAP);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = nodeGrid.get(hashKey(gx + dx, gz + dz));
      if (!list) continue;
      for (const id of list) {
        if (Math.hypot(nodes[id].x - x, nodes[id].z - z) <= SNAP) return id;
      }
    }
    const id = nodes.length;
    nodes.push({ x, z });
    const k = hashKey(gx, gz);
    let list = nodeGrid.get(k);
    if (!list) nodeGrid.set(k, (list = []));
    list.push(id);
    return id;
  };

  const edgeSet = new Set<string>();
  const halfEdges: { from: number; to: number; angle: number; twin: number; visited: boolean }[] = [];
  const adj: number[][] = [];
  const addEdge = (u: number, v: number) => {
    if (u === v) return;
    const key = u < v ? `${u}:${v}` : `${v}:${u}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    while (adj.length <= Math.max(u, v)) adj.push([]);
    const e0 = halfEdges.length, e1 = e0 + 1;
    const dx = nodes[v].x - nodes[u].x, dz = nodes[v].z - nodes[u].z;
    halfEdges.push({ from: u, to: v, angle: Math.atan2(dz, dx), twin: e1, visited: false });
    halfEdges.push({ from: v, to: u, angle: Math.atan2(-dz, -dx), twin: e0, visited: false });
    adj[u].push(e0);
    adj[v].push(e1);
  };

  for (const s of rawSegs) {
    s.splits.sort((a, b) => a - b);
    let prev = getNode(s.x0, s.z0);
    for (let i = 1; i < s.splits.length; i++) {
      if (s.splits[i] - s.splits[i - 1] < 1e-4) continue;
      const t = s.splits[i];
      const cur = getNode(s.x0 + (s.x1 - s.x0) * t, s.z0 + (s.z1 - s.z0) * t);
      addEdge(prev, cur);
      prev = cur;
    }
  }

  for (const list of adj) list.sort((a, b) => halfEdges[a].angle - halfEdges[b].angle);

  // 3. Caminha faces mínimas no grafo planar
  const blocks: UrbanBlock[] = [];
  for (let start = 0; start < halfEdges.length; start++) {
    if (halfEdges[start].visited) continue;
    const cycle: number[] = [];
    let cur = start;
    let steps = 0;
    let closed = false;
    while (steps++ < 64) {
      const he = halfEdges[cur];
      if (he.visited) break;
      he.visited = true;
      cycle.push(he.from);
      const out = adj[he.to];
      const backIdx = out.indexOf(he.twin);
      const next = out[(backIdx - 1 + out.length) % out.length];
      cur = next;
      if (cur === start) { closed = true; break; }
    }
    if (!closed || cycle.length < 3 || cycle.length > 48) continue;

    // Calcula área com sinal, centroide e orientação dominante
    let area2 = 0, cx = 0, cz = 0;
    let bestLen = 0, bestAngle = 0;
    const pts: number[] = [];
    for (let i = 0; i < cycle.length; i++) {
      const a = nodes[cycle[i]], b = nodes[cycle[(i + 1) % cycle.length]];
      pts.push(a.x, a.z);
      const cross = a.x * b.z - b.x * a.z;
      area2 += cross;
      cx += (a.x + b.x) * cross;
      cz += (a.z + b.z) * cross;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len > bestLen) { bestLen = len; bestAngle = Math.atan2(b.z - a.z, b.x - a.x); }
    }
    const area = area2 * 0.5;
    // Mantém apenas faces internas (área positiva limitada; exclui face externa infinita e frestas)
    if (area < 600 || area > 220_000) continue;
    cx /= 3 * area2;
    cz /= 3 * area2;
    const dc = Math.hypot(cx - centro.x, cz - centro.z);
    if (dc > 2700) continue;
    blocks.push({ pts, cx, cz, area, angle: bestAngle, dc });
  }

  blocks.sort((a, b) => a.dc - b.dc);
  return blocks;
}

function buildBairros(): { mesh: MeshData; lots: BairroLot[]; blocks: UrbanBlock[] } {
  const layout = cityLayout();
  const r = rng(202607);

  // 1. Índice espacial de vias (largura inclui calçadas: asfalto / 0,72) e rio
  const segGrid = new Map<number, Segment[]>();
  const addSeg = (s: Segment) => {
    const gx0 = Math.floor(Math.min(s.x0, s.x1) / HASH);
    const gx1 = Math.floor(Math.max(s.x0, s.x1) / HASH);
    const gz0 = Math.floor(Math.min(s.z0, s.z1) / HASH);
    const gz1 = Math.floor(Math.max(s.z0, s.z1) / HASH);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const k = hashKey(gx, gz);
        let list = segGrid.get(k);
        if (!list) segGrid.set(k, (list = []));
        list.push(s);
      }
    }
  };

  layout.roadLines.forEach((group, cls) => {
    const half = group.width / 0.72 / 2;
    for (const line of group.lines) {
      for (let i = 0; i + 3 < line.length; i += 2) {
        addSeg({ x0: line[i], z0: line[i + 1], x1: line[i + 2], z1: line[i + 3], half, cls });
      }
    }
  });
  for (const piece of layout.river.lines) {
    for (let i = 0; i + 3 < piece.length; i += 2) {
      addSeg({
        x0: piece[i], z0: piece[i + 1], x1: piece[i + 2], z1: piece[i + 3],
        half: layout.river.width / 2 + 2.5, cls: RIVER_CLS,
      });
    }
  }

  const gapToCorridors = (x: number, z: number): number => {
    const gx = Math.floor(x / HASH), gz = Math.floor(z / HASH);
    let best = Infinity;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const list = segGrid.get(hashKey(gx + a, gz + b));
        if (!list) continue;
        for (const s of list) {
          const g = distToSegment(s, x, z) - s.half;
          if (g < best) best = g;
        }
      }
    }
    return best;
  };

  const nearestRoadAngle = (x: number, z: number): { gap: number; angle: number } => {
    const gx = Math.floor(x / HASH), gz = Math.floor(z / HASH);
    let bestGap = Infinity;
    let bestAngle = 0;
    for (let a = -2; a <= 2; a++) {
      for (let b = -2; b <= 2; b++) {
        const list = segGrid.get(hashKey(gx + a, gz + b));
        if (!list) continue;
        for (const s of list) {
          if (s.cls === RIVER_CLS) continue;
          const g = distToSegment(s, x, z) - s.half;
          if (g < bestGap) {
            bestGap = g;
            bestAngle = Math.atan2(s.z1 - s.z0, s.x1 - s.x0);
          }
        }
      }
    }
    return { gap: bestGap, angle: bestAngle };
  };

  // 2. Zonas de exclusão: praças, estádios, universidades, aeroporto, pista, hangar, marcos e rampas
  const exclPolys: Poly[] = [
    ...layout.parkPolygons.map((p) => toPoly(p.pts)),
    ...layout.stadiumPolygons.map((p) => toPoly(p.pts)),
    ...layout.universityPolygons.map((p) => toPoly(p.pts)),
    toPoly(layout.airportPolygon),
  ].filter((p): p is Poly => p !== null);

  const inExcludedPoly = (x: number, z: number) => exclPolys.some((p) => pointInPoly(p, x, z));

  const rwyA = layout.runwayLine.a;
  const rwyB = layout.runwayLine.b;
  const rwyLen = Math.hypot(rwyB.x - rwyA.x, rwyB.z - rwyA.z) || 1;
  const rwyUx = (rwyB.x - rwyA.x) / rwyLen;
  const rwyUz = (rwyB.z - rwyA.z) / rwyLen;
  const inRunwayOrHangar = (x: number, z: number) => {
    const dx = x - rwyA.x, dz = z - rwyA.z;
    const s = dx * rwyUx + dz * rwyUz;
    const l = dx * -rwyUz + dz * rwyUx;
    if (s > -130 && s < rwyLen + 130 && Math.abs(l) < 145) return true;
    return x > HANGAR.x0 - 14 && x < HANGAR.x1 + 14 && z > HANGAR.z0 - 14 && z < HANGAR.z1 + 14;
  };

  const reservedCircles = [
    { x: UNIACADEMIA.x, z: UNIACADEMIA.z, r: Math.max(64, UNIACADEMIA.radius + 24) },
    { x: WORKSHOP.x, z: WORKSHOP.z, r: 28 },
    { x: CRISTO_IMPERADOR.x, z: CRISTO_IMPERADOR.z, r: 120 }, // topo do morro do Cristo: só a cruz (e a entrega do heli)
    { x: layout.helipad.x, z: layout.helipad.z, r: 42 }, // torre + rampa externa de 6 m (até ~23 m do centro) + folga
    // entregas no chão, carros estacionados e oficina: nenhuma casa nasce em cima (nem encosta)
    ...protectedSpots().map((q) => ({ x: q.x, z: q.z, r: q.r + 4 })),
  ];

  const rampBoxes = deliveryRampData().ramps.map((q) => ({
    x0: Math.min(q.x0, q.x1) - 12,
    x1: Math.max(q.x0, q.x1) + 12,
    z0: Math.min(q.z0, q.z1) - 12,
    z1: Math.max(q.z0, q.z1) + 12,
  }));

  // 3. Índice espacial de OBBs (inicia com as torres já geradas por world-data.ts)
  const obbGrid = new Map<number, OBB[]>();
  const registerObb = (o: OBB) => {
    const gx0 = Math.floor((o.cx - o.rad) / OBB_CELL);
    const gx1 = Math.floor((o.cx + o.rad) / OBB_CELL);
    const gz0 = Math.floor((o.cz - o.rad) / OBB_CELL);
    const gz1 = Math.floor((o.cz + o.rad) / OBB_CELL);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const k = hashKey(gx, gz);
        let list = obbGrid.get(k);
        if (!list) obbGrid.set(k, (list = []));
        list.push(o);
      }
    }
  };
  const hasOverlap = (o: OBB, padHouse: number): boolean => {
    const rSearch = o.rad + Math.max(padHouse, 1.5);
    const gx0 = Math.floor((o.cx - rSearch) / OBB_CELL);
    const gx1 = Math.floor((o.cx + rSearch) / OBB_CELL);
    const gz0 = Math.floor((o.cz - rSearch) / OBB_CELL);
    const gz1 = Math.floor((o.cz + rSearch) / OBB_CELL);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const list = obbGrid.get(hashKey(gx, gz));
        if (!list) continue;
        for (const other of list) {
          if (obbOverlap(o, other, other.tower ? 1.5 : padHouse)) return true;
        }
      }
    }
    return false;
  };

  for (const b of layout.buildings) {
    const hw = (b.x1 - b.x0) / 2, hd = (b.z1 - b.z0) / 2;
    registerObb({
      cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2,
      hw, hd, rx: 1, rz: 0, fx: 0, fz: 1, rad: Math.hypot(hw, hd), tower: true,
    });
  }

  // 4. Densidade urbana + extração de quarteirões fechados
  const centro = layout.landmarks.centro;
  const neighborhoods = layout.neighborhoods;
  const bounds = layout.bounds;
  const minX = bounds.x0 + 60, maxX = bounds.x1 - 60;
  const minZ = bounds.z0 + 60, maxZ = bounds.z1 - 60;
  const blocks = extractRoadBlocks(layout.roadLines, centro);

  const nearestNeighborhoodDist = (x: number, z: number): number => {
    let best2 = Infinity;
    for (let i = 0; i < neighborhoods.length; i++) {
      const dx = x - neighborhoods[i].x, dz = z - neighborhoods[i].z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best2) best2 = d2;
    }
    return Math.sqrt(best2);
  };

  const densityAt = (x: number, z: number, elev: number, slope: number): { prob: number; dc: number } => {
    const dc = Math.hypot(x - centro.x, z - centro.z);
    const centerFactor = Math.exp(-((dc / 1750) ** 2));
    const dNeigh = nearestNeighborhoodDist(x, z);
    const neighBoost = 0.55 * Math.exp(-((dNeigh / 420) ** 2));
    const elevFactor = 1 - 0.58 * smoothstep(110, 230, elev);
    const slopeFactor = 1 - smoothstep(0.24, MAX_SLOPE, slope);
    const periphFactor = 1 - 0.68 * smoothstep(2450, 3200, dc);
    const prob = Math.min(1.0, (0.16 + 0.95 * centerFactor + neighBoost) * elevFactor * slopeFactor * periphFactor);
    return { prob, dc };
  };

  // 5. Buffers da malha única
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const lots: BairroLot[] = [];

  const pushVert = (x: number, y: number, z: number, c: [number, number, number], u = ROOF_UV, v = ROOF_UV): number => {
    const id = pos.length / 3;
    pos.push(x, y, z);
    col.push(c[0], c[1], c[2], 255);
    uv.push(u, v);
    return id;
  };

  const scaleRgb = (c: [number, number, number], s: number): [number, number, number] => [
    Math.min(255, Math.round(c[0] * s)),
    Math.min(255, Math.round(c[1] * s)),
    Math.min(255, Math.round(c[2] * s)),
  ];

  const tryPlace = (
    cx: number,
    cz: number,
    angle: number,
    densityMul: number,
    sizeHint?: { w: number; d: number },
    tight = true,
  ): { placed: boolean; w: number; d: number } => {
    const roll = r();
    const sizeR1 = r(), sizeR2 = r(), floorR = r(), roofR = r();
    const wallR = r(), tileR = r(), shadeR = r(), winR = r();

    const dcQuick = Math.hypot(cx - centro.x, cz - centro.z);
    const nearCentro = dcQuick < 1050;
    const w = sizeHint?.w ?? (nearCentro ? 14 + sizeR1 * 8 : 12 + sizeR1 * 8);
    const d = sizeHint?.d ?? (nearCentro ? 12 + sizeR2 * 6 : 10.5 + sizeR2 * 6.5);

    if (pos.length / 3 >= MAX_VERTS - 48) return { placed: false, w, d };
    if (cx < minX || cx > maxX || cz < minZ || cz > maxZ) return { placed: false, w, d };

    const elev = terrainHeight(cx, cz);
    const slope = terrainSlope(cx, cz);
    if (slope > MAX_SLOPE) return { placed: false, w, d };

    const { prob, dc } = densityAt(cx, cz, elev, slope);
    if (roll > prob * densityMul) return { placed: false, w, d };

    if (inRunwayOrHangar(cx, cz) || inExcludedPoly(cx, cz)) return { placed: false, w, d };
    if (reservedCircles.some((q) => Math.hypot(cx - q.x, cz - q.z) < q.r)) return { placed: false, w, d };
    if (rampBoxes.some((q) => cx > q.x0 && cx < q.x1 && cz > q.z0 && cz < q.z1)) return { placed: false, w, d };
    if (gapToCorridors(cx, cz) < ROAD_MARGIN + 1.5) return { placed: false, w, d };

    const hw = w / 2, hd = d / 2;
    const rx = Math.cos(angle), rz = Math.sin(angle);
    const fx = -rz, fz = rx;
    const obb: OBB = { cx, cz, hw, hd, rx, rz, fx, fz, rad: Math.hypot(hw, hd) };

    // Casas encostadas umas nas outras nas áreas urbanas (folga mínima 0,12 m; 0,6 m na periferia)
    const padHouse = tight ? (dc < 2000 ? 0.12 : 0.6) : 0.9;
    if (hasOverlap(obb, padHouse)) return { placed: false, w, d };

    // Conferência nos 4 cantos contra vias, rio, polígonos e desnível
    const cOff = [
      [-hw, +hd], [+hw, +hd], [+hw, -hd], [-hw, -hd],
    ] as const;
    let hMin = elev, hMax = elev;
    for (const [lu, lv] of cOff) {
      const px = cx + lu * rx + lv * fx;
      const pz = cz + lu * rz + lv * fz;
      if (gapToCorridors(px, pz) < ROAD_MARGIN) return { placed: false, w, d };
      if (inExcludedPoly(px, pz) || inRunwayOrHangar(px, pz)) return { placed: false, w, d };
      if (reservedCircles.some((q) => Math.hypot(px - q.x, pz - q.z) < q.r - 2)) return { placed: false, w, d };
      if (rampBoxes.some((q) => px > q.x0 && px < q.x1 && pz > q.z0 && pz < q.z1)) return { placed: false, w, d };
      const ch = terrainHeight(px, pz);
      if (ch < hMin) hMin = ch;
      if (ch > hMax) hMax = ch;
    }
    // Perímetro inteiro (meios e quartos dos lados): uma via que corta o lote entre dois cantos também o reprova
    for (const [lu, lv] of [[0, hd], [0, -hd], [hw, 0], [-hw, 0], [-hw / 2, hd], [hw / 2, hd], [-hw / 2, -hd], [hw / 2, -hd], [hw, hd / 2], [hw, -hd / 2], [-hw, hd / 2], [-hw, -hd / 2]] as const) {
      if (gapToCorridors(cx + lu * rx + lv * fx, cz + lu * rz + lv * fz) < ROAD_MARGIN * 0.6) return { placed: false, w, d };
    }
    if (hMax - hMin > MAX_FOOTPRINT_DROP) return { placed: false, w, d };

    // Andares: 2 a 6 perto do Centro; 1 a 2 nos bairros (com prédios de 3-5 espalhados)
    let floors: number;
    if (dc < 950) {
      floors = floorR < 0.24 ? 2 : floorR < 0.52 ? 3 : floorR < 0.76 ? 4 : floorR < 0.90 ? 5 : 6;
    } else if (dc < 1650) {
      floors = floorR < 0.38 ? 1 : floorR < 0.76 ? 2 : floorR < 0.90 ? 3 : floorR < 0.97 ? 4 : 5;
    } else {
      floors = floorR < 0.58 ? 1 : floorR < 0.93 ? 2 : 3;
    }

    // Telhados: predominância forte de telha vermelha (duas e quatro águas), laje nos prédios mais altos
    const roof: RoofKind =
      floors >= 5
        ? (roofR < 0.65 ? 'slab' : 'hip')
        : floors >= 3
          ? (roofR < 0.30 ? 'slab' : roofR < 0.70 ? 'hip' : 'gable')
          : (roofR < 0.50 ? 'hip' : roofR < 0.92 ? 'gable' : 'slab');

    // Alturas assentadas no relevo (base abaixo do menor canto; piso acima do maior)
    const yBase = hMin - 1.0;
    const yGround = hMax;
    const yEave = yGround + floors * FLOOR_H;
    const ridgeH = roof === 'slab' ? 0.16 : Math.min(w, d) * 0.23 + 0.55;
    const yTop = yEave + ridgeH;

    // Cores realistas de Juiz de Fora: paredes claras/médias, telhas cerâmicas variadas e lajes discretas
    const shade = 0.91 + shadeR * 0.12;
    const wallTop = scaleRgb(WALL_COLORS[Math.floor(wallR * WALL_COLORS.length)], shade);
    const wallBot = scaleRgb(wallTop, 0.94);
    const roofBase = roof === 'slab'
      ? scaleRgb(SLAB_COLORS[Math.floor(tileR * SLAB_COLORS.length)], shade)
      : scaleRgb(TILE_COLORS[Math.floor(tileR * TILE_COLORS.length)], 0.90 + shadeR * 0.16);
    const roofPeak = scaleRgb(roofBase, 1.12);

    const toW = (u: number, y: number, v: number): [number, number, number] => [
      cx + u * rx + v * fx,
      y,
      cz + u * rz + v * fz,
    ];

    const pushBox = (
      u0: number, u1: number, v0: number, v1: number,
      by0: number, by1: number,
      botCol: [number, number, number], topCol: [number, number, number],
    ) => {
      const b0 = pushVert(...toW(u0, by0, v1), botCol);
      const b1 = pushVert(...toW(u1, by0, v1), botCol);
      const b2 = pushVert(...toW(u1, by0, v0), botCol);
      const b3 = pushVert(...toW(u0, by0, v0), botCol);
      const t0 = pushVert(...toW(u0, by1, v1), topCol);
      const t1 = pushVert(...toW(u1, by1, v1), topCol);
      const t2 = pushVert(...toW(u1, by1, v0), topCol);
      const t3 = pushVert(...toW(u0, by1, v0), topCol);
      const b = [b0, b1, b2, b3], t = [t0, t1, t2, t3];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        idx.push(b[i], b[j], t[j], b[i], t[j], t[i]);
      }
      idx.push(t0, t1, t2, t0, t2, t3);
    };

    // Recuo frontal + muro baixo nas casas (1-2 andares com telhado cerâmico, sempre dentro do lote validado)
    const hasFrontWall = floors <= 2 && roof !== 'slab' && d >= 8.5 && (winR < 0.72);
    const setback = hasFrontWall ? 1.55 : 0;
    const vFront = hd - setback;
    const vBack = -hd;
    const vMid = (vFront + vBack) / 2;
    const dHouse = vFront - vBack;

    // Fachadas texturizadas pelo mesmo atlas dos prédios do Centro (8 vértices com U ping-pong):
    // - Térreo comercial (cols 0..3) em parte dos sobrados/prédios baixos do Centro e avenidas
    // - Térreo residencial com porta e janelas com caixilho (cols 4..7) nas casas e demais sobrados
    const isCommercial = (dc < 950 && winR < 0.60) || (floors >= 3 && dc < 1450 && winR < 0.35);
    const cols = Math.min(4, Math.max(2, Math.round(Math.max(w, dHouse) / 3.4)));
    const uA = isCommercial ? 0 : 0.5;
    const uB = uA + cols / TEX_WINDOWS;
    const vBot = Math.max(-0.012, ((yBase - yGround) / FLOOR_H) / TEX_ROWS);
    const vTop = floors / TEX_ROWS;

    // Paredes (8 vértices, 8 triângulos — janelas com caixilho e portas nas 4 faces)
    const wb0 = pushVert(...toW(-hw, yBase, vFront), wallBot, uA, vBot);
    const wb1 = pushVert(...toW(+hw, yBase, vFront), wallBot, uB, vBot);
    const wb2 = pushVert(...toW(+hw, yBase, vBack), wallBot, uA, vBot);
    const wb3 = pushVert(...toW(-hw, yBase, vBack), wallBot, uB, vBot);
    const wt0 = pushVert(...toW(-hw, yEave, vFront), wallTop, uA, vTop);
    const wt1 = pushVert(...toW(+hw, yEave, vFront), wallTop, uB, vTop);
    const wt2 = pushVert(...toW(+hw, yEave, vBack), wallTop, uA, vTop);
    const wt3 = pushVert(...toW(-hw, yEave, vBack), wallTop, uB, vTop);
    const wb = [wb0, wb1, wb2, wb3];
    const wt = [wt0, wt1, wt2, wt3];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      idx.push(wb[i], wb[j], wt[j], wb[i], wt[j], wt[i]);
    }

    // Muro baixo na frente do lote (com vão lateral de portão/garagem)
    if (hasFrontWall) {
      const muroTop = scaleRgb(MURO_COLORS[Math.floor(shadeR * MURO_COLORS.length)], shade);
      const muroBot = scaleRgb(muroTop, 0.86);
      const yMuro = yGround + 1.22;
      const uEnd = hw * 0.44;
      pushBox(-hw, uEnd, hd - 0.36, hd, yBase, yMuro, muroBot, muroTop);
    }

    // Telhado (beiral de 0,32 m nas telhas; usa ROOF_UV liso sem janelas)
    const ov = 0.32;
    const ohw = hw + ov;
    const ovFront = vFront + ov;
    const ovBack = vBack - ov;
    const yOver = yEave - 0.12;
    if (roof === 'slab') {
      const s0 = pushVert(...toW(-hw, yTop, vFront), roofBase);
      const s1 = pushVert(...toW(+hw, yTop, vFront), roofBase);
      const s2 = pushVert(...toW(+hw, yTop, vBack), roofBase);
      const s3 = pushVert(...toW(-hw, yTop, vBack), roofBase);
      idx.push(s0, s1, s2, s0, s2, s3);
      // Caixa d'água / casa de máquinas discreta no canto da laje
      if (floors >= 3) {
        const mw = Math.min(w * 0.28, 3.2), md = Math.min(dHouse * 0.28, 3.0);
        const mh = floors >= 5 ? 2.1 : 1.5;
        const sx = wallR < 0.5 ? -1 : 1, sz = tileR < 0.5 ? -1 : 1;
        const uC = sx * (hw - mw / 2 - 0.9), vC = vMid + sz * (dHouse / 2 - md / 2 - 0.9);
        const tankBot = scaleRgb(roofBase, 0.92);
        const tankTop = scaleRgb(roofBase, 1.08);
        pushBox(uC - mw / 2, uC + mw / 2, vC - md / 2, vC + md / 2, yTop, yTop + mh, tankBot, tankTop);
      }
    } else if (roof === 'gable') {
      if (w >= dHouse) {
        // Oitões de reboco liso (UV separado das paredes para não esticar janelas no triângulo)
        const g1 = pushVert(...toW(+hw, yEave, vFront), wallTop);
        const g2 = pushVert(...toW(+hw, yEave, vBack), wallTop);
        const g3 = pushVert(...toW(-hw, yEave, vBack), wallTop);
        const g0 = pushVert(...toW(-hw, yEave, vFront), wallTop);
        const gL = pushVert(...toW(-hw, yTop, vMid), wallTop);
        const gR = pushVert(...toW(+hw, yTop, vMid), wallTop);
        idx.push(g1, g2, gR, g3, g0, gL);
        const r0 = pushVert(...toW(-ohw, yOver, ovFront), roofBase);
        const r1 = pushVert(...toW(+ohw, yOver, ovFront), roofBase);
        const r2 = pushVert(...toW(+ohw, yOver, ovBack), roofBase);
        const r3 = pushVert(...toW(-ohw, yOver, ovBack), roofBase);
        const rL = pushVert(...toW(-ohw, yTop, vMid), roofPeak);
        const rR = pushVert(...toW(+ohw, yTop, vMid), roofPeak);
        idx.push(r0, r1, rR, r0, rR, rL, r2, r3, rL, r2, rL, rR);
      } else {
        const g0 = pushVert(...toW(-hw, yEave, vFront), wallTop);
        const g1 = pushVert(...toW(+hw, yEave, vFront), wallTop);
        const g2 = pushVert(...toW(+hw, yEave, vBack), wallTop);
        const g3 = pushVert(...toW(-hw, yEave, vBack), wallTop);
        const gF = pushVert(...toW(0, yTop, vFront), wallTop);
        const gB = pushVert(...toW(0, yTop, vBack), wallTop);
        idx.push(g0, g1, gF, g2, g3, gB);
        const r0 = pushVert(...toW(-ohw, yOver, ovFront), roofBase);
        const r1 = pushVert(...toW(+ohw, yOver, ovFront), roofBase);
        const r2 = pushVert(...toW(+ohw, yOver, ovBack), roofBase);
        const r3 = pushVert(...toW(-ohw, yOver, ovBack), roofBase);
        const rF = pushVert(...toW(0, yTop, ovFront), roofPeak);
        const rB = pushVert(...toW(0, yTop, ovBack), roofPeak);
        idx.push(r1, r2, rB, r1, rB, rF, r3, r0, rF, r3, rF, rB);
      }
    } else {
      const r0 = pushVert(...toW(-ohw, yOver, ovFront), roofBase);
      const r1 = pushVert(...toW(+ohw, yOver, ovFront), roofBase);
      const r2 = pushVert(...toW(+ohw, yOver, ovBack), roofBase);
      const r3 = pushVert(...toW(-ohw, yOver, ovBack), roofBase);
      if (Math.abs(w - dHouse) < 2.0) {
        const apex = pushVert(...toW(0, yTop, vMid), roofPeak);
        idx.push(r0, r1, apex, r1, r2, apex, r2, r3, apex, r3, r0, apex);
      } else if (w >= dHouse) {
        const rl = Math.min(ohw * 0.62, (w - dHouse) * 0.46);
        const rL = pushVert(...toW(-rl, yTop, vMid), roofPeak);
        const rR = pushVert(...toW(+rl, yTop, vMid), roofPeak);
        idx.push(r0, r1, rR, r0, rR, rL, r1, r2, rR, r2, r3, rL, r2, rL, rR, r3, r0, rL);
      } else {
        const ohd = dHouse / 2 + ov;
        const rl = Math.min(ohd * 0.62, (dHouse - w) * 0.46);
        const rF = pushVert(...toW(0, yTop, vMid + rl), roofPeak);
        const rB = pushVert(...toW(0, yTop, vMid - rl), roofPeak);
        idx.push(r0, r1, rF, r1, r2, rB, r1, rB, rF, r2, r3, rB, r3, r0, rF, r3, rF, rB);
      }
    }

    registerObb(obb);
    lots.push({ cx, cz, w, d, angle, floors, roof, yBase, yGround, yTop });
    return { placed: true, w, d };
  };

  const shuffle = <T>(arr: T[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  };

  // 6. Passo 1: preenchimento denso dos quarteirões fechados formados pelas vias (mais próximos do Centro primeiro)
  const CAP_BLOCKS = 19_500;
  for (const blk of blocks) {
    if (pos.length / 3 >= CAP_BLOCKS) break;
    const poly = toPoly(blk.pts);
    if (!poly) continue;
    const cos = Math.cos(blk.angle), sin = Math.sin(blk.angle);
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (let i = 0; i < blk.pts.length; i += 2) {
      const dx = blk.pts[i] - blk.cx, dz = blk.pts[i + 1] - blk.cz;
      const u = dx * cos + dz * sin, v = -dx * sin + dz * cos;
      if (u < uMin) uMin = u; if (u > uMax) uMax = u;
      if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    }
    const blockDens = blk.dc < 1300 ? 2.5 : blk.dc < 2000 ? 1.8 : 1.15;
    let row = 0;
    for (let v = vMin + 4; v <= vMax - 4; ) {
      if (pos.length / 3 >= CAP_BLOCKS) break;
      const rowD = blk.dc < 1100 ? 15 + r() * 6 : 13.5 + r() * 6;
      const alley = blk.dc < 1400 ? 0.9 + r() * 1.4 : 1.8 + r() * 2.4;
      const faceAngle = row % 2 === 0 ? blk.angle : blk.angle + Math.PI;
      for (let u = uMin + 4; u <= uMax - 4; ) {
        if (pos.length / 3 >= CAP_BLOCKS) break;
        const lotW = blk.dc < 1100 ? 16 + r() * 8 : 14.5 + r() * 7.5;
        const wx = blk.cx + u * cos - v * sin;
        const wz = blk.cz + u * sin + v * cos;
        if (pointInPoly(poly, wx, wz)) {
          let res = tryPlace(wx, wz, faceAngle, blockDens, { w: lotW, d: rowD }, true);
          // Se o lote grande não coube no miolo estreito, tenta um sobrado compacto
          if (!res.placed) res = tryPlace(wx, wz, faceAngle, blockDens, { w: 10.5, d: 9.5 }, true);
          u += res.placed ? res.w + (blk.dc < 1500 ? 0.25 + r() * 0.45 : 0.7 + r() * 1.2) : 6.5;
        } else {
          u += 6.5;
        }
      }
      v += rowD + alley;
      row++;
    }
  }

  // 7. Passo 2: fileiras contínuas (casas e prédios encostados) ao longo de todas as vias urbanas
  const roadCandidates: { line: number[]; cls: number; roadHalf: number; dc: number }[] = [];
  layout.roadLines.forEach((group, cls) => {
    if (cls === 0) return; // motorway (BR-040): sem fachadas coladas à rodovia
    const roadHalf = group.width / 0.72 / 2;
    for (const line of group.lines) {
      if (line.length < 4) continue;
      const mid = (Math.floor(line.length / 4)) * 2;
      const dc = Math.hypot(line[mid] - centro.x, line[mid + 1] - centro.z);
      roadCandidates.push({ line, cls, roadHalf, dc });
    }
  });
  const centroRoads = shuffle(roadCandidates.filter((c) => c.dc < 1050));
  const midRoads = shuffle(roadCandidates.filter((c) => c.dc >= 1050 && c.dc < 2000));
  const outerRoads = shuffle(roadCandidates.filter((c) => c.dc >= 2000));

  const walkRoads = (list: typeof roadCandidates, rows: number, densMul: number, vertCap: number) => {
    for (const { line, roadHalf } of list) {
      if (pos.length / 3 >= vertCap) break;
      for (const side of [-1, 1] as const) {
        let acc = 0;
        let next = 5 + r() * 3;
        for (let i = 0; i + 3 < line.length; i += 2) {
          const ax = line[i], az = line[i + 1], bx = line[i + 2], bz = line[i + 3];
          const segLen = Math.hypot(bx - ax, bz - az);
          if (segLen < 1) continue;
          const tx = (bx - ax) / segLen, tz = (bz - az) / segLen;
          const nx = -tz, nz = tx;
          const baseAngle = Math.atan2(tz, tx);
          const faceAngle = side === 1 ? baseAngle + Math.PI : baseAngle;
          while (next <= acc + segLen) {
            if (pos.length / 3 >= vertCap) break;
            const t = (next - acc) / segLen;
            const px = ax + (bx - ax) * t;
            const pz = az + (bz - az) * t;
            const dc = Math.hypot(px - centro.x, pz - centro.z);
            const lotW = dc < 1200 ? 16 + r() * 8 : 14 + r() * 7.5;
            const lotD = dc < 1200 ? 14 + r() * 6 : 12.5 + r() * 5.5;
            const off1 = roadHalf + ROAD_MARGIN + lotD / 2 + 0.35 + r() * 0.8;
            let res = tryPlace(px + nx * side * off1, pz + nz * side * off1, faceAngle, densMul, { w: lotW, d: lotD }, true);
            if (!res.placed && dc < 1700) {
              const smOff = roadHalf + ROAD_MARGIN + 5.2;
              res = tryPlace(px + nx * side * smOff, pz + nz * side * smOff, faceAngle, densMul, { w: 10.5, d: 9.5 }, true);
            }
            if (rows >= 2 && (dc < 2000 || r() < 0.7)) {
              const off2 = off1 + lotD + 1.4 + r() * 2.0;
              tryPlace(px + nx * side * off2, pz + nz * side * off2, faceAngle, densMul * 0.95, { w: lotW, d: lotD }, true);
            }
            if (rows >= 3 && dc < 1550 && r() < 0.78) {
              const off3 = off1 + (lotD + 1.8) * 2 + r() * 1.6;
              tryPlace(px + nx * side * off3, pz + nz * side * off3, faceAngle, densMul * 0.9, { w: lotW, d: lotD }, true);
            }
            const gap = dc < 1600 ? 0.25 + r() * 0.55 : 0.8 + r() * 1.8;
            next += res.placed ? res.w + gap : 5.5;
          }
          acc += segLen;
        }
      }
    }
  };

  walkRoads(centroRoads, 3, 2.2, 23_800);
  walkRoads(midRoads, 2, 1.55, 39_500);
  walkRoads(outerRoads, 2, 1.15, 42_000);

  // 8. Passo 3: preenchimento do miolo restante nos bairros próximos às vias ou núcleos
  const PITCH = 20;
  const gridCells: [number, number][] = [];
  for (let gz = minZ; gz <= maxZ; gz += PITCH) {
    for (let gx = minX; gx <= maxX; gx += PITCH) gridCells.push([gx, gz]);
  }
  shuffle(gridCells);

  for (const [gx, gz] of gridCells) {
    if (pos.length / 3 >= MAX_VERTS - 48) break;
    const cx = gx + (r() - 0.5) * 5;
    const cz = gz + (r() - 0.5) * 5;
    const near = nearestRoadAngle(cx, cz);
    const dNeigh = nearestNeighborhoodDist(cx, cz);
    if (near.gap > 170 && dNeigh > 290) continue;
    const angle = near.gap < 170 ? near.angle : (Math.floor(r() * 4) * Math.PI) / 2;
    tryPlace(cx, cz, angle, 1.1, { w: 15 + r() * 7, d: 13 + r() * 5 }, true);
  }

  return {
    mesh: { pos, idx, col, uv, normals: calculateNormals(pos, idx) },
    lots,
    blocks,
  };
}

let cache: { mesh: MeshData; lots: BairroLot[]; blocks: UrbanBlock[] } | undefined;
const cached = () => (cache ??= buildBairros());

/** Malha única dos bairros de Juiz de Fora (cor por vértice, determinística). */
export function bairrosData(): MeshData {
  return cached().mesh;
}

/** Metadados dos lotes gerados (posições, andares, telhados e cotas) para inspeção e testes. */
export function bairrosLots(): readonly BairroLot[] {
  return cached().lots;
}

/** Quarteirões fechados extraídos da malha viária de Juiz de Fora. */
export function bairrosBlocks(): readonly UrbanBlock[] {
  return cached().blocks;
}

/** Reconstrói sem cache (útil para validar determinismo em testes). */
export function buildBairrosMesh(): MeshData {
  return buildBairros().mesh;
}
