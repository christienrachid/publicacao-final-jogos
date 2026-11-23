import { calculateNormals } from 'playcanvas';
import { clamp01, fbm, rng, smoothstep } from './noise';
import jf from './jf-mundo.json';
import { buildNodeGraph, type RoadGraph } from './road-graph';

// ---------------------------------------------------------------------------
// Juiz de Fora (MG), versão leve: dados reais do OpenStreetMap + relevo AWS Terrain Tiles,
// projetados e escalados por scripts/importar-jf.mjs (ESCALA 0,5) em src/flight/jf-mundo.json.
// Dados: © colaboradores do OpenStreetMap (ODbL).
// ---------------------------------------------------------------------------

export type MeshData = { pos: number[]; normals: number[]; idx: number[]; col: number[]; uv?: number[] };
const geometry = (pos: number[], idx: number[], col: number[], uv?: number[]): MeshData =>
  ({ pos, idx, col, uv, normals: calculateNormals(pos, idx) });

export type ImageData = {
  width: number; height: number;
  rectangles: { color: string; x: number; y: number; width: number; height: number }[];
  gradient: [number, string][];
};
const image = (width: number, height: number): ImageData => ({ width, height, rectangles: [], gradient: [] });
function painter(data: ImageData) {
  return {
    fillStyle: '' as string | { addColorStop: (offset: number, color: string) => void },
    createLinearGradient: (..._coordinates: number[]) => ({
      addColorStop: (offset: number, color: string) => { data.gradient.push([offset, color]); },
    }),
    fillRect(x: number, y: number, width: number, height: number) {
      if (typeof this.fillStyle === 'string') data.rectangles.push({ color: this.fillStyle, x, y, width, height });
    },
  };
}

export const WORLD_SIZE = 6000;
/** Retângulo ocupado pela cidade (ruas, bairros); o resto do mundo é só relevo. */
export const CITY = { x0: -2600, x1: 2600, z0: -2950, z1: 1450 };
/** Altura do Centro (m): referência do relevo; já não existe um "chão da cidade" plano. */
export const CITY_Y = 8;

// ---------------------------------------------------------------------------
// Relevo: grade de 30 m (a mesma malha do terreno e da física)
// ---------------------------------------------------------------------------
const GRID_N = jf.relevo.n, GRID_STEP = jf.relevo.passo, GRID_HALF = jf.relevo.meio;

function decodeGrid(b64: string) {
  const s = atob(b64), view = new DataView(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) view.setUint8(i, s.charCodeAt(i));
  const out = new Float32Array(GRID_N * GRID_N);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 10;
  return out;
}

/** Interpola na mesma diagonal b-c da malha do terreno (idx a,c,b e b,c,d): física e visual coincidem. */
function sampleGrid(g: Float32Array, x: number, z: number) {
  const fx = (Math.max(-GRID_HALF, Math.min(GRID_HALF, x)) + GRID_HALF) / GRID_STEP;
  const fz = (Math.max(-GRID_HALF, Math.min(GRID_HALF, z)) + GRID_HALF) / GRID_STEP;
  const i = Math.min(GRID_N - 2, Math.floor(fx)), j = Math.min(GRID_N - 2, Math.floor(fz));
  const u = fx - i, v = fz - j, a = g[j * GRID_N + i], b = g[j * GRID_N + i + 1], c = g[(j + 1) * GRID_N + i], d = g[(j + 1) * GRID_N + i + 1];
  return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
}

/** Filtro gaussiano separável (sigma em células): tira picos e serrilhados do DEM sem rebaixar os morros. */
function gaussianBlur(src: Float32Array, sigma: number) {
  const radius = Math.ceil(sigma * 3), kernel = Array.from({ length: radius * 2 + 1 }, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma)));
  const sum = kernel.reduce((a, b) => a + b, 0);
  const pass = (from: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(from.length);
    for (let j = 0; j < GRID_N; j++) for (let i = 0; i < GRID_N; i++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const ii = horizontal ? Math.max(0, Math.min(GRID_N - 1, i + k)) : i, jj = horizontal ? j : Math.max(0, Math.min(GRID_N - 1, j + k));
        acc += from[jj * GRID_N + ii] * kernel[k + radius];
      }
      out[j * GRID_N + i] = acc / sum;
    }
    return out;
  };
  return pass(pass(src, true), false);
}
export const DEM_SMOOTH_SIGMA = 2.6;
/** Amplitude do relevo em torno do Centro (8 m): 0,85 arredonda os morros sem achatá-los. */
export const DEM_AMPLITUDE = .85;
const rawGrid = gaussianBlur(decodeGrid(jf.relevo.dm), DEM_SMOOTH_SIGMA).map((v) => Math.max(2, 8 + (v - 8) * DEM_AMPLITUDE));
const rawHeight = (x: number, z: number) => sampleGrid(rawGrid, x, z);

// ---------------------------------------------------------------------------
// Índice espacial das vias e do rio (distância até o eixo)
// ---------------------------------------------------------------------------
export const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'] as const;
export type RoadClass = typeof ROAD_CLASSES[number];
/** Largura do asfalto por categoria (m). A faixa desenhada inclui as calçadas (14% de cada lado). */
const ASPHALT = [7, 7, 7, 7, 7]; // via única de mão única: largura única de 7 m
const stripWidth = (cls: number) => ASPHALT[cls] / 0.72;
const LIFT = [.44, .41, .38, .35, .32];
const RIVER_WIDTH = 12;

interface Segment { x0: number; z0: number; x1: number; z1: number; half: number; cls: number }
const HASH = 64;
const hashKey = (gx: number, gz: number) => gx * 4096 + gz;
/** Catmull-Rom centrípeto: passa por todos os vértices do OSM (pontas e cruzamentos preservados) e arredonda as quinas. */
function smoothLine(way: number[], step: number): number[] {
  const n = way.length / 2;
  if (n < 3) return way;
  const P = (i: number): [number, number] => {
    if (i < 0) return [2 * way[0] - way[2], 2 * way[1] - way[3]];
    if (i >= n) return [2 * way[(n - 1) * 2] - way[(n - 2) * 2], 2 * way[(n - 1) * 2 + 1] - way[(n - 2) * 2 + 1]];
    return [way[i * 2], way[i * 2 + 1]];
  };
  const out = [way[0], way[1]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    if (len < 1e-3) continue;
    const k = Math.ceil(len / step);
    const dt = (a: [number, number], b: [number, number]) => Math.max(1e-3, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
    const t0 = 0, t1 = t0 + dt(p0, p1), t2 = t1 + dt(p1, p2), t3 = t2 + dt(p2, p3);
    for (let j = 1; j < k; j++) {
      const t = t1 + (t2 - t1) * j / k, pt: number[] = [];
      for (let c = 0; c < 2; c++) {
        const a1 = ((t1 - t) * p0[c] + (t - t0) * p1[c]) / (t1 - t0), a2 = ((t2 - t) * p1[c] + (t - t1) * p2[c]) / (t2 - t1), a3 = ((t3 - t) * p2[c] + (t - t2) * p3[c]) / (t3 - t2);
        const b1 = ((t2 - t) * a1 + (t - t0) * a2) / (t2 - t0), b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
        pt.push(((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1));
      }
      out.push(pt[0], pt[1]);
    }
    out.push(p2[0], p2[1]);
  }
  return out;
}
// ---------------------------------------------------------------------------
// Simplificação viária (jogo arcade): uma faixa só, mão única, sem pistas duplas paralelas nem cotos
// ---------------------------------------------------------------------------
interface NetLine { cls: number; pts: number[] }
const polyLength = (p: number[]) => { let s = 0; for (let i = 0; i + 3 < p.length; i += 2) s += Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]); return s; };
function nearestOnPoly(p: number[], x: number, z: number) {
  let best = { d: Infinity, x: p[0], z: p[1], tx: 1, tz: 0 };
  for (let i = 0; i + 3 < p.length; i += 2) {
    const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], len2 = dx * dx + dz * dz, t = len2 ? Math.max(0, Math.min(1, ((x - p[i]) * dx + (z - p[i + 1]) * dz) / len2)) : 0;
    const qx = p[i] + dx * t, qz = p[i + 1] + dz * t, d = Math.hypot(x - qx, z - qz);
    if (d < best.d) { const l = Math.sqrt(len2) || 1; best = { d, x: qx, z: qz, tx: dx / l, tz: dz / l }; }
  }
  return best;
}
function simplifyNetwork(input: NetLine[]): NetLine[] {
  let lines = input.filter((l) => l.pts.length >= 4).map((l) => ({ cls: l.cls, pts: l.pts.slice() }));
  // 1. pistas duplas (dual carriageway do OSM): duas vias paralelas em sentidos opostos viram uma só, no meio
  const CELL = 128, bbox = lines.map((l) => { const xs = l.pts.filter((_, i) => i % 2 === 0), zs = l.pts.filter((_, i) => i % 2 === 1); return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]; });
  const cells = new Map<number, number[]>();
  bbox.forEach((b, i) => { for (let gx = Math.floor((b[0] - 36) / CELL); gx <= Math.floor((b[1] + 36) / CELL); gx++) for (let gz = Math.floor((b[2] - 36) / CELL); gz <= Math.floor((b[3] + 36) / CELL); gz++) { const k = hashKey(gx, gz); let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(i); } });
  const ratio = (a: number[], b: number[]) => {
    let hits = 0, total = 0;
    for (let i = 0; i + 3 < a.length; i += 2) {
      const dx = a[i + 2] - a[i], dz = a[i + 3] - a[i + 1], len = Math.hypot(dx, dz) || 1, n = Math.max(1, Math.round(len / 8));
      for (let k = 0; k < n; k++) {
        const x = a[i] + dx * (k + .5) / n, z = a[i + 1] + dz * (k + .5) / n, nb = nearestOnPoly(b, x, z);
        total++;
        if (nb.d >= 2 && nb.d <= 34 && (dx * nb.tx + dz * nb.tz) / len < -.8) hits++;
      }
    }
    return total ? hits / total : 0;
  };
  const pairs: { a: number; b: number; r: number }[] = [], seen = new Set<number>();
  for (const list of cells.values()) for (let u = 0; u < list.length; u++) for (let v = u + 1; v < list.length; v++) {
    const a = Math.min(list[u], list[v]), b = Math.max(list[u], list[v]), key = a * 100000 + b;
    if (seen.has(key)) continue; seen.add(key);
    if (polyLength(lines[a].pts) < 20 || polyLength(lines[b].pts) < 20) continue;
    const r1 = ratio(lines[a].pts, lines[b].pts), r2 = ratio(lines[b].pts, lines[a].pts);
    if (r1 >= .8 && r2 >= .8) pairs.push({ a, b, r: r1 + r2 });
  }
  pairs.sort((p, q) => q.r - p.r);
  const used = new Set<number>(), merged: NetLine[] = [], removed: number[][] = [];
  for (const { a, b } of pairs) {
    if (used.has(a) || used.has(b)) continue;
    used.add(a); used.add(b);
    const base = polyLength(lines[a].pts) >= polyLength(lines[b].pts) ? a : b, other = base === a ? b : a, pts: number[] = [];
    for (let i = 0; i + 1 < lines[base].pts.length; i += 2) {
      const x = lines[base].pts[i], z = lines[base].pts[i + 1], q = nearestOnPoly(lines[other].pts, x, z);
      pts.push((x + q.x) / 2, (z + q.z) / 2);
    }
    merged.push({ cls: Math.min(lines[a].cls, lines[b].cls), pts });
    removed.push(lines[a].pts, lines[b].pts);
  }
  // pontas das outras vias que tocavam uma das pistas passam a tocar a via única
  const kept = lines.filter((_, i) => !used.has(i));
  for (const l of kept) for (const end of [0, l.pts.length - 2]) {
    const x = l.pts[end], z = l.pts[end + 1];
    if (!removed.some((r) => nearestOnPoly(r, x, z).d < 4.5)) continue;
    let best = { d: Infinity, x, z };
    for (const m of merged) { const q = nearestOnPoly(m.pts, x, z); if (q.d < best.d) best = { d: q.d, x: q.x, z: q.z }; }
    if (best.d < 40) { l.pts[end] = best.x; l.pts[end + 1] = best.z; }
  }
  lines = [...kept, ...merged];
  // 2. cotos e vias de serviço que não levam a lugar nenhum
  for (let pass = 0; pass < 3; pass++) {
    const g = new Map<number, { l: number; i: number }[]>();
    lines.forEach((l, li) => { for (let i = 0; i + 3 < l.pts.length; i += 2) { const gx0 = Math.floor(Math.min(l.pts[i], l.pts[i + 2]) / 32) - 1, gx1 = Math.floor(Math.max(l.pts[i], l.pts[i + 2]) / 32) + 1, gz0 = Math.floor(Math.min(l.pts[i + 1], l.pts[i + 3]) / 32) - 1, gz1 = Math.floor(Math.max(l.pts[i + 1], l.pts[i + 3]) / 32) + 1; for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) { const k = hashKey(gx, gz); let a = g.get(k); if (!a) g.set(k, a = []); a.push({ l: li, i }); } } });
    const free = (li: number, end: number) => {
      const x = lines[li].pts[end], z = lines[li].pts[end + 1];
      for (const { l, i } of g.get(hashKey(Math.floor(x / 32), Math.floor(z / 32))) ?? []) {
        if (l === li) continue;
        const p = lines[l].pts, dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], len2 = dx * dx + dz * dz, t = len2 ? Math.max(0, Math.min(1, ((x - p[i]) * dx + (z - p[i + 1]) * dz) / len2)) : 0;
        if (Math.hypot(x - p[i] - dx * t, z - p[i + 1] - dz * t) < 4.5) return false;
      }
      return true;
    };
    const drop = new Set<number>();
    lines.forEach((l, li) => { const len = polyLength(l.pts), f = (free(li, 0) ? 1 : 0) + (free(li, l.pts.length - 2) ? 1 : 0); if ((len < 25 && f >= 1) || (len < 45 && f === 2)) drop.add(li); });
    if (!drop.size) break;
    lines = lines.filter((_, li) => !drop.has(li));
  }
  return lines;
}

/** Vias reamostradas com spline (a cada ~8 m): fita, cotas, física, GPS, tráfego e bairros usam estas linhas. */
const SMOOTH_STEP = 8;
const SIMPLE = simplifyNetwork(ROAD_CLASSES.flatMap((c, cls) => (jf.vias[c] as number[][]).map((pts) => ({ cls, pts }))));
/** Grafo viário por nós (road-graph.ts): nós fundidos a < 12 m, arestas >= 15 m, junção contínua nos nós de grau 2; cada aresta é suavizada com spline e termina exatamente no nó. */
const ROAD_GRAPH = buildNodeGraph(SIMPLE, { width: ASPHALT[0], heightAt: rawHeight, smooth: (p) => smoothLine(p, SMOOTH_STEP) });
export const roadGraph = (): RoadGraph => ROAD_GRAPH;
const VIAS = Object.fromEntries(ROAD_CLASSES.map((c, cls) => [c, ROAD_GRAPH.edges.filter((e) => e.cls === cls).map((e) => e.pts)])) as Record<RoadClass, number[][]>;
const segmentGrid = new Map<number, Segment[]>();
const segments: Segment[] = [];
function addSegment(s: Segment) {
  segments.push(s);
  const gx0 = Math.floor(Math.min(s.x0, s.x1) / HASH), gx1 = Math.floor(Math.max(s.x0, s.x1) / HASH);
  const gz0 = Math.floor(Math.min(s.z0, s.z1) / HASH), gz1 = Math.floor(Math.max(s.z0, s.z1) / HASH);
  for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
    const key = hashKey(gx, gz); let list = segmentGrid.get(key);
    if (!list) segmentGrid.set(key, list = []);
    list.push(s);
  }
}
for (let c = 0; c < ROAD_CLASSES.length; c++) for (const way of VIAS[ROAD_CLASSES[c]]) {
  for (let i = 0; i + 3 < way.length; i += 2) addSegment({ x0: way[i], z0: way[i + 1], x1: way[i + 2], z1: way[i + 3], half: stripWidth(c) / 2, cls: c });
}
const RIVER_CLS = 9;
for (const piece of jf.rio as number[][]) {
  for (let i = 0; i + 3 < piece.length; i += 2) addSegment({ x0: piece[i], z0: piece[i + 1], x1: piece[i + 2], z1: piece[i + 3], half: RIVER_WIDTH / 2, cls: RIVER_CLS });
}

function distToSegment(s: Segment, x: number, z: number) {
  const dx = s.x1 - s.x0, dz = s.z1 - s.z0, len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((x - s.x0) * dx + (z - s.z0) * dz) / len2)) : 0;
  return { d: Math.hypot(x - s.x0 - dx * t, z - s.z0 - dz * t), t };
}
/** Menor folga (m) até a borda de uma via ou do rio; negativa dentro da faixa. Infinity além de ~64 m. */
function gapToRoads(x: number, z: number) {
  const gx = Math.floor(x / HASH), gz = Math.floor(z / HASH);
  let best = Infinity;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    for (const s of segmentGrid.get(hashKey(gx + a, gz + b)) ?? []) {
      const g = distToSegment(s, x, z).d - s.half;
      if (g < best) best = g;
    }
  }
  return best;
}
export interface RoadPoint { x: number; z: number; heading: number; cls: number; distance: number }
/** Ponto do eixo de via mais próximo (apenas categorias até `maxClass`); heading em graus, 0 = norte. */
export function nearestRoad(x: number, z: number, maxClass = 3, minDistance = 0): RoadPoint | undefined {
  for (const r of [64, 128, 256, 512, 1024, 2048]) {
    let best: RoadPoint | undefined;
    for (let gx = Math.floor((x - r) / HASH); gx <= Math.floor((x + r) / HASH); gx++) for (let gz = Math.floor((z - r) / HASH); gz <= Math.floor((z + r) / HASH); gz++) {
      for (const s of segmentGrid.get(hashKey(gx, gz)) ?? []) {
        if (s.cls > maxClass) continue;
        const { d, t } = distToSegment(s, x, z);
        if (d < minDistance || (best && d >= best.distance)) continue;
        best = { x: s.x0 + (s.x1 - s.x0) * t, z: s.z0 + (s.z1 - s.z0) * t, heading: (Math.atan2(s.x1 - s.x0, -(s.z1 - s.z0)) * 180 / Math.PI + 360) % 360, cls: s.cls, distance: d };
      }
    }
    if (best && best.distance <= r) return best;
  }
  return undefined;
}

/** Aplainamento suave do terreno sob as vias (rua + calçada + transição suave de ~5 m até o talude). */
function roadBedBlend(x: number, z: number) {
  const gx = Math.floor(x / HASH), gz = Math.floor(z / HASH);
  let sumW = 0, sumH = 0, maxW = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    for (const sg of segmentGrid.get(hashKey(gx + a, gz + b)) ?? []) {
      if (sg.cls === RIVER_CLS) continue;
      const { d, t } = distToSegment(sg, x, z);
      const inner = sg.half + 5;
      const outer = sg.half + 24;
      if (d >= outer) continue;
      const w = 1 - smoothstep(inner, outer, d);
      if (w <= 0) continue;
      const px = sg.x0 + (sg.x1 - sg.x0) * t, pz = sg.z0 + (sg.z1 - sg.z0) * t;
      const w2 = w * w;
      sumW += w2;
      sumH += rawHeight(px, pz) * w2;
      if (w > maxW) maxW = w;
    }
  }
  return sumW > 0 ? { h: sumH / sumW, w: maxW } : undefined;
}

// ---------------------------------------------------------------------------
// Pista, marcos e lotes planos
// ---------------------------------------------------------------------------
const RWY_A = { x: jf.pista.a[0], z: jf.pista.a[1] };
const RWY_B = { x: jf.pista.b[0], z: jf.pista.b[1] };
const RWY_LEN = Math.hypot(RWY_B.x - RWY_A.x, RWY_B.z - RWY_A.z);
const RWY_U = { x: (RWY_B.x - RWY_A.x) / RWY_LEN, z: (RWY_B.z - RWY_A.z) / RWY_LEN };
/** s: distância ao longo da pista a partir da cabeceira sul; l: deslocamento lateral (+ = direita da pista). */
const runwayFrame = (x: number, z: number) => {
  const dx = x - RWY_A.x, dz = z - RWY_A.z;
  return { s: dx * RWY_U.x + dz * RWY_U.z, l: dx * -RWY_U.z + dz * RWY_U.x };
};
const runwayPoint = (s: number, l: number) => ({ x: RWY_A.x + RWY_U.x * s - RWY_U.z * l, z: RWY_A.z + RWY_U.z * s + RWY_U.x * l });
const sortedMedian = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const RUNWAY_FLAT = Math.fround(sortedMedian(Array.from({ length: 40 }, (_, i) => { const p = runwayPoint(RWY_LEN * i / 39, 0); return rawHeight(p.x, p.z); })));
const RUNWAY_HEIGHT = RUNWAY_FLAT + .05;
const RUNWAY_AT_410 = runwayPoint((410 - RWY_A.z) / RWY_U.z, 0);

// O vento predominante e o fdm usam o rumo da pista real (03/21 do SBJF, quase norte-sul).
export const AIRPORT = {
  x: RUNWAY_AT_410.x, z: 410, y: RUNWAY_HEIGHT, length: RWY_LEN, width: jf.pista.largura,
  /** Cabeceira sul (início da pista, s = 0). */
  southX: RWY_A.x, southZ: RWY_A.z,
  heading: (Math.atan2(RWY_U.x, -RWY_U.z) * 180 / Math.PI + 360) % 360,
};
export const isRunway = (x: number, z: number) => {
  const { s, l } = runwayFrame(x, z);
  return s >= 0 && s <= RWY_LEN && Math.abs(l) <= AIRPORT.width / 2;
};
/** Hangar aberto ao lado da pista (caixa alinhada aos eixos, 40 x 35 m). */
const hangarCenter = runwayPoint((267 - RWY_A.z) / RWY_U.z, 0);
export const HANGAR = { x0: hangarCenter.x + 30, x1: hangarCenter.x + 70, z0: 250, z1: 285 };

const dcCentro = (x: number, z: number) => Math.hypot(x - jf.marcos.centro[0], z - jf.marcos.centro[1]);

/** Procura, em espiral, um ponto com folga mínima das vias e sem inclinação forte. */
function freeSpot(x: number, z: number, clearance: number, maxSlope: number, start = 0) {
  for (let r = start; r < 600; r += 12) {
    for (let k = 0, n = Math.max(1, Math.round(r / 12) * 6); k < n; k++) {
      const a = k / n * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (gapToRoads(px, pz) < clearance) continue;
      let slope = 0;
      for (const [dx, dz] of [[clearance, 0], [-clearance, 0], [0, clearance], [0, -clearance]]) slope = Math.max(slope, Math.abs(rawHeight(px + dx, pz + dz) - rawHeight(px, pz)) / clearance);
      if (slope <= maxSlope) return { x: px, z: pz };
    }
  }
  return { x, z };
}

const UNI_LOT = freeSpot(jf.marcos.uniacademia[0], jf.marcos.uniacademia[1], 44, .22);
const UNI_ROAD = nearestRoad(UNI_LOT.x, UNI_LOT.z, 4)!;
/** Centro da UniAcademia: de frente para a rua, recuada ~5 m da calçada (a praça do modelo não encosta na pista). */
const UNI_W = 47, UNI_D = 42, UNI_RECUO = UNI_D / 2 + 5;
const UNI_CENTER = (() => {
  const dx = UNI_ROAD.x - UNI_LOT.x, dz = UNI_ROAD.z - UNI_LOT.z, dist = Math.hypot(dx, dz) || 1;
  const ux = dx / dist, uz = dz / dist;
  return { x: UNI_ROAD.x - ux * UNI_RECUO, z: UNI_ROAD.z - uz * UNI_RECUO, heading: (Math.atan2(ux, -uz) * 180 / Math.PI + 360) % 360 };
})();
const WORKSHOP_SPOT = freeSpot(jf.marcos.pocoRico[0], jf.marcos.pocoRico[1], 22, .2, 20);
const CRISTO = { x: jf.marcos.cristo[0], z: jf.marcos.cristo[1] };
const TOWER_SPOT = freeSpot(jf.marcos.centro[0] + 40, jf.marcos.centro[1] + 40, 26, .12);

interface Flat { x: number; z: number; inner: number; outer: number; y?: number }
const flats: Flat[] = [
  { x: UNI_CENTER.x, z: UNI_CENTER.z, inner: 36, outer: 70 }, // terreno plano sob todo o prédio e a praça
  { x: WORKSHOP_SPOT.x, z: WORKSHOP_SPOT.z, inner: 14, outer: 40 },
  // Include the landing site and its 30 m grid-cell corners, so the loaded heli rests level.
  { x: CRISTO.x, z: CRISTO.z, inner: 60, outer: 90 },
  { x: TOWER_SPOT.x, z: TOWER_SPOT.z, inner: 22, outer: 50 },
];

const heightGrid = (() => {
  const g = Float32Array.from(rawGrid);
  for (let j = 0; j < GRID_N; j++) for (let i = 0; i < GRID_N; i++) {
    const x = -GRID_HALF + i * GRID_STEP, z = -GRID_HALF + j * GRID_STEP;
    let h = g[j * GRID_N + i];
    // ruas: o terreno sob a via + calçada + transição suave assume a altura do eixo (sem recortes bruscos)
    const rb = roadBedBlend(x, z);
    if (rb) h = h * (1 - rb.w) + rb.h * rb.w;
    // pista: faixa plana de 150 m de largura, com transição suave nas bordas
    const { s, l } = runwayFrame(x, z);
    const ds = Math.max(-50 - s, 0, s - RWY_LEN - 50), dl = Math.max(Math.abs(l) - 75, 0), d = Math.hypot(ds, dl);
    const w = 1 - smoothstep(0, 90, d);
    h = h * (1 - w) + RUNWAY_FLAT * w;
    for (const f of flats) {
      const fw = 1 - smoothstep(0, f.outer - f.inner, Math.max(0, Math.hypot(x - f.x, z - f.z) - f.inner));
      if (fw > 0) h = h * (1 - fw) + (f.y ?? rawHeight(f.x, f.z)) * fw;
    }
    g[j * GRID_N + i] = h;
  }
  return g;
})();

/** Altura do terreno (m). Mínimo de 2 m: Juiz de Fora não tem mar. */
export function terrainHeight(x: number, z: number) {
  return sampleGrid(heightGrid, x, z);
}

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

// ---------------------------------------------------------------------------
// Terreno
// ---------------------------------------------------------------------------
const GRASS = hex('#74a755');
const LUSH = hex('#4d8a4b');
const DRY = hex('#b4a35a');
const SOIL = hex('#a9835a');
const ROCK = hex('#8d8896');
const URBAN_GROUND = hex('#afa798');

export function terrainData() {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let j = 0; j < GRID_N; j++) {
    for (let i = 0; i < GRID_N; i++) {
      const x = -GRID_HALF + i * GRID_STEP, z = -GRID_HALF + j * GRID_STEP, h = heightGrid[j * GRID_N + i];
      pos.push(x, h, z);
      const hx = heightGrid[j * GRID_N + Math.min(GRID_N - 1, i + 1)] - heightGrid[j * GRID_N + Math.max(0, i - 1)];
      const hz = heightGrid[Math.min(GRID_N - 1, j + 1) * GRID_N + i] - heightGrid[Math.max(0, j - 1) * GRID_N + i];
      const slope = Math.hypot(hx, hz) / (2 * GRID_STEP);
      const patch = fbm(x / 140, z / 140, 3, 21);
      let c = mix(GRASS, patch > 0.55 ? DRY : LUSH, smoothstep(0.38, 0.62, patch));
      // Solo urbano (pátios/calçadas/lotes) nas regiões com malha viária densa, preservando parques e morros verdes
      const gap = gapToRoads(x, z);
      if (gap < 48 && slope < 0.34 && !inAnyArea(x, z)) {
        const dc = dcCentro(x, z);
        const urban = (1 - smoothstep(0, 48, Math.max(0, gap))) * (0.28 + 0.52 * Math.exp(-((dc / 1600) ** 2))) * (1 - smoothstep(0.18, 0.34, slope));
        c = mix(c, URBAN_GROUND, urban);
      }
      c = mix(c, SOIL, smoothstep(0.35, 0.6, slope) * 0.8);
      c = mix(c, ROCK, smoothstep(0.55, 0.95, slope) + smoothstep(170, 230, h) * 0.35);
      col.push(c[0], c[1], c[2], 255);
    }
  }
  for (let j = 0; j < GRID_N - 1; j++) {
    for (let i = 0; i < GRID_N - 1; i++) {
      const a = j * GRID_N + i, b = a + 1, c = a + GRID_N, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return geometry(pos, idx, col);
}

const WINDOW_M = 3.2;
const TEX_WINDOWS = 8;
const TEX_ROWS = 16;
const FACADES = ['#e3d9c8', '#eae3d5', '#d5c4ac', '#c9a38c', '#d4d6d8', '#b8c3ce', '#e7e4dd', '#ccc3b4'].map(hex);

export type Box = { x0: number; x1: number; z0: number; z1: number; top: number; bottom?: number; curb?: boolean; radius?: number; x?: number; z?: number; ramp?: { x0:number; z0:number; x1:number; z1:number; y0:number; y1:number };
  /** Prisma orientado (prédios girados): x0..z1 é só a caixa envolvente para o grid; a colisão usa este retângulo. */
  obb?: { cx: number; cz: number; hw: number; hd: number; rx: number; rz: number } };

// ---------------------------------------------------------------------------
// Polígonos (praças, estádios, universidades, aeroporto)
// ---------------------------------------------------------------------------
interface Polygon { pts: number[]; nome: string; x0: number; x1: number; z0: number; z1: number }
const polygons = (list: { pts: number[]; nome: string }[]): Polygon[] => list.map((p) => {
  const xs = p.pts.filter((_, i) => i % 2 === 0), zs = p.pts.filter((_, i) => i % 2 === 1);
  return { ...p, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
});
const parkPolys = polygons(jf.parques), stadiumPolys = polygons(jf.estadios), universityPolys = polygons(jf.universidades);
const airportPolys = polygons(jf.aeroporto ? [jf.aeroporto] : []);
function inside(p: Polygon, x: number, z: number) {
  if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) return false;
  let c = false;
  for (let i = 0, j = p.pts.length - 2; i < p.pts.length; j = i, i += 2) {
    const xi = p.pts[i], zi = p.pts[i + 1], xj = p.pts[j], zj = p.pts[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const allAreas = [...parkPolys, ...stadiumPolys, ...universityPolys, ...airportPolys];
const inAnyArea = (x: number, z: number) => allAreas.some((p) => inside(p, x, z));

// ---------------------------------------------------------------------------
// Prédios: lotes procedurais ao longo das vias, mais altos no Centro
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Ruas encostadas no relevo: segmentos <= 8 m, cotas em centro + bordas e garantia no interior de cada quad
// ---------------------------------------------------------------------------
const MAX_STEP = 8, BEVEL = 2.5, MAX_BEVEL = 10;
/** Meio-fio: degrau de 12 cm, com rampa de 24 cm (inclinação 0,5 < maxSlope 0,55) idêntica na malha e na física. */
const CURB = .12, CURB_RAMP = .24, CURB_CUT = 5, SIDEWALK_RADIUS = 600;
/** Calçada = 14% da faixa de cada lado (igual à textura); só nas vias da cidade. `cf` (0..1) apaga o meio-fio perto de cruzamentos. */
interface Station { x: number; z: number; s: number; lx: number; lz: number; rx: number; rz: number; hl: number; hr: number; cf: number }
interface RoadWay { cls: number; half: number; sw: number; st: Station[] }
interface RoadSegH { x0: number; z0: number; hl0: number; hr0: number; x1: number; z1: number; hl1: number; hr1: number; half: number; way: number; sw: number; cf0: number; cf1: number; i: number }
let netCache: { base: RoadWay[]; ways: RoadWay[]; grid: Map<number, RoadSegH[]>; junctions: Junction[]; discGrid: Map<number, Junction[]>; ringGrid: Map<number, RingSeg[]> } | undefined;
function liftRibbonOverTerrain(st: Station[], minLift: number) {
  // Verifica 15 amostras baricêntricas por triângulo de cada quad para garantir que a malha do terreno nunca ultrapasse o asfalto
  const checkTri = (
    ax: number, az: number, bx: number, bz: number, cx: number, cz: number,
    getY: () => [number, number, number], raise: (d: number) => void,
  ) => {
    const [ya, yb, yc] = getY();
    let maxNeed = 0;
    for (let u = 0; u <= 4; u++) for (let v = 0; v <= 4 - u; v++) {
      const a = u / 4, b = v / 4, c = 1 - a - b;
      const x = ax * a + bx * b + cx * c, z = az * a + bz * b + cz * c;
      const y = ya * a + yb * b + yc * c;
      const need = terrainHeight(x, z) + minLift - y;
      if (need > maxNeed) maxNeed = need;
    }
    const mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3, my = (ya + yb + yc) / 3;
    const midNeed = terrainHeight(mx, mz) + minLift - my;
    if (midNeed > maxNeed) maxNeed = midNeed;
    if (maxNeed > 0) raise(maxNeed);
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i + 1 < st.length; i++) {
      const a = st[i], b = st[i + 1];
      checkTri(a.lx, a.lz, b.lx, b.lz, a.rx, a.rz, () => [a.hl, b.hl, a.hr], (d) => { a.hl += d; b.hl += d; a.hr += d; });
      checkTri(a.rx, a.rz, b.lx, b.lz, b.rx, b.rz, () => [a.hr, b.hl, b.hr], (d) => { a.hr += d; b.hl += d; b.hr += d; });
    }
  }
}
function buildRibbonStations(way: number[], half: number, lift: number): Station[][] {
  // Divide apenas em retornos muito fechados (> 100°); curvas normais usam chanfro/miter sem frestas
  const rawPts: { x: number; z: number }[] = [];
  for (let i = 0; i + 1 < way.length; i += 2) {
    const x = way[i], z = way[i + 1], prev = rawPts[rawPts.length - 1];
    if (!prev || Math.hypot(x - prev.x, z - prev.z) > 0.25) rawPts.push({ x, z });
  }
  if (rawPts.length < 2) return [];
  const pieces: { x: number; z: number }[][] = [[rawPts[0]]];
  for (let i = 1; i < rawPts.length - 1; i++) {
    const p0 = rawPts[i - 1], p1 = rawPts[i], p2 = rawPts[i + 1];
    const d0x = p1.x - p0.x, d0z = p1.z - p0.z, l0 = Math.hypot(d0x, d0z) || 1;
    const d1x = p2.x - p1.x, d1z = p2.z - p1.z, l1 = Math.hypot(d1x, d1z) || 1;
    const dot = (d0x * d1x + d0z * d1z) / (l0 * l1);
    pieces[pieces.length - 1].push(p1);
    if (dot < -0.15) pieces.push([p1]);
  }
  pieces[pieces.length - 1].push(rawPts[rawPts.length - 1]);

  const out: Station[][] = [];
  let accGlobal = 0;
  for (const piece of pieces) {
    if (piece.length < 2) continue;
    const pts: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i + 1 < piece.length; i++) {
      const ax = piece[i].x, az = piece[i].z, bx = piece[i + 1].x, bz = piece[i + 1].z;
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / MAX_STEP));
      for (let k = i ? 1 : 0; k <= n; k++) pts.push({ x: ax + (bx - ax) * k / n, z: az + (bz - az) * k / n, s: accGlobal + len * k / n });
      accGlobal += len;
    }
    if (pts.length < 2) continue;
    const makeStation = (p: { x: number; z: number; s: number }, nx: number, nz: number): Station => {
      const lx = p.x + nx, lz = p.z + nz, rx = p.x - nx, rz = p.z - nz;
      let hl = terrainHeight(lx, lz), hr = terrainHeight(rx, rz);
      const hc = terrainHeight(p.x, p.z);
      const mid = 0.5 * (hl + hr);
      if (mid < hc) { const bump = hc - mid; hl += bump; hr += bump; }
      return { x: p.x, z: p.z, s: p.s, lx, lz, rx, rz, hl: hl + lift, hr: hr + lift, cf: 1 };
    };
    const st: Station[] = pts.map((p, i) => {
      let nx: number, nz: number;
      if (i === 0 || i === pts.length - 1) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        nx = -(b.z - a.z) / len * half; nz = (b.x - a.x) / len * half;
      } else {
        const p0 = pts[i - 1], p2 = pts[i + 1];
        const l0 = Math.hypot(p.x - p0.x, p.z - p0.z) || 1, l1 = Math.hypot(p2.x - p.x, p2.z - p.z) || 1;
        const u0x = (p.x - p0.x) / l0, u0z = (p.z - p0.z) / l0;
        const u1x = (p2.x - p.x) / l1, u1z = (p2.z - p.z) / l1;
        const tx = u0x + u1x, tz = u0z + u1z, tl = Math.hypot(tx, tz) || 1;
        const dot = Math.max(-0.5, Math.min(1, u0x * u1x + u0z * u1z));
        const miter = Math.min(1.45, 1 / Math.max(0.68, Math.sqrt((1 + dot) * 0.5)));
        nx = -(tz / tl) * half * miter; nz = (tx / tl) * half * miter;
      }
      return makeStation(p, nx, nz);
    });
    // Verifica se algum quad inverte a normal Y (curva muito fechada); se sim, usa quad limpo estendido sobre a emenda
    const clean: Station[][] = [[st[0]]];
    for (let i = 0; i + 1 < st.length; i++) {
      const a = st[i], b = st[i + 1];
      const ny1 = (b.lz - a.lz) * (a.rx - a.lx) - (b.lx - a.lx) * (a.rz - a.lz);
      const ny2 = (b.lz - a.rz) * (b.rx - a.rx) - (b.lx - a.rx) * (b.rz - a.rz);
      if (ny1 > 0.05 && ny2 > 0.05) {
        clean[clean.length - 1].push(b);
      } else {
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
        const ux = dx / len, uz = dz / len, nx = -uz * half, nz = ux * half;
        const ext = Math.min(half * 0.5, len * 0.45);
        const pa = { x: pts[i].x - ux * ext, z: pts[i].z - uz * ext, s: pts[i].s };
        const pb = { x: pts[i + 1].x + ux * ext, z: pts[i + 1].z + uz * ext, s: pts[i + 1].s };
        clean.push([makeStation(pa, nx, nz), makeStation(pb, nx, nz)]);
        clean.push([b]);
      }
    }
    for (const seg of clean) {
      if (seg.length < 2) continue;
      liftRibbonOverTerrain(seg, lift);
      out.push(seg);
    }
  }
  return out;
}
/** Ponto da borda de um cruzamento: h = altura do asfalto no ponto. */
interface JPt { x: number; z: number; h: number }
/** Calçada que contorna uma esquina (do pé do meio-fio, para fora): altura do topo `out`, largura `sw`, normal para fora. */
interface RingChain { pts: JPt[]; out: number[]; sw: number[]; nrm: [number, number][]; cf: number }
interface RingSeg { first: boolean; last: boolean; x0: number; z0: number; h0: number; o0: number; w0: number; x1: number; z1: number; h1: number; o1: number; w1: number; nx: number; nz: number; cf: number }
/** Cruzamento no estilo QuickRoad: cada rua é cortada num recuo e o miolo é um polígono com filetes de esquina (raio ~4,5 m). */
interface Junction { x: number; z: number; r: number; hc: number; poly: JPt[]; chains: RingChain[]; /** bocas das ruas (índice em `base`): onde ficam as faixas de pedestre */ arms?: { way: number; s: number; dir: 1 | -1; m: number; a: number }[]; /** remendo de reserva (disco por cima das fitas): desenhado PATCH_LIFT acima */ patch?: boolean }
const PATCH_LIFT = .04;
/** Faixas de pedestre só no Centro (m do marco do Centro) */
const ZEBRA_RADIUS = 600;
const FILLET = 3.2;
/** Cruzamentos = nós de grau >= 3 do grafo viário (sem heurística geométrica de interseção). */
function findJunctions(ways: RoadWay[]) {
  const deg = new Array<number>(ROAD_GRAPH.nodes.length).fill(0);
  for (const e of ROAD_GRAPH.edges) { deg[e.a]++; deg[e.b]++; }
  void ways;
  return ROAD_GRAPH.nodes.filter((n) => deg[n.id] >= 3).map((n) => ({ x: n.x, z: n.z, r: stripWidth(0) / 2 * 1.05 + .3 }));
}
function lerpStation(a: Station, b: Station, t: number): Station {
  const l = (p: number, q: number) => p + (q - p) * t;
  return { x: l(a.x, b.x), z: l(a.z, b.z), s: l(a.s, b.s), lx: l(a.lx, b.lx), lz: l(a.lz, b.lz), rx: l(a.rx, b.rx), rz: l(a.rz, b.rz), hl: l(a.hl, b.hl), hr: l(a.hr, b.hr), cf: l(a.cf, b.cf) };
}
function stationAt(st: Station[], s: number): Station {
  if (s <= st[0].s) return st[0];
  for (let i = 0; i + 1 < st.length; i++) if (s <= st[i + 1].s) return lerpStation(st[i], st[i + 1], (s - st[i].s) / ((st[i + 1].s - st[i].s) || 1));
  return st[st.length - 1];
}
function sliceStations(st: Station[], s0: number, s1: number): Station[] {
  const out = [stationAt(st, s0)];
  for (const p of st) if (p.s > s0 + 1e-6 && p.s < s1 - 1e-6) out.push(p);
  out.push(stationAt(st, s1));
  return out;
}
function buildGrid(ways: RoadWay[]) {
  const grid = new Map<number, RoadSegH[]>();
  ways.forEach((w, wayIdx) => {
    const { st, half, sw } = w, reach = half + MAX_BEVEL;
    for (let i = 0; i + 1 < st.length; i++) {
      const sg: RoadSegH = { x0: st[i].x, z0: st[i].z, hl0: st[i].hl, hr0: st[i].hr, x1: st[i + 1].x, z1: st[i + 1].z, hl1: st[i + 1].hl, hr1: st[i + 1].hr, half, way: wayIdx, sw, cf0: st[i].cf, cf1: st[i + 1].cf, i };
      for (let gx = Math.floor((Math.min(sg.x0, sg.x1) - reach) / HASH); gx <= Math.floor((Math.max(sg.x0, sg.x1) + reach) / HASH); gx++) {
        for (let gz = Math.floor((Math.min(sg.z0, sg.z1) - reach) / HASH); gz <= Math.floor((Math.max(sg.z0, sg.z1) + reach) / HASH); gz++) {
          const k = hashKey(gx, gz); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(sg);
        }
      }
    }
  });
  return grid;
}

/** Braço de um cruzamento: um sentido de uma via saindo do centro. `tp/tm`: recuo da esquina no lado + / -; `fp/fm`: tangente do filete. */
interface Arm { way: number; s: number; dir: 1 | -1; ang: number; a: number; sw: number; half: number; tp: number; tm: number; fp: number; fm: number; m: number }
function armsAt(ways: RoadWay[], grid: Map<number, RoadSegH[]>, j: { x: number; z: number }) {
  // grafo por nós: cada via (aresta) termina exatamente no nó, então os braços são as pontas de via a < 1,5 m do centro
  const arms: Arm[] = [], stubs = new Set<number>(), seenWay = new Set<number>();
  for (const sg of grid.get(hashKey(Math.floor(j.x / HASH), Math.floor(j.z / HASH))) ?? []) {
    if (seenWay.has(sg.way)) continue;
    seenWay.add(sg.way);
    const w = ways[sg.way], st = w.st, first = st[0], last = st[st.length - 1];
    for (const dir of [1, -1] as const) {
      const e = dir === 1 ? first : last;
      if (Math.hypot(e.x - j.x, e.z - j.z) > 1.5) continue;
      const room = dir === 1 ? last.s - first.s : last.s - first.s;
      if (room < 4) continue;
      const p = stationAt(st, e.s + dir * Math.min(12, room)), ax = p.x - j.x, az = p.z - j.z;
      if (Math.hypot(ax, az) < 1) continue;
      arms.push({ way: sg.way, s: e.s, dir, ang: Math.atan2(az, ax), a: w.sw ? w.half - w.sw : w.half, sw: w.sw, half: w.half, tp: .5, tm: .5, fp: 0, fm: 0, m: 0 });
    }
  }
  return { arms: arms.sort((p, q) => p.ang - q.ang), stubs };
}
/** Ponto da borda do asfalto do braço, a `dist` do centro, no lado + (esquerda do sentido de saída) ou -; segue a curva da via. */
function armEdge(ways: RoadWay[], arm: Arm, dist: number, plus: boolean) {
  const w = ways[arm.way], p = stationAt(w.st, arm.s + arm.dir * dist), left = plus === (arm.dir === 1), f = arm.a / w.half;
  const ex = left ? p.lx : p.rx, ez = left ? p.lz : p.rz, eh = left ? p.hl : p.hr;
  const base = 0.5 * (p.hl + p.hr) + 0.5 * (p.hl - p.hr) * (left ? f : -f);
  return { x: p.x + (ex - p.x) * f, z: p.z + (ez - p.z) * f, h: base - (w.sw ? CURB * p.cf : 0), out: eh, cf: p.cf };
}
type EdgePt = ReturnType<typeof armEdge>;

function buildJunction(ways: RoadWay[], grid: Map<number, RoadSegH[]>, j: { x: number; z: number }) {
  const { arms, stubs } = armsAt(ways, grid, j), n = arms.length;
  if (n < 3) return null;
  const gaps = arms.map((p, k) => (arms[(k + 1) % n].ang - p.ang + Math.PI * 2) % (Math.PI * 2));
  if (gaps.some((g) => g < .12)) return null; // vias praticamente sobrepostas (< 7°): deixa como está
  // recuo de cada rua pela esquina com a vizinha (QuickRoad): t = (b + a·cosθ) / senθ; a boca fica FILLET além, onde o arco de esquina começa
  arms.forEach((A, k) => {
    const B = arms[(k + 1) % n], th = gaps[k];
    if (th >= 2.88) return; // lado reto da via principal: sem esquina
    const cap = (v: number, mx: number) => Math.max(1, Math.min(mx, v)), mx = 1.8 * Math.max(A.a, B.a) + 1.5;
    A.tp = cap((B.a + A.a * Math.cos(th)) / Math.sin(th), mx);
    B.tm = cap((A.a + B.a * Math.cos(th)) / Math.sin(th), mx);
  });
  for (const A of arms) {
    const st = ways[A.way].st, room = A.dir === 1 ? st[st.length - 1].s - A.s : A.s - st[0].s;
    A.m = Math.min(Math.max(A.tp, A.tm) + FILLET, room * .48);
    A.m = Math.max(A.m, Math.min(A.a + 1, room * .48));
    A.tp = Math.min(A.tp, A.m); A.tm = Math.min(A.tm, A.m);
  }
  const mouth = arms.map((A) => ({ m: armEdge(ways, A, A.m, false), p: armEdge(ways, A, A.m, true) }));
  const poly: JPt[] = [], chains: RingChain[] = [];
  arms.forEach((A, k) => {
    const kk = (k + 1) % n, B = arms[kk], t0 = mouth[k].p, t1 = mouth[kk].m;
    poly.push(mouth[k].m, mouth[k].p);
    // contorno entre a boca de A (lado +) e a de B (lado -): reto na lateral da via principal, senão arco de esquina (Bézier com o canto como controle)
    const inner: EdgePt[] = [];
    if (gaps[k] < 2.88) {
      const ca = armEdge(ways, A, A.tp, true), cb = armEdge(ways, B, B.tm, false), cx = (ca.x + cb.x) / 2, cz = (ca.z + cb.z) / 2;
      for (const u of [.25, .5, .75]) {
        const x = (1 - u) * (1 - u) * t0.x + 2 * u * (1 - u) * cx + u * u * t1.x, z = (1 - u) * (1 - u) * t0.z + 2 * u * (1 - u) * cz + u * u * t1.z;
        inner.push({ x, z, h: Math.max(t0.h + (t1.h - t0.h) * u, terrainHeight(x, z) + .14), out: t0.out + (t1.out - t0.out) * u, cf: Math.min(t0.cf, t1.cf) });
      }
    }
    poly.push(...inner);
    // calçada onde as duas vias têm (largura sw); onde não há, a cadeia só serve de chanfro físico até o terreno (sw = 0)
    const both = A.sw > 0 && B.sw > 0 && gaps[k] > .6, swA = both ? A.sw : 0, swB = both ? B.sw : 0;
    const pts: EdgePt[] = [t0, ...inner, t1];
    const lens = [0]; for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const total = lens[lens.length - 1] || 1;
    const nrm: [number, number][] = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b.z - a.z), nz = b.x - a.x; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      if (nx * (p.x - j.x) + nz * (p.z - j.z) < 0) { nx = -nx; nz = -nz; }
      return [nx, nz];
    });
    chains.push({ pts: pts.map((p) => ({ x: p.x, z: p.z, h: p.h })), out: pts.map((p, i) => (both ? t0.out + (t1.out - t0.out) * lens[i] / total : p.h)), sw: pts.map((_, i) => swA + (swB - swA) * lens[i] / total), nrm, cf: Math.min(t0.cf, t1.cf) });
  });
  // o leque do miolo exige vértices em ordem angular em torno do centro (e sem repetidos)
  poly.sort((p, q) => Math.atan2(p.z - j.z, p.x - j.x) - Math.atan2(q.z - j.z, q.x - j.x));
  for (let i = poly.length - 1; i >= 0; i--) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if (poly.length > 3 && (Math.hypot(p.x - q.x, p.z - q.z) < .05 || Math.hypot(p.x - j.x, p.z - j.z) < .3)) poly.splice(i, 1);
  }
  // vias que não são braços mas atravessam o miolo (pistas paralelas, ramais): sem polígono limpo, o cruzamento fica como estava
  const armWays = new Set([...arms.map((A) => A.way), ...stubs]), rBox = Math.max(...poly.map((p) => Math.hypot(p.x - j.x, p.z - j.z))) + 2;
  const inPoly = (x: number, z: number) => {
    let c = false;
    for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
      const a = poly[i], b = poly[k];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
  };
  for (let gx = Math.floor((j.x - rBox) / HASH); gx <= Math.floor((j.x + rBox) / HASH); gx++) for (let gz = Math.floor((j.z - rBox) / HASH); gz <= Math.floor((j.z + rBox) / HASH); gz++) {
    for (const sg of grid.get(hashKey(gx, gz)) ?? []) {
      if (armWays.has(sg.way)) continue;
      for (const t of [0, .25, .5, .75, 1]) if (inPoly(sg.x0 + (sg.x1 - sg.x0) * t, sg.z0 + (sg.z1 - sg.z0) * t)) return null;
    }
  }
  const hs = stripsHeight(grid, j.x, j.z, true, true);
  const hc = hs > -Infinity ? hs : poly.reduce((a, p) => a + p.h, 0) / poly.length;
  const junction: Junction = { x: j.x, z: j.z, r: Math.max(...poly.map((p) => Math.hypot(p.x - j.x, p.z - j.z))) + .5, hc: Math.max(hc, terrainHeight(j.x, j.z) + .24), poly, chains, arms: arms.map((A) => ({ way: A.way, s: A.s, dir: A.dir, m: A.m, a: A.a })) };
  // validação: nenhum degrau > 15 cm cruzando o contorno do miolo (para fora ele é calçada, chanfro ou a rua cortada)
  {
    const segs = ringSegsOf(junction), pts: [number, number, number, number][] = [];
    for (const ch of chains) ch.pts.forEach((p, i) => {
      if (i + 1 < ch.pts.length) { const q = ch.pts[i + 1]; pts.push([(p.x + q.x) / 2, (p.z + q.z) / 2, (ch.nrm[i][0] + ch.nrm[i + 1][0]) / 2, (ch.nrm[i][1] + ch.nrm[i + 1][1]) / 2]); }
    });
    mouth.forEach((m) => { const x = (m.m.x + m.p.x) / 2, z = (m.m.z + m.p.z) / 2; pts.push([x, z, x - j.x, z - j.z]); });
    // o leque nunca pode afundar no terreno nem formar degrau interno (>= terreno + 10 cm e suave em 1,5 m)
    for (let gx = -junction.r; gx <= junction.r; gx += 1.5) for (let gz = -junction.r; gz <= junction.r; gz += 1.5) {
      const x = j.x + gx, z = j.z + gz, h = fanAt(junction, x, z);
      if (h === undefined) continue;
      if (h < terrainHeight(x, z) + .1) return null;
      const h2 = fanAt(junction, x + 1.5, z);
      if (h2 !== undefined && Math.abs(h2 - h) > .6) return null;
    }
    for (const [x, z, nx, nz] of pts) {
      const l = Math.hypot(nx, nz) || 1, ux = nx / l, uz = nz / l;
      const hIn = fanAt(junction, x - ux * .25, z - uz * .25);
      if (hIn === undefined) return null;
      const ex = x + ux * .25, ez = z + uz * .25;
      if (fanAt(junction, ex, ez) !== undefined) return null;
      const hOut = Math.max(terrainHeight(ex, ez), stripsHeight(grid, ex, ez, false), ringHeightFrom(segs, ex, ez));
      if (Math.abs(hIn - hOut) > .18) return null; // a borda do miolo pode ter o degrau do meio-fio (12 cm) mais a inclinação
    }
  }
  const stubCuts = [...stubs].map((way) => ({ way, lo: -Infinity, hi: Infinity }));
  const cuts = arms.map((A) => {
    const w = ways[A.way].st, s0 = w[0].s, last = w[w.length - 1].s;
    return A.dir === 1 ? { way: A.way, lo: A.s - s0 < 4 ? -Infinity : A.s, hi: A.s + A.m } : { way: A.way, lo: A.s - A.m, hi: last - A.s < 4 ? Infinity : A.s };
  });
  return { junction, cuts: [...cuts, ...stubCuts] };
}

/** Reserva para cruzamentos que o polígono limpo não resolve (pistas paralelas, Y agudo): disco liso de 10 lados sobre as fitas. */
function fallbackJunction(grid: Map<number, RoadSegH[]>, j: { x: number; z: number; r: number }): Junction | null {
  const N = 10, poly: JPt[] = [];
  for (let k = 0; k < N; k++) {
    const a = k / N * Math.PI * 2, x = j.x + Math.cos(a) * j.r, z = j.z + Math.sin(a) * j.r, strict = stripsHeight(grid, x, z, true, true);
    const edge = strict > -Infinity ? strict : Math.max(stripsHeight(grid, x, z, false, true), terrainHeight(x, z) + .12);
    poly.push({ x, z, h: Math.max(edge, terrainHeight(x, z) + .2) });
  }
  const hs = stripsHeight(grid, j.x, j.z, true, true);
  if (hs === -Infinity && poly.every((p) => p.h <= terrainHeight(p.x, p.z) + .21)) return null;
  return { x: j.x, z: j.z, r: j.r, hc: Math.max(hs > -Infinity ? hs : poly.reduce((a, p) => a + p.h, 0) / N, terrainHeight(j.x, j.z) + .24), poly, chains: [], patch: true };
}

function roadNet() {
  if (netCache) return netCache;
  const base: RoadWay[] = [];
  for (let c = 0; c < ROAD_CLASSES.length; c++) VIAS[ROAD_CLASSES[c]].forEach((way) => {
    const half = stripWidth(c) / 2, n2 = way.length >> 1, midIdx = (n2 >> 1) * 2;
    // calçada decidida pela via inteira (centro dela); o asfalto desce CURB, então a fita sobe CURB a mais para manter a folga do terreno
    const sw = dcCentro(way[midIdx], way[midIdx + 1]) < SIDEWALK_RADIUS ? half * .28 : 0, lift = LIFT[c] + (base.length % 4) * .004 + (sw ? CURB : 0);
    for (const st of buildRibbonStations(way, half, lift)) {
      // inclinação lateral da via soma-se à rampa do meio-fio (0,5): acima de 0,02 o degrau encolhe, em 0,05 some (soma <= 0,55)
      if (sw) for (const stn of st) stn.cf = 1 - Math.max(0, Math.min(1, (Math.abs(stn.hl - stn.hr) / (2 * half) - .02) / .03));
      base.push({ cls: c, half, sw, st });
    }
  });
  // cruzamentos: braços, recuos, polígono do miolo e a calçada das esquinas; as fitas são cortadas na boca de cada braço
  let tempGrid = buildGrid(base);
  const junctions: Junction[] = [], fallbacks: { x: number; z: number; r: number }[] = [], cutsByWay = new Map<number, { lo: number; hi: number }[]>();
  const found = findJunctions(base), built = found.map((c) => buildJunction(base, tempGrid, c));
  found.forEach((c, i) => {
    const b = built[i];
    // dois cruzamentos que se sobrepõem (< raio + raio) não têm polígono limpo: ficam com o disco de reserva
    const polyIn = (pl: JPt[], x: number, z: number) => { let c2 = false; for (let q = 0, k2 = pl.length - 1; q < pl.length; k2 = q++) { const u = pl[q], v = pl[k2]; if ((u.z > z) !== (v.z > z) && x < (v.x - u.x) * (z - u.z) / (v.z - u.z) + u.x) c2 = !c2; } return c2; };
    const clash = b && built.some((o, k) => k !== i && o && Math.hypot(o.junction.x - c.x, o.junction.z - c.z) < b.junction.r + o.junction.r && (o.junction.poly.some((p) => polyIn(b.junction.poly, p.x, p.z)) || b.junction.poly.some((p) => polyIn(o.junction.poly, p.x, p.z))));
    if (!b || clash) { fallbacks.push(c); return; }
    junctions.push(b.junction);
    for (const cu of b.cuts) { let l = cutsByWay.get(cu.way); if (!l) cutsByWay.set(cu.way, l = []); l.push({ lo: cu.lo, hi: cu.hi }); }
  });
  // cruzamentos de reserva: o meio-fio some (cf -> 0) até o disco e volta em CURB_CUT m, e o disco lê as fitas já ajustadas
  if (fallbacks.length) {
    for (const w of base) if (w.sw) for (const stn of w.st) {
      for (const j of fallbacks) {
        const dx = stn.x - j.x, dz = stn.z - j.z;
        if (Math.abs(dx) < j.r + CURB_CUT && Math.abs(dz) < j.r + CURB_CUT) stn.cf = Math.min(stn.cf, Math.max(0, Math.min(1, (Math.hypot(dx, dz) - j.r) / CURB_CUT)));
      }
    }
    tempGrid = buildGrid(base);
    for (const c of fallbacks) { const f = fallbackJunction(tempGrid, c); if (f) junctions.push(f); }
  }
  const ways: RoadWay[] = [];
  base.forEach((w, i) => {
    const cuts = (cutsByWay.get(i) ?? []).sort((a, b) => a.lo - b.lo);
    if (!cuts.length) { ways.push(w); return; }
    const first = w.st[0].s, last = w.st[w.st.length - 1].s, kept: [number, number][] = [];
    let cur = first;
    for (const cu of cuts) { if (cu.lo > cur) kept.push([cur, Math.min(cu.lo, last)]); cur = Math.max(cur, cu.hi); }
    if (cur < last) kept.push([cur, last]);
    for (const [a, b] of kept) if (b - a >= 1.5) ways.push({ ...w, st: sliceStations(w.st, a, b) });
  });
  const grid = buildGrid(ways), discGrid = new Map<number, Junction[]>(), ringGrid = new Map<number, RingSeg[]>();
  const put = <T,>(map: Map<number, T[]>, item: T, x0: number, x1: number, z0: number, z1: number) => {
    for (let gx = Math.floor(x0 / HASH); gx <= Math.floor(x1 / HASH); gx++) for (let gz = Math.floor(z0 / HASH); gz <= Math.floor(z1 / HASH); gz++) {
      const k = hashKey(gx, gz); let l = map.get(k); if (!l) map.set(k, l = []); l.push(item);
    }
  };
  for (const d of junctions) {
    // o disco de reserva é só visual: a física dele seria um segundo degrau; o carro continua pisando nas fitas
    if (!d.patch) put(discGrid, d, d.x - d.r, d.x + d.r, d.z - d.r, d.z + d.r);
    for (const seg of ringSegsOf(d)) {
      const reach = Math.max(seg.w0, seg.w1) + MAX_BEVEL;
      put(ringGrid, seg, Math.min(seg.x0, seg.x1) - reach, Math.max(seg.x0, seg.x1) + reach, Math.min(seg.z0, seg.z1) - reach, Math.max(seg.z0, seg.z1) + reach);
    }
  }
  return netCache = { base, ways, grid, junctions, discGrid, ringGrid };
}
/** Altura do leque do miolo de `d` em (x, z); undefined fora do polígono. */
function fanAt(d: Junction, x: number, z: number) {
  const dx = x - d.x, dz = z - d.z;
  if (dx * dx + dz * dz > d.r * d.r) return undefined;
  for (let k = 0; k < d.poly.length; k++) {
    const p = d.poly[k], q = d.poly[(k + 1) % d.poly.length], x1 = p.x - d.x, z1 = p.z - d.z, x2 = q.x - d.x, z2 = q.z - d.z, den = x1 * z2 - x2 * z1;
    if (Math.abs(den) < 1e-9) continue;
    const b1 = (dx * z2 - x2 * dz) / den, b2 = (x1 * dz - dx * z1) / den;
    if (b1 < -1e-9 || b2 < -1e-9 || b1 + b2 > 1 + 1e-9) continue;
    return d.hc * (1 - b1 - b2) + p.h * b1 + q.h * b2;
  }
  return undefined;
}
function discHeight(x: number, z: number) {
  const list = roadNet().discGrid.get(hashKey(Math.floor(x / HASH), Math.floor(z / HASH)));
  if (!list) return undefined;
  for (const d of list) { const h = fanAt(d, x, z); if (h !== undefined) return h; }
  return undefined;
}
function ringSegsOf(d: Junction): RingSeg[] {
  const out: RingSeg[] = [];
  for (const ch of d.chains) for (let i = 0; i + 1 < ch.pts.length; i++) {
    const a = ch.pts[i], b = ch.pts[i + 1], seg: RingSeg = { first: i === 0, last: i + 2 === ch.pts.length, x0: a.x, z0: a.z, h0: a.h, o0: ch.out[i], w0: ch.sw[i], x1: b.x, z1: b.z, h1: b.h, o1: ch.out[i + 1], w1: ch.sw[i + 1], nx: (ch.nrm[i][0] + ch.nrm[i + 1][0]) / 2, nz: (ch.nrm[i][1] + ch.nrm[i + 1][1]) / 2, cf: ch.cf };
    const l = Math.hypot(seg.nx, seg.nz) || 1; seg.nx /= l; seg.nz /= l;
    out.push(seg);
  }
  return out;
}
function ringHeightFrom(list: readonly RingSeg[], x: number, z: number) {
  let best = -Infinity;
  for (const s of list) {
    const dx = s.x1 - s.x0, dz = s.z1 - s.z0, len2 = dx * dx + dz * dz, rawT = len2 ? ((x - s.x0) * dx + (z - s.z0) * dz) / len2 : 0, t = Math.max(0, Math.min(1, rawT));
    if ((rawT < 0 && s.first) || (rawT > 1 && s.last)) continue; // além da ponta da cadeia a fita cortada é que responde
    const qx = s.x0 + dx * t, qz = s.z0 + dz * t;
    if ((x - qx) * s.nx + (z - qz) * s.nz <= 0) continue; // do lado do miolo: ele responde
    const dist = Math.hypot(x - qx, z - qz), sw = s.w0 + (s.w1 - s.w0) * t, foot = s.h0 + (s.h1 - s.h0) * t, out = s.o0 + (s.o1 - s.o0) * t, top = foot + CURB * s.cf;
    if (dist <= sw) {
      const h = foot + CURB * s.cf * Math.min(1, dist / CURB_RAMP) + (out - top) * Math.max(0, Math.min(1, (dist - CURB_RAMP) / Math.max(.1, sw - CURB_RAMP)));
      if (h > best) best = h;
    } else {
      const lift = out - terrainHeight(qx + (x - qx) / dist * sw, qz + (z - qz) / dist * sw);
      if (lift <= 0) continue;
      const bevelW = Math.max(BEVEL, Math.min(MAX_BEVEL, lift / 0.16)), dd = dist - sw;
      if (dd < bevelW) best = Math.max(best, terrainHeight(x, z) + lift * (1 - dd / bevelW));
    }
  }
  return best;
}
/** Calçada que contorna as esquinas (fora do polígono): rampa do meio-fio, topo plano e chanfro até o terreno. */
function ringHeight(x: number, z: number) {
  const list = roadNet().ringGrid.get(hashKey(Math.floor(x / HASH), Math.floor(z / HASH)));
  return list ? ringHeightFrom(list, x, z) : -Infinity;
}
/** Altura das faixas em (x, z); `strict` considera só o interior do asfalto (sem chanfro). */
function stripsHeight(grid: Map<number, RoadSegH[]>, x: number, z: number, strict: boolean, level = false) {
  let best = -Infinity;
  const list = grid.get(hashKey(Math.floor(x / HASH), Math.floor(z / HASH)));
  if (!list) return best;
  const terrain = terrainHeight(x, z);
  for (const sg of list) {
    const dx = sg.x1 - sg.x0, dz = sg.z1 - sg.z0, len2 = dx * dx + dz * dz;
    const len = Math.sqrt(len2) || 1;
    const rawT = len2 ? ((x - sg.x0) * dx + (z - sg.z0) * dz) / len2 : 0;
    const t = Math.max(0, Math.min(1, rawT));
    const px = sg.x0 + dx * t, pz = sg.z0 + dz * t;
    const alongOut = rawT < 0 ? -rawT * len : rawT > 1 ? (rawT - 1) * len : 0;
    if (alongOut > MAX_BEVEL || (strict && alongOut > 0)) continue;
    const nx = -dz / len, nz = dx / len;
    const lat = (x - px) * nx + (z - pz) * nz;
    const absLat = Math.abs(lat);
    const latOut = Math.max(0, absLat - sg.half);
    if (latOut > MAX_BEVEL || (strict && latOut > 0)) continue;
    const outDist = alongOut > 0 && latOut > 0 ? Math.hypot(alongOut, latOut) : alongOut + latOut;
    if (outDist > MAX_BEVEL) continue;
    const clampedLat = Math.max(-sg.half, Math.min(sg.half, lat));
    const u = clampedLat / sg.half;
    const hl = sg.hl0 + (sg.hl1 - sg.hl0) * t, hr = sg.hr0 + (sg.hr1 - sg.hr0) * t;
    let h = 0.5 * (hl + hr) + 0.5 * (hl - hr) * u;
    if (sg.sw) {
      // calçada (topo) nas bordas; o asfalto fica CURB abaixo, ligado por uma rampa de CURB_RAMP; `level` = nível do asfalto (cruzamentos)
      const cf = sg.cf0 + (sg.cf1 - sg.cf0) * t, aEdge = sg.half - sg.sw;
      h -= CURB * cf * (level ? 1 : 1 - Math.max(0, Math.min(1, (Math.abs(clampedLat) - aEdge) / CURB_RAMP)));
    }
    if (outDist === 0) {
      if ((strict || h > terrain) && h > best) best = h;
      continue;
    }
    const qx = px + nx * clampedLat, qz = pz + nz * clampedLat;
    const liftAtEdge = h - terrainHeight(qx, qz);
    if (liftAtEdge <= 0) continue;
    const bevelW = Math.max(BEVEL, Math.min(MAX_BEVEL, liftAtEdge / 0.16));
    if (outDist >= bevelW) continue;
    const cand = terrain + liftAtEdge * (1 - outDist / bevelW);
    if (cand > best) best = cand;
  }
  return best;
}
/** Altura do asfalto em (x, z) para a física (mesma superfície da malha: faixas e discos de cruzamento, com transição suave nas bordas); -Infinity fora das ruas. */
export function roadHeightAt(x: number, z: number) {
  const disc = discHeight(x, z);
  if (disc !== undefined) return disc;
  return Math.max(stripsHeight(roadNet().grid, x, z, false), ringHeight(x, z));
}

// ---------------------------------------------------------------------------
// Prédios e casas: lotes procedurais ao longo das vias, mais densos e altos perto do Centro
// ---------------------------------------------------------------------------
export type CityData = ReturnType<typeof buildCity>;
let cityCache: CityData | undefined;
/** Resultado memorizado (determinístico): quem recebe não deve alterá-lo. */
export function cityData(): CityData { return cityCache ??= buildCity(); }

const WALLS = ['#f1e7d3', '#e6d3b3', '#d9c8a9', '#f4f0e6', '#c9b79a', '#e8c9a0', '#b9c4b0', '#cfd8dc', '#e5d0d0', '#d6b98c'].map(hex);
const ROOFS = ['#b4452f', '#a63d2a', '#c25a3a', '#933a2b', '#b8502f'].map(hex);
const SLAB = hex('#8e9399');
/** Módulo opcional `src/flight/bairros.ts` (bairrosLots(): lotes das casas); com ele, as casas procedurais daqui ficam desligadas. */
/** Módulo dos bairros, exposto aqui para que scripts (exportar/render) o usem pelo mesmo bundle e sem ordem de import frágil. */
export const BAIRROS_MOD = Object.values(import.meta.glob<{ bairrosData: () => MeshData; bairrosLots: () => readonly { cx: number; cz: number; w: number; d: number; angle: number; yBase: number; yTop: number }[] }>('./bairros.ts', { eager: true }))[0];
export const HAS_BAIRROS = !!BAIRROS_MOD;
let colliderCache: Box[] | undefined;
/** Colisores de todos os prédios dos bairros (um prisma orientado por lote); os prédios do Centro já vêm em cityData().boxes. */
export function buildingColliders(): Box[] {
  return colliderCache ??= (BAIRROS_MOD?.bairrosLots() ?? []).map((l) => {
    const rx = Math.cos(l.angle), rz = Math.sin(l.angle), hw = l.w / 2 + .2, hd = l.d / 2 + .2;
    const ex = Math.abs(rx) * hw + Math.abs(rz) * hd, ez = Math.abs(rz) * hw + Math.abs(rx) * hd;
    return { x0: l.cx - ex, x1: l.cx + ex, z0: l.cz - ez, z1: l.cz + ez, top: l.yTop, bottom: l.yBase - .3, obb: { cx: l.cx, cz: l.cz, hw, hd, rx, rz } };
  });
}
/** Fator de ocupação dos lotes: mantém o GLB da cidade perto de 2,5 MB. */
const HOUSE_DENSITY = 2.2;

function buildCity() {
  const boxes: Box[] = [];
  const r = rng(2024);
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const hp: number[] = [], hc: number[] = [], hi: number[] = [];
  const ROOF_UV = 0.5;
  const hash = new Map<number, Box[]>();
  const put = (b: Box) => {
    boxes.push(b);
    for (let gx = Math.floor(b.x0 / 100); gx <= Math.floor(b.x1 / 100); gx++) for (let gz = Math.floor(b.z0 / 100); gz <= Math.floor(b.z1 / 100); gz++) {
      const k = hashKey(gx, gz); let l = hash.get(k); if (!l) hash.set(k, l = []); l.push(b);
    }
  };
  const overlaps = (x0: number, x1: number, z0: number, z1: number) => {
    for (let gx = Math.floor(x0 / 100); gx <= Math.floor(x1 / 100); gx++) for (let gz = Math.floor(z0 / 100); gz <= Math.floor(z1 / 100); gz++) {
      for (const b of hash.get(hashKey(gx, gz)) ?? []) if (x0 < b.x1 + 2 && x1 > b.x0 - 2 && z0 < b.z1 + 2 && z1 > b.z0 - 2) return true;
    }
    return false;
  };
  const corners = (x0: number, x1: number, z0: number, z1: number) => [terrainHeight(x0, z0), terrainHeight(x1, z0), terrainHeight(x0, z1), terrainHeight(x1, z1)];
  const addRoofBox = (bx0: number, bx1: number, bz0: number, bz1: number, by0: number, by1: number, sideCol: number[], topCol: number[]) => {
    const base = pos.length / 3;
    const ring: [number, number][] = [[bx0, bz1], [bx1, bz1], [bx1, bz0], [bx0, bz0]];
    for (const [px, pz] of ring) { pos.push(px, by0, pz); uv.push(ROOF_UV, ROOF_UV); col.push(sideCol[0], sideCol[1], sideCol[2], 255); }
    for (const [px, pz] of ring) { pos.push(px, by1, pz); uv.push(ROOF_UV, ROOF_UV); col.push(topCol[0], topCol[1], topCol[2], 255); }
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      idx.push(base + i, base + j, base + 4 + j, base + i, base + 4 + j, base + 4 + i);
    }
    idx.push(base + 4, base + 5, base + 6, base + 4, base + 6, base + 7);
  };
  const addBuilding = (x: number, z: number, w: number, d: number, h: number, c: number[], isHelipad = false) => {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const heights = corners(x0, x1, z0, z1);
    const yGround = Math.max(...heights);
    const y0 = Math.min(...heights) - 1.2;
    const nFloors = Math.max(3, Math.round(h / WINDOW_M));
    const y1 = isHelipad ? yGround + h : yGround + nFloors * WINDOW_M;
    const shade = 0.90 + r() * 0.14;
    const [cr, cg, cb] = c.map((v) => Math.min(255, Math.round(v * shade)));
    const roof = [Math.min(255, Math.round(cr * 0.76 + 18)), Math.min(255, Math.round(cg * 0.76 + 18)), Math.min(255, Math.round(cb * 0.76 + 20))];
    const u0 = Math.floor(r() * TEX_WINDOWS) / TEX_WINDOWS;
    const br = rng(Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(z * 10), 19349663) ^ 0x51a7);
    const dcB = dcCentro(x, z);
    const faces: [number, number, number, number][] = [[x0, z1, x1, z1], [x1, z1, x1, z0], [x1, z0, x0, z0], [x0, z0, x0, z1]];
    const pushBand = (ya: number, yb: number, va: number, vb: number, uOff: number) => {
      // Torres fora do miolo do Centro usam anel compartilhado (8 vértices por faixa) para manter o mundo < 5,1 MB
      if (!isHelipad && dcB >= 650) {
        const cols = Math.min(4, Math.max(2, Math.round(Math.max(w, d) / WINDOW_M)));
        const uA = uOff < 0.5 ? 0 : 0.5;
        const uB = uA + cols / TEX_WINDOWS;
        const base = pos.length / 3;
        const ring: [number, number, number][] = [
          [x0, z1, uA], [x1, z1, uB], [x1, z0, uA], [x0, z0, uB],
        ];
        for (const [px, pz, pu] of ring) { pos.push(px, ya, pz); uv.push(pu, va); col.push(cr, cg, cb, 255); }
        for (const [px, pz, pu] of ring) { pos.push(px, yb, pz); uv.push(pu, vb); col.push(cr, cg, cb, 255); }
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          idx.push(base + i, base + j, base + 4 + j, base + i, base + 4 + j, base + 4 + i);
        }
        return;
      }
      for (const [ax, az, bx, bz] of faces) {
        const base = pos.length / 3, len = Math.hypot(bx - ax, bz - az);
        const cols = Math.max(2, Math.round(len / WINDOW_M));
        const uMax = uOff + cols / TEX_WINDOWS;
        pos.push(ax, ya, az, bx, ya, bz, bx, yb, bz, ax, yb, az);
        uv.push(uOff, va, uMax, va, uMax, vb, uOff, vb);
        for (let k = 0; k < 4; k++) col.push(cr, cg, cb, 255);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    };
    // Térreo + primeiros 14 andares superiores numa única faixa (v=0 no térreo, v=15/16 no 15º piso)
    const maxSingle = TEX_ROWS - 1; // 15 pisos (48 m) sem corte vertical extra
    const firstFloors = Math.min(maxSingle, nFloors);
    const ySplit = nFloors <= maxSingle ? y1 : yGround + maxSingle * WINDOW_M;
    const vBot = Math.max(-0.012, ((y0 - yGround) / WINDOW_M) / TEX_ROWS);
    pushBand(y0, ySplit, vBot, firstFloors / TEX_ROWS, u0);
    // Andares extras somente nas torres mais altas (> 48 m): usa as 14 fileiras superiores (v = 1/16..15/16)
    let rem = nFloors - maxSingle;
    let yCur = ySplit;
    let band = 1;
    while (rem > 0) {
      const chunk = Math.min(TEX_ROWS - 2, rem);
      const yNext = rem <= TEX_ROWS - 2 ? y1 : yCur + chunk * WINDOW_M;
      pushBand(yCur, yNext, 1 / TEX_ROWS, (1 + chunk) / TEX_ROWS, u0 + (band * 3) / TEX_WINDOWS);
      yCur = yNext;
      rem -= chunk;
      band++;
    }
    // Laje de topo (sem janelas: amostra a faixa de concreto em v=0,5)
    const base = pos.length / 3;
    pos.push(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0);
    for (let k = 0; k < 4; k++) { uv.push(ROOF_UV, ROOF_UV); col.push(roof[0], roof[1], roof[2], 255); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);

    // Casa de máquinas e caixa d'água deslocadas para um canto (mantém centro da laje livre e preserva o heliponto)
    if (!isHelipad) {
      const sx = br() < 0.5 ? -1 : 1, sz = br() < 0.5 ? -1 : 1;
      const wallCol = [Math.min(255, Math.round(cr * 0.84 + 14)), Math.min(255, Math.round(cg * 0.84 + 14)), Math.min(255, Math.round(cb * 0.84 + 14))];
      const capCol = [Math.min(255, Math.round(cr * 0.92 + 12)), Math.min(255, Math.round(cg * 0.92 + 12)), Math.min(255, Math.round(cb * 0.92 + 12))];
      if (nFloors >= 5 && (dcB < 680 || br() < 0.20)) {
        const mw = Math.min(w * 0.34, 4.0 + br() * 2.2);
        const md = Math.min(d * 0.34, 3.8 + br() * 2.0);
        const mh = 2.3 + br() * 1.2;
        const mcx = x + sx * (w / 2 - mw / 2 - 1.2);
        const mcz = z + sz * (d / 2 - md / 2 - 1.2);
        addRoofBox(mcx - mw / 2, mcx + mw / 2, mcz - md / 2, mcz + md / 2, y1, y1 + mh, wallCol, capCol);
        if (nFloors >= 9 && dcB < 580) {
          const tw = mw * 0.56, td = md * 0.56, th = 1.7 + br() * 0.9;
          const tankSide = [168, 176, 184], tankTop = [196, 204, 212];
          addRoofBox(mcx - tw / 2, mcx + tw / 2, mcz - td / 2, mcz + td / 2, y1 + mh, y1 + mh + th, tankSide, tankTop);
        }
      }
    }

    const box: Box = { x0, x1, z0, z1, top: y1, bottom: y0 };
    put(box);
    return box;
  };
  /** Casa leve: 13 vértices (base, beiral de parede, beiral de telhado, cumeeira); laje plana quando `flat`. */
  const addHouse = (x: number, z: number, w: number, d: number, floors: number, wall: number[], roof: number[], flat: boolean) => {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const heights = corners(x0, x1, z0, z1);
    const y0 = Math.min(...heights) - .8, eave = Math.max(...heights) + floors * 3.2, apex = flat ? eave + .3 : eave + Math.min(w, d) * .28;
    const ring = [[x0, z1], [x1, z1], [x1, z0], [x0, z0]], base = hp.length / 3;
    for (const [px, pz] of ring) { hp.push(px, y0, pz); hc.push(wall[0], wall[1], wall[2], 255); }
    for (const [px, pz] of ring) { hp.push(px, eave, pz); hc.push(wall[0], wall[1], wall[2], 255); }
    for (const [px, pz] of ring) { hp.push(px, eave, pz); hc.push(roof[0], roof[1], roof[2], 255); }
    hp.push(x, apex, z); hc.push(roof[0], roof[1], roof[2], 255);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      hi.push(base + i, base + j, base + 4 + j, base + i, base + 4 + j, base + 4 + i, base + 8 + i, base + 8 + j, base + 12);
    }
    put({ x0, x1, z0, z1, top: apex, bottom: y0 });
  };

  // Torre do heliponto: prédio alto do Centro, com rampa externa até a laje
  const tower = addBuilding(TOWER_SPOT.x, TOWER_SPOT.z, 26, 26, 46, hex('#cfd5dc'), true);
  const helipad = { x: (tower.x0 + tower.x1) / 2, z: (tower.z0 + tower.z1) / 2, y: tower.top };

  const RESERVED = [
    { x: UNI_CENTER.x, z: UNI_CENTER.z, r: 62 }, { x: WORKSHOP_SPOT.x, z: WORKSHOP_SPOT.z, r: 26 }, { x: CRISTO.x, z: CRISTO.z, r: 120 }, { x: TOWER_SPOT.x, z: TOWER_SPOT.z, r: 46 }, // rampa da torre do heliponto
  ];
  let houses = 0;
  const PROTECTED = protectedSpots();
  const PITCH = 20;
  for (let gz = -2900; gz <= 2900; gz += PITCH) {
    for (let gx = -2900; gx <= 2900; gx += PITCH) {
      const cx = gx + (r() - 0.5) * 8, cz = gz + (r() - 0.5) * 8;
      const roll = r(), kindRoll = r(), sizeRoll = r(), sizeRoll2 = r(), heightRoll = r(), colorRoll = r(), roofRoll = r(), flatRoll = r();
      const gap = gapToRoads(cx, cz);
      if (gap < 5.5 || (gap > 58 && !(gap === Infinity && dcCentro(cx, cz) < 1100))) continue; // miolo dos quarteirões do Centro
      const dc = dcCentro(cx, cz), elev = terrainHeight(cx, cz);
      const density = (0.14 + 0.95 * Math.exp(-((dc / 1500) ** 2))) * (1 - 0.85 * smoothstep(70, 200, elev)) * HOUSE_DENSITY;
      if (roll > density) continue;
      if (inAnyArea(cx, cz) || RESERVED.some((q) => Math.hypot(cx - q.x, cz - q.z) < q.r)) continue;
      const { s, l } = runwayFrame(cx, cz);
      if (s > -120 && s < RWY_LEN + 120 && Math.abs(l) < 140) continue;
      const isTower = dc < 1250 && kindRoll < (dc < 650 ? 0.55 : 0.2);
      if (HAS_BAIRROS && !isTower) continue;
      const w = isTower ? (dc < 650 ? 16 + sizeRoll * 12 : 14 + sizeRoll * 8) : 11 + sizeRoll * 8;
      const d = isTower ? (dc < 650 ? 16 + sizeRoll2 * 12 : 14 + sizeRoll2 * 8) : 11 + sizeRoll2 * 8;
      if (PROTECTED.some((q) => Math.hypot(cx - q.x, cz - q.z) < q.r + Math.max(w, d) * .7)) continue;
      const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
      if (overlaps(x0, x1, z0, z1)) continue;
      if ([[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx, z0], [cx, z1], [x0, cz], [x1, cz]].some(([px, pz]) => gapToRoads(px, pz) < 2.5)) continue;
      const hs = corners(x0, x1, z0, z1);
      if (Math.max(...hs) - Math.min(...hs) > 3.2) continue;
      if (isTower) {
        const tall = Math.exp(-((dc / 380) ** 2));
        addBuilding(cx, cz, w, d, dc < 650 ? 14 + heightRoll * 20 + tall * (20 + heightRoll * 40) : 9 + heightRoll * 11, FACADES[Math.floor(colorRoll * FACADES.length)]);
      } else {
        addHouse(cx, cz, w, d, 1 + Math.floor(heightRoll * (dc < 900 ? 3.99 : 2.99)), WALLS[Math.floor(colorRoll * WALLS.length)], flatRoll < 0.28 ? SLAB : ROOFS[Math.floor(roofRoll * ROOFS.length)], flatRoll < 0.28);
        houses++;
      }
    }
  }

  // Parques/praças (compatível com o minimapa): caixas dos polígonos reais
  const parks: Box[] = parkPolys.map((p) => ({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, top: terrainHeight((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2) }));
  // Quarteirões: agrupamento dos prédios em células de 160 m
  const cells = new Map<number, Box>();
  for (const b of boxes) {
    const k = hashKey(Math.floor((b.x0 + b.x1) / 2 / 160), Math.floor((b.z0 + b.z1) / 2 / 160)), c = cells.get(k);
    if (!c) cells.set(k, { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, top: b.top });
    else { c.x0 = Math.min(c.x0, b.x0); c.x1 = Math.max(c.x1, b.x1); c.z0 = Math.min(c.z0, b.z0); c.z1 = Math.max(c.z1, b.z1); c.top = Math.max(c.top, b.top); }
  }
  return { mesh: geometry(pos, idx, col, uv), houses: geometry(hp, hi, hc), houseCount: houses, boxes, parks, blocks: [...cells.values()], helipad, tower };
}

export function windowImages() {
  const colPx = 64;
  const rowPx = 32;
  const size = colPx * TEX_WINDOWS; // 512 x 512 (8 colunas x 16 fileiras de pisos)
  const r = rng(77);
  const diffuse = image(size, size);
  const emissive = image(size, size);
  const gd = painter(diffuse);
  const ge = painter(emissive);
  // Base de reboco neutro (91%): deixa caixilhos claros (#ffffff) e faixas de laje (#f8f6f1) destacarem
  gd.fillStyle = '#e7e4de';
  gd.fillRect(0, 0, size, size);
  ge.fillStyle = '#000000';
  ge.fillRect(0, 0, size, size);

  // Faixas horizontais de laje entre todos os andares (simétricas: funcionam em PlayCanvas e glTF).
  // A faixa em y=256 (v=0,5) tem 14 px livres de vidro ao redor e serve de concreto limpo para lajes e caixas d'água.
  for (let row = 1; row < TEX_ROWS; row++) {
    const sy = row * rowPx;
    gd.fillStyle = '#b9b5ad';
    gd.fillRect(0, sy - 4, size, 8);
    gd.fillStyle = '#f8f6f1';
    gd.fillRect(0, sy - 3, size, 6);
  }

  // Térreo em duas metades horizontais no mesmo atlas (Row 0 para glTF e Row 15 espelhada para PlayCanvas):
  // - Colunas 0..3 (u = 0..0,5): térreo comercial (vitrines, porta de loja/prédio e marquise discreta)
  // - Colunas 4..7 (u = 0,5..1): térreo residencial (porta de madeira c/ batente claro e janelas residenciais c/ caixilho)
  const awningPalette = ['#9e7660', '#637a8c', '#8e8068', '#a6876d'];
  const drawGroundRow = (flipCanvas: boolean) => {
    const gy = (fromBot: number, h: number) => (flipCanvas ? size - fromBot - h : fromBot);
    // Rodapé de pedra/concreto contínuo na base
    gd.fillStyle = '#8b8882';
    gd.fillRect(0, gy(0, 5), size, 5);
    gd.fillStyle = '#6f6c67';
    gd.fillRect(0, gy(5, 1), size, 1);
    // Marquise contínua apenas na metade comercial (cols 0..3)
    gd.fillStyle = '#b4ada0';
    gd.fillRect(0, gy(25, 3), 4 * colPx, 3);
    for (let col = 0; col < TEX_WINDOWS; col++) {
      const bx = col * colPx;
      if (col < 4) {
        // Metade comercial (cols 0..3): porta em col 1, vitrines amplas em cols 0, 2, 3
        gd.fillStyle = '#f8f6f1';
        gd.fillRect(bx + 4, gy(6, 19), 56, 19);
        if (col === 1) {
          gd.fillStyle = '#5a4a3f';
          gd.fillRect(bx + 12, gy(6, 17), 40, 17);
          gd.fillStyle = '#3b536b';
          gd.fillRect(bx + 16, gy(9, 11), 14, 11);
          gd.fillRect(bx + 34, gy(9, 11), 14, 11);
          gd.fillStyle = '#d8c59e';
          gd.fillRect(bx + 16, gy(21, 2), 32, 2);
        } else {
          gd.fillStyle = '#2d4760';
          gd.fillRect(bx + 7, gy(7, 17), 50, 17);
          gd.fillStyle = '#6b94b6';
          gd.fillRect(bx + 10, gy(8, 15), 11, 15);
          if (col % 2 === 0) {
            gd.fillStyle = '#b89f79';
            gd.fillRect(bx + 26, gy(8, 11), 27, 11);
          }
          gd.fillStyle = '#f4f1ea';
          gd.fillRect(bx + 31, gy(7, 17), 2, 17);
          gd.fillStyle = awningPalette[col % awningPalette.length];
          gd.fillRect(bx + 5, gy(23, 3), 54, 3);
        }
      } else if (col === 5) {
        // Metade residencial (col 5): porta residencial de madeira com batente claro e bandeira de vidro
        gd.fillStyle = '#f8f6f1';
        gd.fillRect(bx + 14, gy(5, 22), 36, 22);
        gd.fillStyle = '#6d4d3a';
        gd.fillRect(bx + 18, gy(5, 19), 28, 19);
        gd.fillStyle = '#523829';
        gd.fillRect(bx + 21, gy(7, 8), 22, 8);
        gd.fillStyle = '#6f96b6';
        gd.fillRect(bx + 21, gy(17, 5), 22, 5);
        gd.fillStyle = '#d8d2c6';
        gd.fillRect(bx + 12, gy(25, 2), 40, 2);
      } else {
        // Metade residencial (cols 4, 6, 7): janela residencial com caixilho claro, peitoril, vidro azulado e cortina
        const wx = bx + 11;
        gd.fillStyle = '#ffffff';
        gd.fillRect(wx - 3, gy(8, 19), 48, 19);
        gd.fillStyle = col === 6 ? '#3a5a78' : '#466a8b';
        gd.fillRect(wx, gy(10, 15), 42, 15);
        gd.fillStyle = '#7ea9cc';
        gd.fillRect(wx + 3, gy(11, 13), 11, 13);
        if (col === 4) {
          gd.fillStyle = '#ddd6c7';
          gd.fillRect(wx + 31, gy(11, 13), 10, 13);
        }
        gd.fillStyle = '#f8f6f1';
        gd.fillRect(wx + 20, gy(10, 15), 2, 15);
        gd.fillRect(wx, gy(17, 2), 42, 2);
        gd.fillStyle = '#c5c0b6';
        gd.fillRect(wx - 4, gy(7, 2), 50, 2);
      }
    }
  };
  drawGroundRow(false);
  drawGroundRow(true);

  // Andares superiores (Rows 1..14): caixilho claro, vidro azulado com reflexo de céu, cortinas e variação aceso/apagado
  const glassCool = ['#3f6180', '#375673', '#4b7091', '#324e68'];
  for (let row = 1; row < TEX_ROWS - 1; row++) {
    for (let col = 0; col < TEX_WINDOWS; col++) {
      const wx = col * colPx + 11;
      const wy = row * rowPx + 7;
      const ww = 42;
      const wh = 18;
      const roll = r();
      const glassPick = Math.floor(r() * glassCool.length);
      const curtainSide = r() < 0.5;

      // Caixilho claro (destaca sobre o reboco 91%)
      gd.fillStyle = '#ffffff';
      gd.fillRect(wx - 3, wy - 2, ww + 6, wh + 4);

      // Vidro azulado com reflexo sutil do céu
      gd.fillStyle = glassCool[glassPick];
      gd.fillRect(wx, wy, ww, wh);
      gd.fillStyle = '#7da8cb';
      gd.fillRect(wx + 3, wy + 1, 11, wh - 2);

      // Variação de cortina clara, reflexo de céu ou interior suavemente iluminado (harmonioso de dia)
      if (roll < 0.13) {
        gd.fillStyle = roll < 0.06 ? '#cfc0a2' : '#c0ae8e';
        gd.fillRect(wx + 2, wy + 1, ww - 4, wh - 2);
        gd.fillStyle = '#89acc9';
        gd.fillRect(wx + 4, wy + 2, 9, wh - 4);
        ge.fillStyle = roll < 0.07 ? '#ffd68a' : '#efb866';
        ge.fillRect(wx + 2, wy + 1, ww - 4, wh - 2);
      } else if (roll < 0.48) {
        gd.fillStyle = '#ddd6c7';
        gd.fillRect(curtainSide ? wx + 1 : wx + ww - 11, wy + 1, 10, wh - 2);
      } else if (roll < 0.62) {
        gd.fillStyle = '#6c95b8';
        gd.fillRect(wx + 2, wy + 1, ww - 4, wh - 2);
      }

      // Montante vertical e travessa horizontal centrais do caixilho
      gd.fillStyle = '#f8f6f1';
      gd.fillRect(wx + 20, wy, 2, wh);
      gd.fillRect(wx, wy + 8, ww, 2);
    }
  }
  return { diffuse, emissive };
}

export function skyImage() {
  const c = image(4, 256);
  const g = painter(c);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3e3f86'); // topo
  grad.addColorStop(0.32, '#8a6fb8');
  grad.addColorStop(0.47, '#f2a27a');
  grad.addColorStop(0.5, '#fbb98c'); // horizonte
  grad.addColorStop(1, '#fbb98c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  return c;
}

export type CloudData = { position: [number, number, number]; puffs: { shade: boolean; scale: [number, number, number]; position: [number, number, number] }[] };
export function cloudData() {
  const r = rng(5);
  const clouds: CloudData[] = [];
  for (let i = 0; i < 46; i++) {
    const cx = (r() - 0.5) * WORLD_SIZE * 1.1;
    const cz = (r() - 0.5) * WORLD_SIZE * 1.1;
    const cy = 650 + r() * 500;
    const parts = 3 + Math.floor(r() * 4);
    const g: CloudData = { position: [cx, cy, cz], puffs: [] };
    clouds.push(g);
    for (let k = 0; k < parts; k++) {
      const s = 70 + r() * 110;
      g.puffs.push({
        shade: k === 0, scale: [s * 1.7, s * 0.45, s],
        position: [(r() - 0.5) * 220, k === 0 ? -15 : r() * 25, (r() - 0.5) * 140],
      });
    }
  }
  return clouds;
}

export type WorldPart = { name: string; mesh: MeshData };

// ---------------------------------------------------------------------------
// Aeroporto da Serrinha (pista real, plana), hangar, heliponto e rampa de acesso
// ---------------------------------------------------------------------------
/** Pista, hangar e heliponto compartilhados entre o jogo e a exportação para GLB. */
export function airportData(helipad = cityData().helipad, roof: Box = cityData().tower) {
  const parts: WorldPart[] = [];
  const rectangle = (name: string, x: number, y: number, z: number, w: number, d: number, color: number[]) => {
    parts.push({ name, mesh: geometry([x-w/2,y,z+d/2, x+w/2,y,z+d/2, x+w/2,y,z-d/2, x-w/2,y,z-d/2], [0,1,2,0,2,3], Array.from({ length: 4 }, () => [...color,255]).flat()) });
  };
  /** Retângulo no sistema da pista: s ao longo (sul→norte), l lateral. */
  const strip = (name: string, s0: number, s1: number, l0: number, l1: number, lift: number, color: number[]) => {
    const p = [runwayPoint(s0, l0), runwayPoint(s1, l0), runwayPoint(s1, l1), runwayPoint(s0, l1)];
    // ordem sul-esquerda, norte-esquerda, norte-direita, sul-direita: normal para cima
    parts.push({ name, mesh: geometry(p.flatMap((q) => [q.x, AIRPORT.y + lift, q.z]), [0,2,1,0,3,2], Array.from({ length: 4 }, () => [...color,255]).flat()) });
  };
  const white = [245,240,215];
  strip('Pista 03/21', 0, RWY_LEN, -15, 15, 0, [55,58,65]);
  for (let s = 40; s <= RWY_LEN - 40; s += 40) strip('Faixa central', s - 10, s + 10, -.5, .5, .02, white);
  for (const s of [5, RWY_LEN - 25]) for (const l of [-10,-6,6,10]) strip('Cabeceira', s, s + 20, l - 1, l + 1, .02, white);
  for (const l of [-14, 14]) strip('Borda', 0, RWY_LEN, l - .15, l + .15, .02, white);
  // Hangar aberto: três paredes e telhado; a porta continua transitável.
  const top = AIRPORT.y + 12;
  const boxes: Box[] = [
    { x0: HANGAR.x0, x1: HANGAR.x0 + 1, z0: HANGAR.z0, z1: HANGAR.z1, top, bottom: AIRPORT.y - 1 },
    { x0: HANGAR.x1 - 1, x1: HANGAR.x1, z0: HANGAR.z0, z1: HANGAR.z1, top, bottom: AIRPORT.y - 1 },
    { x0: HANGAR.x0, x1: HANGAR.x1, z0: HANGAR.z0, z1: HANGAR.z0 + 1, top, bottom: AIRPORT.y - 1 },
  ];
  const wall = (b: Box) => {
    const { x0, x1, z0, z1 } = b, y = AIRPORT.y;
    const p = [x0,y,z1,x1,y,z1,x1,top,z1,x0,top,z1, x1,y,z0,x0,y,z0,x0,top,z0,x1,top,z0, x0,y,z0,x0,y,z1,x0,top,z1,x0,top,z0, x1,y,z1,x1,y,z0,x1,top,z0,x1,top,z1];
    parts.push({ name: 'Parede do hangar', mesh: geometry(p, Array.from({ length: 4 }, (_, i) => [i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3]).flat(), Array.from({ length: 16 }, () => [150,165,180,255]).flat()) });
  };
  boxes.forEach(wall);
  const hx = (HANGAR.x0 + HANGAR.x1) / 2, hz = (HANGAR.z0 + HANGAR.z1) / 2, hw = HANGAR.x1 - HANGAR.x0, hd = HANGAR.z1 - HANGAR.z0;
  rectangle('Cobertura do hangar', hx, top, hz, hw, hd, [115,130,145]);
  rectangle('Piso do hangar', hx, AIRPORT.y, hz, hw, hd, [100,105,110]);
  boxes.push({ x0: HANGAR.x0, x1: HANGAR.x1, z0: HANGAR.z0, z1: HANGAR.z1, top, bottom: top - .2 });
  // Heliponto no alto da torre do Centro
  const { x, y, z } = helipad;
  rectangle('Heliponto', x, y + .01, z, 24, 24, [60,70,75]);
  for (const dx of [-5, 5]) rectangle('H', x + dx, y + .03, z, 1.5, 14, [245,230,110]);
  rectangle('H', x, y + .03, z, 10, 1.5, [245,230,110]);
  // Rampa externa contínua (espiral quadrada): 6 m de largura, inclinação 0,30, patamares planos nos cantos, guarda-corpo dos dois lados.
  // Física = malha: cada trecho é uma caixa de rampa (altura interpolada) e cada patamar uma caixa plana.
  const HALF_W = 3, OFF = 7, SLOPE = .3, RAIL_H = 1.1, RAIL_T = .15, CHUNK = 6;
  const cxs = [roof.x1 + OFF, roof.x1 + OFF, roof.x0 - OFF, roof.x0 - OFF], czs = [roof.z1 + OFF, roof.z0 - OFF, roof.z0 - OFF, roof.z1 + OFF];
  const deckColor = [155, 160, 165, 255];
  const railPos: number[] = [], railIdx: number[] = [];
  // Estrutura de concreto sob o piso: laje de 40 cm (laterais e face inferior fechadas, todas voltadas para fora), sem pilares nem paredão
  const SLAB = .4, structPos: number[] = [], structIdx: number[] = [];
  const solid = (top: [number, number, number][], bottom: [number, number, number][]) => {
    const base = structPos.length / 3, all = [...top, ...bottom];
    for (const q of all) structPos.push(...q);
    const c = [0, 1, 2].map((a) => all.reduce((t, q) => t + q[a], 0) / 8);
    // faces sem o topo (o piso já existe): 4 laterais e a de baixo
    for (const quad of [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]]) for (const t of [[0, 1, 2], [0, 2, 3]]) {
      const [i0, i1, i2] = t.map((i) => quad[i]), a = all[i0], b = all[i1], d = all[i2];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const out = n[0] * ((a[0] + b[0] + d[0]) / 3 - c[0]) + n[1] * ((a[1] + b[1] + d[1]) / 3 - c[1]) + n[2] * ((a[2] + b[2] + d[2]) / 3 - c[2]);
      structIdx.push(base + i0, ...(out >= 0 ? [base + i1, base + i2] : [base + i2, base + i1]));
    }
  };
  /** laje sob um quadrilátero de piso [x, y, z] x4 (mesma ordem do piso) */
  const slab = (q: [number, number, number][]) => solid(q, q.map(([x, y, z]) => [x, y - SLAB, z] as [number, number, number]));
  /** Guarda-corpo reto ao longo de um eixo, de (ax,az) a (bx,bz), acompanhando a altura do piso; vira caixa de colisão e prisma de 8 vértices. */
  const rail = (ax: number, az: number, ay: number, bx: number, bz: number, by: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < .2) return;
    const dx = (bx - ax) / len, dz = (bz - az) / len, nx = dz * RAIL_T, nz = -dx * RAIL_T, base = railPos.length / 3;
    for (const [x, z, ry] of [[ax, az, ay], [bx, bz, by]]) for (const s of [-1, 1]) for (const h of [0, RAIL_H]) railPos.push(x + nx * s, ry + h, z + nz * s);
    const c = [(ax + bx) / 2, (Math.min(ay, by) + Math.max(ay, by) + RAIL_H) / 2, (az + bz) / 2];
    for (const t of [[0, 1, 3], [0, 3, 2], [4, 6, 7], [4, 7, 5], [0, 4, 5], [0, 5, 1], [2, 3, 7], [2, 7, 6], [0, 2, 6], [0, 6, 4], [1, 5, 7], [1, 7, 3]]) {
      const p = t.map((i) => [railPos[(base + i) * 3], railPos[(base + i) * 3 + 1], railPos[(base + i) * 3 + 2]]);
      const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
      const n3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const dot = n3[0] * ((p[0][0] + p[1][0] + p[2][0]) / 3 - c[0]) + n3[1] * ((p[0][1] + p[1][1] + p[2][1]) / 3 - c[1]) + n3[2] * ((p[0][2] + p[1][2] + p[2][2]) / 3 - c[2]);
      railIdx.push(...(dot >= 0 ? [base + t[0], base + t[1], base + t[2]] : [base + t[0], base + t[2], base + t[1]]));
    }
    boxes.push({ x0: Math.min(ax, bx) - RAIL_T, x1: Math.max(ax, bx) + RAIL_T, z0: Math.min(az, bz) - RAIL_T, z1: Math.max(az, bz) + RAIL_T, top: Math.max(ay, by) + RAIL_H, bottom: Math.min(ay, by) - .05 });
  };
  const railAlong = (ax: number, az: number, ay: number, bx: number, bz: number, by: number) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / CHUNK));
    for (let i = 0; i < n; i++) rail(ax + (bx - ax) * i / n, az + (bz - az) * i / n, ay + (by - ay) * i / n, ax + (bx - ax) * (i + 1) / n, az + (bz - az) * (i + 1) / n, ay + (by - ay) * (i + 1) / n);
  };
  const side = (from: number, to: number) => { const dx = Math.sign(cxs[to % 4] - cxs[from % 4]), dz = Math.sign(czs[to % 4] - czs[from % 4]); return dx > 0 ? 'E' : dx < 0 ? 'W' : dz > 0 ? 'S' : 'N'; };
  const landingAt = (x: number, z: number, ry: number, open: string[]) => {
    parts.push({ name: 'Patamar da rampa', mesh: geometry([x - HALF_W, ry, z + HALF_W, x + HALF_W, ry, z + HALF_W, x + HALF_W, ry, z - HALF_W, x - HALF_W, ry, z - HALF_W], [0, 1, 2, 0, 2, 3], Array.from({ length: 4 }, () => deckColor).flat()) });
    slab([[x - HALF_W, ry, z + HALF_W], [x + HALF_W, ry, z + HALF_W], [x + HALF_W, ry, z - HALF_W], [x - HALF_W, ry, z - HALF_W]]);
    // sem caixa própria: o piso do patamar vem do prolongamento plano das caixas de rampa vizinhas (sem degrau de parede para o carro)
    const e = HALF_W - RAIL_T;
    if (!open.includes('N')) rail(x - HALF_W, z - e, ry, x + HALF_W, z - e, ry);
    if (!open.includes('S')) rail(x - HALF_W, z + e, ry, x + HALF_W, z + e, ry);
    if (!open.includes('E')) rail(x + e, z - HALF_W, ry, x + e, z + HALF_W, ry);
    if (!open.includes('W')) rail(x - e, z - HALF_W, ry, x - e, z + HALF_W, ry);
  };
  const landing = (k: number, ry: number, open: string[]) => landingAt(cxs[k % 4], czs[k % 4], ry, open);
  const label = (dx: number, dz: number) => (dx > 0 ? 'E' : dx < 0 ? 'W' : dz > 0 ? 'S' : 'N');
  const opposite = (l: string) => ({ N: 'S', S: 'N', E: 'W', W: 'E' } as Record<string, string>)[l];
  const access = [{ x: cxs[0], y: terrainHeight(cxs[0], czs[0]) + .05, z: czs[0] }];
  let ry = access[0].y, k = 0;
  landing(0, ry, ['N', 'S', 'E', 'W']); // patamar de entrada no nível do chão: aberto (sem guarda-corpo), a entrada vale por qualquer lado
  for (let guard = 0; guard < 12 && ry < helipad.y - .001; guard++, k++) {
    const x0 = cxs[k % 4], z0 = czs[k % 4], x1 = cxs[(k + 1) % 4], z1 = czs[(k + 1) % 4], dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
    const full = Math.hypot(x1 - x0, z1 - z0) - 2 * HALF_W, needed = (helipad.y - ry) / SLOPE, run = Math.min(full, needed), y1 = ry + run * SLOPE;
    const sx = x0 + dx * HALF_W, sz = z0 + dz * HALF_W, ex = sx + dx * run, ez = sz + dz * run, px = dz * HALF_W, pz = -dx * HALF_W;
    parts.push({ name: 'Rampa do heliponto', mesh: geometry([sx + px, ry, sz + pz, sx - px, ry, sz - pz, ex - px, y1, ez - pz, ex + px, y1, ez + pz], [0, 1, 2, 0, 2, 3], Array.from({ length: 4 }, () => deckColor).flat()) });
    slab([[sx + px, ry, sz + pz], [sx - px, ry, sz - pz], [ex - px, y1, ez - pz], [ex + px, y1, ez + pz]]);
    // a caixa do trecho se prolonga 6 m (um patamar) além do fim, e 6 m antes do início no primeiro trecho: topo plano ali (t preso em 0 ou 1)
    const bx0 = sx - dx * (k === 0 ? 2 * HALF_W : 0), bz0 = sz - dz * (k === 0 ? 2 * HALF_W : 0), bx1 = ex + dx * 2 * HALF_W, bz1 = ez + dz * 2 * HALF_W;
    boxes.push({ x0: Math.min(bx0, bx1) - Math.abs(px), x1: Math.max(bx0, bx1) + Math.abs(px), z0: Math.min(bz0, bz1) - Math.abs(pz), z1: Math.max(bz0, bz1) + Math.abs(pz), top: y1, bottom: ry - .12, ramp: { x0: sx, z0: sz, x1: ex, z1: ez, y0: ry, y1 } });
    const arrived = needed <= full + 1e-6, e = HALF_W - RAIL_T, nx = dz * e, nz = -dx * e;
    // lado de fora sempre fechado; lado do prédio (dentro) fechado, exceto onde a ponte para a laje sai da rampa
    for (const s of [-1, 1]) railAlong(sx + s * nx, sz + s * nz, ry, ex + s * nx, ez + s * nz, y1);
    access.push({ x: arrived ? ex : x1, y: y1, z: arrived ? ez : z1 });
    if (arrived) {
      // patamar plano de chegada logo após o fim do trecho e ponte plana dele até dentro da laje (3 m além da parede)
      const tx = Math.sign((roof.x0 + roof.x1) / 2 - ex) * (Math.abs(dz) > 0 ? 1 : 0), tz = Math.sign((roof.z0 + roof.z1) / 2 - ez) * (Math.abs(dx) > 0 ? 1 : 0), reach = OFF + 3;
      const lx = ex + dx * HALF_W, lz = ez + dz * HALF_W;
      landingAt(lx, lz, y1, [opposite(label(dx, dz)), label(tx, tz)]);
      const bx0 = lx + tx * HALF_W, bz0 = lz + tz * HALF_W, bx = tx !== 0 ? ex + tx * reach : lx, bz = tz !== 0 ? ez + tz * reach : lz, qx = tz * HALF_W, qz = -tx * HALF_W;
      parts.push({ name: 'Ponte do heliponto', mesh: geometry([bx0 + qx, y1, bz0 + qz, bx0 - qx, y1, bz0 - qz, bx - qx, y1, bz - qz, bx + qx, y1, bz + qz], [0, 1, 2, 0, 2, 3], Array.from({ length: 4 }, () => deckColor).flat()) });
      slab([[bx0 + qx, y1, bz0 + qz], [bx0 - qx, y1, bz0 - qz], [bx - qx, y1, bz - qz], [bx + qx, y1, bz + qz]]);
      boxes.push({ x0: Math.min(bx0, bx) - Math.abs(qx), x1: Math.max(bx0, bx) + Math.abs(qx), z0: Math.min(bz0, bz) - Math.abs(qz), z1: Math.max(bz0, bz) + Math.abs(qz), top: y1, bottom: y1 - .12, ramp: { x0: bx0, z0: bz0, x1: bx, z1: bz, y0: y1, y1 } });
      const ce = HALF_W - RAIL_T, cnx = tz * ce, cnz = -tx * ce;
      for (const s of [-1, 1]) railAlong(bx0 + s * cnx, bz0 + s * cnz, y1, bx + s * cnx, bz + s * cnz, y1);
      access.push({ x: lx, y: y1, z: lz }, { x: tx !== 0 ? ex + tx * (OFF + 2) : lx, y: helipad.y, z: tz !== 0 ? ez + tz * (OFF + 2) : lz });
      ry = y1;
      break;
    }
    ry = y1;
    landing(k + 1, ry, [side(k + 1, k), side(k + 1, k + 2)]);
  }
  if (structIdx.length) parts.push({ name: 'Estrutura da rampa', mesh: geometry(structPos, structIdx, Array.from({ length: structPos.length / 3 }, () => deckColor).flat()) });
  if (railIdx.length) parts.push({ name: 'Guarda-corpo da rampa', mesh: geometry(railPos, railIdx, Array.from({ length: railPos.length / 3 }, () => [205, 210, 215, 255]).flat()) });
  return { parts, boxes, helipad, access };
}

function insideBox(b: Box, x: number, z: number) {
  if (b.obb) { const q = b.obb, dx = x - q.cx, dz = z - q.cz; return Math.abs(dx * q.rx + dz * q.rz) <= q.hw && Math.abs(-dx * q.rz + dz * q.rx) <= q.hd; }
  return b.radius !== undefined ? Math.hypot(x - b.x!, z - b.z!) <= b.radius : x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
}

function boxTop(b: Box, x: number, z: number) {
  if (!b.ramp) return b.top;
  const r = b.ramp, dx = r.x1 - r.x0, dz = r.z1 - r.z0;
  const t = Math.max(0, Math.min(1, ((x - r.x0) * dx + (z - r.z0) * dz) / (dx * dx + dz * dz)));
  return r.y0 + (r.y1 - r.y0) * t;
}

export interface CapsulePosition { x: number; y: number; z: number }
/** Box broad phase and small swept steps prevent tunnelling; y is the capsule's feet. */
/** `flatGround` (testes): terreno plano nessa altura em vez do relevo real. */
export function createWorldPhysics(boxes?: Box[], flatGround?: number) {
  if (!boxes) {
    const city = cityData(), details = cityDetails(city);
    boxes = [...city.boxes, ...details.boxes, ...airportData(city.helipad).boxes, ...deliveryRampData().boxes, ...landmarkBoxes(), ...buildingColliders()];
  }
  const grid = new Map<string, Box[]>();
  for (const b of boxes) for (let gx = Math.floor(b.x0 / 100); gx <= Math.floor(b.x1 / 100); gx++) {
    for (let gz = Math.floor(b.z0 / 100); gz <= Math.floor(b.z1 / 100); gz++) {
      const key = `${gx},${gz}`; if (!grid.has(key)) grid.set(key, []); grid.get(key)!.push(b);
    }
  }
  function nearby(x: number, z: number, r = 0) {
    const found = new Set<Box>();
    for (let gx = Math.floor((x - r) / 100); gx <= Math.floor((x + r) / 100); gx++) for (let gz = Math.floor((z - r) / 100); gz <= Math.floor((z + r) / 100); gz++) {
      for (const b of grid.get(`${gx},${gz}`) ?? []) found.add(b);
    }
    return found;
  }
  function surfaceAt(x: number, z: number, ceiling = Infinity) {
    let h = Math.max(flatGround ?? terrainHeight(x, z), 0);
    if (flatGround === undefined) h = Math.max(h, roadHeightAt(x, z));
    if (isRunway(x, z) || (x >= HANGAR.x0 && x <= HANGAR.x1 && z >= HANGAR.z0 && z <= HANGAR.z1)) h = Math.max(h, AIRPORT.y);
    for (const b of nearby(x, z)) if (insideBox(b, x, z) && boxTop(b, x, z) <= ceiling) h = Math.max(h, boxTop(b, x, z));
    return h;
  }
  function obstacleAt(x: number, z: number, y: number, radius = 0, height = 1.8) {
    for (const b of nearby(x, z, radius)) {
      let dx = x - Math.max(b.x0, Math.min(b.x1, x)), dz = z - Math.max(b.z0, Math.min(b.z1, z));
      if (b.obb) {
        const q = b.obb, ex = x - q.cx, ez = z - q.cz;
        dx = Math.max(0, Math.abs(ex * q.rx + ez * q.rz) - q.hw); dz = Math.max(0, Math.abs(-ex * q.rz + ez * q.rx) - q.hd);
      }
      if (b.curb && y >= terrainHeight(x, z) - .02) continue;
      const top = boxTop(b, x, z), bottom = b.ramp ? top - .12 : (b.bottom ?? -1);
      // A small foot-step allowance keeps capsule edges from snagging on ramp corners.
      if (b.ramp && radius > 0 && y >= top - .4) continue;
      if ((b.radius !== undefined ? Math.hypot(x - b.x!, z - b.z!) <= radius + b.radius : dx * dx + dz * dz <= radius * radius) && y < top - .01 && y + height > bottom + .01) return b;
    }
    return undefined;
  }
  function moveCapsule(p: CapsulePosition, dx: number, dz: number, radius: number, height: number, maxSlope = .65) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / Math.min(.2, radius / 2)));
    const result = { ...p };
    const tryAxis = (axis: 'x' | 'z', delta: number) => {
      const x = Math.max(-2980, Math.min(2980, result.x + (axis === 'x' ? delta : 0))), z = Math.max(-2980, Math.min(2980, result.z + (axis === 'z' ? delta : 0)));
      const floor = surfaceAt(x, z, result.y + .35), old = surfaceAt(result.x, result.z, result.y + .35);
      const onRamp = [...nearby(x, z)].some((b) => b.ramp && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && Math.abs(boxTop(b, x, z) - floor) < .01);
      // degrau baixo (meio-fio, emenda de calçada/cruzamento) até 22 cm sobe direto: o carro não "agarra" na guia
      const slopeLimit = onRamp ? Math.max(.35, Math.abs(delta) * maxSlope) : Math.max(.22, Math.abs(delta) * maxSlope + .001);
      if (!obstacleAt(x, z, Math.max(result.y, floor), radius, height) && floor - old <= slopeLimit) {
        result[axis] = axis === 'x' ? x : z;
        if (result.y <= old + .1) result.y = Math.max(result.y, floor);
      }
    };
    for (let i = 0; i < n; i++) { tryAxis('x', dx / n); tryAxis('z', dz / n); }
    return result;
  }
  return { groundAt: (x: number, z: number) => surfaceAt(x, z), surfaceAt, obstacleAt, moveCapsule, isRunway };
}

// ---------------------------------------------------------------------------
// Lugares do jogo (posições reais da cidade, ajustadas ao relevo e às ruas)
// ---------------------------------------------------------------------------
const WORKSHOP_Y = terrainHeight(WORKSHOP_SPOT.x, WORKSHOP_SPOT.z);
/** Oficina do Parafuso Perdido, no Poço Rico (lote plano ao lado da via). */
export const WORKSHOP = { x: WORKSHOP_SPOT.x, y: WORKSHOP_Y, z: WORKSHOP_SPOT.z };

/** Lote livre e plano da UniAcademia (Academia de Comércio, Centro): o modelo do Gemini fica aqui, frente para -Z local. */
export const UNIACADEMIA = (() => {
  // Como nas fotos: a entrada (pórtico + praça) dá de frente para a rua mais próxima (UNI_CENTER, acima).
  const { x, z, heading } = UNI_CENTER;
  return { x, y: terrainHeight(x, z), z, heading, width: UNI_W, depth: UNI_D, radius: 38 };
})();

/** Cristo do Imperador, no topo do Morro do Imperador. */
export const CRISTO_IMPERADOR = { x: CRISTO.x, y: terrainHeight(CRISTO.x, CRISTO.z), z: CRISTO.z };

export function landmarkBoxes(): Box[] {
  const c = CRISTO_IMPERADOR, u = UNIACADEMIA;
  // caixa orientada pelo heading do prédio (o modelo gira com setLocalEulerAngles(0, -heading, 0))
  const ha = u.heading * Math.PI / 180, rx = Math.cos(ha), rz = Math.sin(ha), hw = u.width / 2, hd = u.depth / 2;
  const ex = Math.abs(rx) * hw + Math.abs(rz) * hd, ez = Math.abs(rz) * hw + Math.abs(rx) * hd;
  return [
    { x0: c.x - 3.5, x1: c.x + 3.5, z0: c.z - 3.5, z1: c.z + 3.5, top: c.y + 6, bottom: c.y - 1 },
    { x0: c.x - 1.4, x1: c.x + 1.4, z0: c.z - 1.4, z1: c.z + 1.4, top: c.y + 15, bottom: c.y + 5 },
    { x0: u.x - ex, x1: u.x + ex, z0: u.z - ez, z1: u.z + ez, top: u.y + 17, bottom: u.y - 1, obb: { cx: u.x, cz: u.z, hw, hd, rx, rz } },
  ];
}

/** Estacionamento inicial e carros espalhados pelo Centro, sobre vias reais. */
export function carSpots() {
  const start = nearestRoad(jf.marcos.centro[0], jf.marcos.centro[1], 3)!;
  const spots: { x: number; z: number; heading: number }[] = [{ x: start.x, z: start.z, heading: start.heading }];
  for (const [dx, dz] of [[-260, 90], [200, -180], [300, 260], [-120, -330], [520, -60]]) {
    const p = nearestRoad(start.x + dx, start.z + dz, 3);
    if (p && spots.every((s) => Math.hypot(s.x - p.x, s.z - p.z) > 40)) spots.push({ x: p.x, z: p.z, heading: p.heading });
  }
  return spots;
}

/**
 * Lugares onde nenhum prédio pode nascer (visual e colisão): entregas no chão (estágios carro, tunado e o pouso no Cristo/hangar),
 * carros estacionados, oficina e a rua da UniAcademia. Espelha mission.deliveryPoints(); um teste confere a correspondência.
 */
export function protectedSpots(): { x: number; z: number; r: number }[] {
  const spots: { x: number; z: number; r: number }[] = [];
  for (const [place, r] of [['centro', 17], ['granbery', 17], ['altoDosPassos', 17], ['salvaterra', 19], ['cristo', 21], ['estadio', 26]] as const) {
    const p = nearestRoad(jf.marcos[place][0], jf.marcos[place][1], 3)!; spots.push({ x: p.x, z: p.z, r });
  }
  for (const c of carSpots()) spots.push({ x: c.x, z: c.z, r: 9 });
  spots.push({ x: WORKSHOP.x, z: WORKSHOP.z, r: 24 }, { x: CRISTO.x, z: CRISTO.z + 18, r: 30 }, { x: AIRPORT.x - 22, z: AIRPORT.z, r: 18 });
  return spots;
}

/** Entregas por via: o ponto da rua mais perto do marco real. */
export function roadStop(name: keyof typeof jf.marcos, maxClass = 3) {
  const [x, z] = jf.marcos[name];
  return nearestRoad(x, z, maxClass)!;
}
export const MARCOS = jf.marcos;
export const CITY_CREDITS = jf.creditos;

export interface RampDef { name: string; x0: number; z0: number; x1: number; z1: number; y0: number; y1: number }
/** Pad da oficina (as rampas de salto do carro tunado foram removidas). */
export function deliveryRampData() {
  const { x, y, z } = WORKSHOP;
  const parts: WorldPart[] = [{ name: 'Oficina do Parafuso Perdido', mesh: geometry([x-7,y+.04,z+7,x+7,y+.04,z+7,x+7,y+.04,z-7,x-7,y+.04,z-7],
    [0,1,2,0,2,3], Array.from({ length: 4 }, () => [235,165,65,255]).flat()) }];
  const ramps: RampDef[] = [], boxes: Box[] = [];
  return { ramps, boxes, parts };
}

export type StreetRect = Box & { axis: 'x' | 'z' };

/** Fonte única do minimapa: vias por categoria, rio, praças, quarteirões, marcos, pista e UniAcademia. */
export function cityLayout() {
  const city = cityData();
  const { x, y, z } = city.helipad;
  const [rax, raz] = [RWY_A.x, RWY_A.z], [rbx, rbz] = [RWY_B.x, RWY_B.z];
  const line = (way: number[]) => way;
  return {
    bounds: { x0: -GRID_HALF, x1: GRID_HALF, z0: -GRID_HALF, z1: GRID_HALF },
    roadLines: ROAD_CLASSES.map((name, c) => ({ category: name, width: ASPHALT[c], lines: VIAS[name].map(line) })),
    river: { width: RIVER_WIDTH, lines: jf.rio as number[][] },
    parkPolygons: parkPolys.map((p) => ({ name: p.nome, pts: p.pts })),
    stadiumPolygons: stadiumPolys.map((p) => ({ name: p.nome, pts: p.pts })),
    universityPolygons: universityPolys.map((p) => ({ name: p.nome, pts: p.pts })),
    airportPolygon: airportPolys[0]?.pts ?? [],
    neighborhoods: jf.bairros,
    landmarks: {
      centro: { x: MARCOS.centro[0], z: MARCOS.centro[1] },
      uniacademia: { x: UNIACADEMIA.x, z: UNIACADEMIA.z, heading: UNIACADEMIA.heading, width: UNIACADEMIA.width, depth: UNIACADEMIA.depth },
      ufjf: { x: MARCOS.ufjf[0], z: MARCOS.ufjf[1] },
      cristo: { x: CRISTO_IMPERADOR.x, z: CRISTO_IMPERADOR.z },
      estadio: { x: MARCOS.estadio[0], z: MARCOS.estadio[1] },
    },
    runwayLine: { a: { x: rax, z: raz }, b: { x: rbx, z: rbz }, width: AIRPORT.width, heading: AIRPORT.heading },
    // Campos antigos, mantidos para o minimapa atual
    roads: [] as StreetRect[], blocks: city.blocks, parks: city.parks, buildings: city.boxes,
    asphalt: { x0: CITY.x0, x1: CITY.x1, z0: CITY.z0, z1: CITY.z1, top: CITY_Y },
    runway: { x0: Math.min(rax, rbx) - 15, x1: Math.max(rax, rbx) + 15, z0: Math.min(raz, rbz), z1: Math.max(raz, rbz), top: AIRPORT.y },
    helipad: { x, y, z, x0: x - 12, x1: x + 12, z0: z - 12, z1: z + 12, top: y },
    workshop: { ...WORKSHOP, x0: WORKSHOP.x - 7, x1: WORKSHOP.x + 7, z0: WORKSHOP.z - 7, z1: WORKSHOP.z + 7 },
    coastline: [] as { x: number; z: number }[], sea: { x0: -WORLD_SIZE * 1.5, x1: WORLD_SIZE * 1.5, z0: -WORLD_SIZE * 1.5, z1: WORLD_SIZE * 1.5, top: 0 },
  };
}

/** Textura da faixa da via: calçadas nas bordas (14%) e linhas brancas laterais. */
export function cityStreetImages() {
  const road = image(64, 64);
  road.rectangles.push({ color: '#a3a6aa', x: 0, y: 0, width: 64, height: 64 });
  road.rectangles.push({ color: '#555560', x: 9, y: 0, width: 46, height: 64 });
  road.rectangles.push({ color: '#d6d3c4', x: 8, y: 0, width: 1, height: 64 }, { color: '#d6d3c4', x: 55, y: 0, width: 1, height: 64 });
  for (const x of [12, 51]) road.rectangles.push({ color: '#eee9d5', x, y: 0, width: 1, height: 64 });
  // mão dupla (vai pela direita, volta pela esquerda): tracejado central amarelo dividindo os sentidos; sem setas
  road.rectangles.push({ color: '#e3b52a', x: 31, y: 0, width: 2, height: 32 });
  return { road };
}

// ---------------------------------------------------------------------------
// Detalhes: ruas encostadas no relevo, rio, praças, postes e árvores
// ---------------------------------------------------------------------------
/** All detail geometry is batched by material; lamps are emissive geometry, never dynamic lights. */
export function cityDetails(city = cityData()) {
  const batch = () => ({ pos: [] as number[], idx: [] as number[], col: [] as number[], uv: [] as number[] });
  const batches = { roads: batch(), ground: batch(), props: batch(), lamps: batch() };
  const boxes: Box[] = [];
  function shape(name: keyof typeof batches, pos: number[], idx: number[], color: number[], uv?: number[]) {
    const b = batches[name], base = b.pos.length / 3; b.pos.push(...pos); b.idx.push(...idx.map((i) => i + base));
    for (let i = 0; i < pos.length / 3; i++) b.col.push(...color, 255);
    if (uv) b.uv.push(...uv);
  }
  function cube(x: number, y: number, z: number, w: number, h: number, d: number, color: number[]) {
    const a = x - w / 2, b = x + w / 2, c = z - d / 2, e = z + d / 2;
    shape('props', [a,y,e,b,y,e,b,y,c,a,y,c,a,y+h,e,b,y+h,e,b,y+h,c,a,y+h,c],
      [0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7,4,5,6,4,6,7], color);
  }
  function cone(x: number, y: number, z: number, r: number, h: number, color: number[], sides = 3) {
    const pos = [x, y + h, z]; for (let i = 0; i < sides; i++) { const a = i / sides * Math.PI * 2; pos.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r); }
    const idx: number[] = []; for (let i = 0; i < sides; i++) idx.push(0, (i + 1) % sides + 1, i + 1);
    shape('props', pos, idx, color);
  }
  function cylinder(x: number, z: number, r: number, bottom: number, top: number) {
    boxes.push({ x0: x - r, x1: x + r, z0: z - r, z1: z + r, top, bottom, radius: r, x, z });
  }

  // Ruas (categorias menores primeiro) e rio usando a mesma faixa contínua acima do relevo
  const net = roadNet();
  const emitRibbon = (batchName: 'roads' | 'ground', st: Station[], color: number[], textured: boolean) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i < st.length; i++) {
      const p = st[i];
      pos.push(p.lx, p.hl, p.lz, p.rx, p.hr, p.rz);
      if (textured) uv.push(0, p.s / 32, 1, p.s / 32);
    }
    for (let i = 0; i + 1 < st.length; i++) { const l0 = i * 2; idx.push(l0, l0 + 2, l0 + 1, l0 + 1, l0 + 2, l0 + 3); }
    shape(batchName, pos, idx, color, textured ? uv : undefined);
  };
  // Fita com calçada: [borda externa, topo do meio-fio, pé do meio-fio] dos dois lados (6 vértices por estação, mesma malha 'roads')
  const emitSidewalkRoad = (w: RoadWay) => {
    const st = w.st, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const fFoot = (w.half - w.sw) / w.half, fTop = fFoot + CURB_RAMP / w.half;
    for (const p of st) {
      const hAt = (f: number) => 0.5 * (p.hl + p.hr) + 0.5 * (p.hl - p.hr) * f; // f > 0: lado esquerdo
      const at = (f: number): [number, number] => [p.x + (p.lx - p.x) * f, p.z + (p.lz - p.z) * f];
      // esquerda: externa, topo, pé; direita: pé, topo, externa
      for (const [f, drop] of [[1, 0], [fTop, 0], [fFoot, CURB * p.cf], [-fFoot, CURB * p.cf], [-fTop, 0], [-1, 0]] as const) {
        const [x, z] = at(f);
        pos.push(x, hAt(f) - drop, z); uv.push(.5 - f / 2, p.s / 32);
      }
    }
    for (let i = 0; i + 1 < st.length; i++) for (let q = 0; q < 5; q++) { const a = i * 6 + q, b = a + 6; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    shape('roads', pos, idx, [255, 255, 255], uv);
  };
  for (let c = ROAD_CLASSES.length - 1; c >= 0; c--) for (const w of net.ways) {
    if (w.cls !== c) continue;
    if (w.sw) emitSidewalkRoad(w); else emitRibbon('roads', w.st, [255, 255, 255], true);
  }
  // Cruzamentos no estilo QuickRoad: miolo poligonal liso (sem faixas) e a calçada contornando cada esquina
  for (const j of net.junctions) {
    const n = j.poly.length, lift = j.patch ? PATCH_LIFT : 0.02, pos = [j.x, j.hc + lift, j.z], uv = [0.3, 0.1], idx: number[] = [];
    j.poly.forEach((p, k) => { pos.push(p.x, p.h + lift, p.z); uv.push(0.3, 0.1); idx.push(0, 1 + (k + 1) % n, 1 + k); });
    shape('roads', pos, idx, [255, 255, 255], uv);
    for (const ch of j.chains) {
      if (!ch.sw.some((w) => w > 0)) continue;
      const rp: number[] = [], ru: number[] = [], ri: number[] = [];
      let acc = 0;
      ch.pts.forEach((p, i) => {
        if (i) acc += Math.hypot(p.x - ch.pts[i - 1].x, p.z - ch.pts[i - 1].z);
        const [nx, nz] = ch.nrm[i], w = ch.sw[i];
        rp.push(p.x, p.h, p.z, p.x + nx * CURB_RAMP, p.h + CURB * ch.cf, p.z + nz * CURB_RAMP, p.x + nx * w, ch.out[i], p.z + nz * w);
        ru.push(.14, acc / 32, .117, acc / 32, 0, acc / 32);
      });
      for (let i = 0; i + 1 < ch.pts.length; i++) for (let q = 0; q < 2; q++) { const a0 = i * 3 + q, b0 = a0 + 3; ri.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
      let up = 0;
      for (let t = 0; t < ri.length; t += 3) { const ia = ri[t], ib = ri[t + 1], ic = ri[t + 2]; up += (rp[ib * 3 + 2] - rp[ia * 3 + 2]) * (rp[ic * 3] - rp[ia * 3]) - (rp[ib * 3] - rp[ia * 3]) * (rp[ic * 3 + 2] - rp[ia * 3 + 2]); }
      if (up < 0) for (let t = 0; t < ri.length; t += 3) { const tmp = ri[t + 1]; ri[t + 1] = ri[t + 2]; ri[t + 2] = tmp; }
      // descarta triângulos degenerados/invertidos (o recuo da calçada passa do raio do filete em esquinas fechadas)
      const good: number[] = [];
      for (let t = 0; t < ri.length; t += 3) { const ia = ri[t], ib = ri[t + 1], ic = ri[t + 2], area = (rp[ib * 3 + 2] - rp[ia * 3 + 2]) * (rp[ic * 3] - rp[ia * 3]) - (rp[ib * 3] - rp[ia * 3]) * (rp[ic * 3 + 2] - rp[ia * 3 + 2]); if (area > 1e-6) good.push(ia, ib, ic); }
      shape('roads', rp, good, [255, 255, 255], ru);
    }
  }
  // Faixa de pedestre zebrada na boca de cada rua dos cruzamentos do Centro (quadros brancos na mesma malha 'roads': 1 coluna branca da textura)
  for (const j of net.junctions) {
    if (!j.arms || j.patch || dcCentro(j.x, j.z) > ZEBRA_RADIUS) continue;
    for (const A of j.arms) {
      const w = net.base[A.way], d0 = A.m + 1, d1 = A.m + 3.6, room = A.dir === 1 ? w.st[w.st.length - 1].s - A.s : A.s - w.st[0].s;
      if (d1 > room - .5) continue;
      const p0 = stationAt(w.st, A.s + A.dir * d0), p1 = stationAt(w.st, A.s + A.dir * d1);
      const at = (p: Station, f: number): [number, number, number] => [p.x + (p.lx - p.x) * f, 0.5 * (p.hl + p.hr) + 0.5 * (p.hl - p.hr) * f - (w.sw ? CURB * p.cf : 0) + .035, p.z + (p.lz - p.z) * f];
      for (let o = -A.a + .5; o + .5 <= A.a - .3; o += 1) {
        const f0 = o / w.half, f1 = (o + .5) / w.half;
        const c = [at(p0, f0), at(p0, f1), at(p1, f1), at(p1, f0)], flat = c.flatMap(([x, y, z]) => [x, y, z]);
        const up = (c[1][2] - c[0][2]) * (c[2][0] - c[0][0]) - (c[1][0] - c[0][0]) * (c[2][2] - c[0][2]);
        shape('roads', flat, up > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2], [255, 255, 255], [.195, .5, .195, .5, .195, .5, .195, .5]);
      }
    }
  }
  for (const piece of jf.rio as number[][]) {
    for (const st of buildRibbonStations(piece, RIVER_WIDTH / 2, .16)) emitRibbon('ground', st, [58, 150, 170], false);
  }

  // Praças, estádios e universidades: células de 10 m dentro do polígono, coladas ao relevo
  const CELL = 10;
  function fill(p: Polygon, color: (x: number, z: number) => number[] | null, lift: number) {
    for (let x = Math.floor(p.x0 / CELL) * CELL; x < p.x1; x += CELL) for (let z = Math.floor(p.z0 / CELL) * CELL; z < p.z1; z += CELL) {
      if (!inside(p, x + CELL / 2, z + CELL / 2)) continue;
      const c = color(x + CELL / 2, z + CELL / 2); if (!c) continue;
      shape('ground', [x,terrainHeight(x,z+CELL)+lift,z+CELL, x+CELL,terrainHeight(x+CELL,z+CELL)+lift,z+CELL, x+CELL,terrainHeight(x+CELL,z)+lift,z, x,terrainHeight(x,z)+lift,z],
        [0,1,2,0,2,3], c);
    }
  }
  const r = rng(913);
  for (const p of parkPolys) {
    fill(p, () => [83, 139, 65], .1);
    const step = 26;
    for (let x = p.x0 + step / 2; x < p.x1; x += step) for (let z = p.z0 + step / 2; z < p.z1; z += step) {
      const tx = x + (r() - .5) * 8, tz = z + (r() - .5) * 8; if (!inside(p, tx, tz) || r() > .7 || gapToRoads(tx, tz) < 2.5 || net.junctions.some((j) => Math.hypot(tx - j.x, tz - j.z) < j.r + 2)) continue; // árvore fora das ruas e cruzamentos
      const y = terrainHeight(tx, tz);
      cone(tx, y, tz, .45, 3, [109, 76, 48]); cone(tx, y + 2, tz, 3, 6, [62, 117, 65], 5); cylinder(tx, tz, .4, y, y + 3);
    }
  }
  for (const p of stadiumPolys) {
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
    fill(p, (x, z) => Math.abs(x - cx) < (p.x1 - p.x0) * .3 && Math.abs(z - cz) < (p.z1 - p.z0) * .3 ? [96, 160, 78] : [168, 170, 176], .14);
  }
  for (const p of universityPolys) fill(p, (x, z) => ((Math.floor(x / CELL) + Math.floor(z / CELL)) % 7 === 0 ? [176, 168, 150] : [112, 162, 92]), .1);

  const stops = protectedSpots();
  // Postes: nas vias de categoria secundária ou maior, alternando os lados a cada ~55 m
  net.ways.filter((w) => w.cls <= 3).forEach((w, wi) => {
    let side = wi % 2 ? 1 : -1, next = 20;
    for (let k = 0; k < w.st.length; k++) {
      const p = w.st[k];
      if (p.s < next) continue;
      next = p.s + 55; side *= -1;
      const a = w.st[Math.max(0, k - 1)], b = w.st[Math.min(w.st.length - 1, k + 1)];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1, off = w.half + 2;
      const px = p.x - (b.z - a.z) / len * off * side, pz = p.z + (b.x - a.x) / len * off * side;
      if (dcCentro(px, pz) > 2300 || gapToRoads(px, pz) < 1.9 || net.junctions.some((j) => Math.hypot(px - j.x, pz - j.z) < j.r + 1.5) || stops.some((q) => Math.hypot(px - q.x, pz - q.z) < q.r + 3)) continue; // nem dentro do cruzamento nem nas paradas de entrega
      const y = Math.max(terrainHeight(px, pz), roadHeightAt(px, pz));
      cone(px, y, pz, .18, 7, [65, 72, 79]); cylinder(px, pz, .18, y, y + 7.15);
      shape('lamps', [px, y + 7.15, pz, px + 1.3, y + 7.15, pz + .32, px + 1.3, y + 7.15, pz - .32], [0, 1, 2], [255, 255, 255]);
    }
  });

  // Cristo do Imperador: pedestal, corpo e braços abertos
  const cr = CRISTO_IMPERADOR;
  cube(cr.x, cr.y - 1, cr.z, 7, 7, 7, [200, 196, 188]);
  cube(cr.x, cr.y + 5, cr.z, 2.8, 10, 2.8, [238, 236, 230]);
  cube(cr.x, cr.y + 12.5, cr.z, 12, 1.3, 1.3, [238, 236, 230]);
  cube(cr.x, cr.y + 14.8, cr.z, 1.6, 1.8, 1.6, [238, 236, 230]);

  const meshes = Object.fromEntries(Object.entries(batches).map(([name, b]) => [name, geometry(b.pos, b.idx, b.col, b.uv.length ? b.uv : undefined)])) as Record<keyof typeof batches, MeshData>;
  void city;
  return { meshes, boxes };
}

/** Centros dos cruzamentos (discos de asfalto único): para testes e conferência visual. */
export function roadJunctions(): readonly { x: number; z: number; r: number; fallback: boolean; poly: readonly { x: number; z: number }[] }[] {
  return roadNet().junctions.map((j) => ({ x: j.x, z: j.z, r: j.r, fallback: !!j.patch, poly: j.poly.map((p) => ({ x: p.x, z: p.z })) }));
}
