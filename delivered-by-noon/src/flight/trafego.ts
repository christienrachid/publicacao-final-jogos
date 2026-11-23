import { Entity, StandardMaterial } from 'playcanvas';
import { buildVehicleModel, type VehicleModel } from './models';
import { extractHitboxFootprint, type HitboxFootprint } from './models/glb';
import { rng } from './noise';
import type { FlightContext, FlightModule } from './types';
import { getRuntime, type TrafficLevel } from './ui/settings';
import { cityLayout, roadHeightAt, terrainHeight, type RoadClass } from './world-data';

// ---------------------------------------------------------------------------
// Tráfego urbano de Juiz de Fora: carros leves em pool (máx. 40 ativos),
// circulando na mão direita pelas vias de cityLayout() ao redor do jogador.
// ---------------------------------------------------------------------------

export interface TrafficObstacle {
  x: number;
  z: number;
  radius: number;
  y?: number;
  heading?: number;
  halfWidth?: number;
  halfLength?: number;
  height?: number;
}

export interface RoadGraphNode {
  x: number;
  z: number;
  outEdges: number[];
}

export interface RoadGraphPoint {
  x: number;
  z: number;
  s: number;
}

export interface RoadLineGroup {
  category: string;
  width: number;
  lines: ReadonlyArray<ReadonlyArray<number>>;
}

export interface RoadGraphEdge {
  id: number;
  from: number;
  to: number;
  reverseId: number;
  category: string;
  cls: number;
  width: number;
  laneOffset: number;
  baseSpeed: number;
  length: number;
  pts: RoadGraphPoint[];
  midX: number;
  midZ: number;
}

export interface RoadGraph {
  nodes: RoadGraphNode[];
  edges: RoadGraphEdge[];
  edgeGrid: Map<number, number[]>;
}

export interface BuildRoadGraphOptions {
  filter?: (category: string) => boolean;
  snap?: number;
  /** Ponte opcional (m) para ligar componentes desconexos próximos (ex.: faixas duplas no OSM). */
  bridgeGaps?: number;
  /** Vias de mão única: só a aresta no sentido da polilinha entra em `outEdges` (a inversa existe, mas ninguém a toma); faixa no centro. */
  oneWay?: boolean;
}

export const MAIN_ROAD_CATEGORIES: ReadonlySet<string> = new Set<RoadClass>([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
]);

export const PEDESTRIAN_CATEGORIES: ReadonlySet<string> = new Set([
  'footway',
  'pedestrian',
  'path',
  'steps',
  'cycleway',
  'bridleway',
  'track',
]);

export const MAX_TRAFFIC_CARS = 40;
const SPAWN_MIN_DIST = 150;
const SPAWN_MAX_DIST = 600;
const DESPAWN_DIST = 800;
const DEFAULT_CAR_HALF_WIDTH = 0.88;
const DEFAULT_CAR_HALF_LENGTH = 2.08;
const DEFAULT_CAR_HEIGHT = 1.45;
const TRAFFIC_VARIANTS = [3, 1, 2] as const;
const PLAYER_BRAKE_DIST = 12.5;
const FOLLOW_SAFE_DIST = 7.5;
const FOLLOW_DETECT_DIST = 18.0;
const EDGE_GRID_CELL = 100;

const CLASS_SPEED: Record<string, number> = {
  motorway: 16.0,
  trunk: 14.5,
  primary: 12.5,
  secondary: 10.5,
  tertiary: 8.5,
  unclassified: 8.0,
  residential: 8.0,
  living_street: 7.5,
  service: 7.5,
};

const TRAFFIC_COLORS: ReadonlyArray<[number, number, number]> = [
  [0.86, 0.88, 0.91], // prata
  [0.94, 0.94, 0.92], // branco
  [0.24, 0.27, 0.31], // cinza grafite
  [0.14, 0.25, 0.48], // azul marinho
  [0.72, 0.14, 0.14], // vermelho
  [0.14, 0.15, 0.17], // preto
  [0.76, 0.68, 0.56], // bege/champanhe
  [0.16, 0.36, 0.24], // verde escuro
  [0.52, 0.13, 0.18], // vinho
  [0.22, 0.44, 0.68], // azul médio
];

const gridKey = (gx: number, gz: number) => gx * 4096 + gz;

let cachedGraph: RoadGraph | undefined;

/** Constrói um grafo viário direcionado (mão dupla) a partir de grupos de polilinhas. */
export function buildRoadGraph(
  roadLines: ReadonlyArray<RoadLineGroup>,
  options?: BuildRoadGraphOptions,
): RoadGraph {
  const filter = options?.filter;
  const SNAP = options?.snap ?? 7.5;
  const oneWay = options?.oneWay ?? false;
  const SEG_CELL = 64;

  // 1. Coleta todos os segmentos elegíveis e divide nos cruzamentos internos
  interface RawSeg {
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    category: string;
    cls: number;
    width: number;
    splits: number[];
  }
  const rawSegs: RawSeg[] = [];
  const segGrid = new Map<number, number[]>();

  roadLines.forEach((group, cls) => {
    if (filter && !filter(group.category)) return;
    const width = group.width > 0 ? group.width : 7.0;
    for (const line of group.lines) {
      for (let i = 0; i + 3 < line.length; i += 2) {
        const x0 = line[i], z0 = line[i + 1], x1 = line[i + 2], z1 = line[i + 3];
        const ddx = x1 - x0, ddz = z1 - z0;
        if (ddx * ddx + ddz * ddz < 2.25) continue;
        const minX = x0 < x1 ? x0 : x1, maxX = x0 > x1 ? x0 : x1;
        const minZ = z0 < z1 ? z0 : z1, maxZ = z0 > z1 ? z0 : z1;
        const id = rawSegs.length;
        rawSegs.push({ x0, z0, x1, z1, minX, maxX, minZ, maxZ, category: group.category, cls, width, splits: [0, 1] });
        const gx0 = Math.floor(minX / SEG_CELL);
        const gx1 = Math.floor(maxX / SEG_CELL);
        const gz0 = Math.floor(minZ / SEG_CELL);
        const gz1 = Math.floor(maxZ / SEG_CELL);
        for (let gx = gx0; gx <= gx1; gx++) {
          for (let gz = gz0; gz <= gz1; gz++) {
            const k = gridKey(gx, gz);
            let list = segGrid.get(k);
            if (!list) segGrid.set(k, (list = []));
            list.push(id);
          }
        }
      }
    }
  });

  const tested = new Set<number>();
  for (const list of segGrid.values()) {
    const n = list.length;
    for (let a = 0; a < n; a++) {
      const ia = list[a], sa = rawSegs[ia];
      const dax = sa.x1 - sa.x0, daz = sa.z1 - sa.z0;
      for (let b = a + 1; b < n; b++) {
        const ib = list[b], sb = rawSegs[ib];
        if (sa.maxX < sb.minX || sb.maxX < sa.minX || sa.maxZ < sb.minZ || sb.maxZ < sa.minZ) continue;
        const pair = ia < ib ? ia * 1_000_000 + ib : ib * 1_000_000 + ia;
        if (tested.has(pair)) continue;
        tested.add(pair);
        const dbx = sb.x1 - sb.x0, dbz = sb.z1 - sb.z0;
        const det = dax * dbz - daz * dbx;
        if (Math.abs(det) < 1e-3) continue;
        const rx = sb.x0 - sa.x0, rz = sb.z0 - sa.z0;
        const ta = (rx * dbz - rz * dbx) / det;
        if (ta <= -0.02 || ta >= 1.02) continue;
        const tb = (rx * daz - rz * dax) / det;
        if (tb <= -0.02 || tb >= 1.02) continue;
        if (ta > 0.02 && ta < 0.98) sa.splits.push(ta);
        if (tb > 0.02 && tb < 0.98) sb.splits.push(tb);
      }
    }
  }

  // 2. Funde nós próximos (cruzamentos e pontas de polilinhas)
  const nodes: RoadGraphNode[] = [];
  const nodeGrid = new Map<number, number[]>();
  const snap2 = SNAP * SNAP;
  const getNode = (x: number, z: number): number => {
    const gx = Math.floor(x / SNAP), gz = Math.floor(z / SNAP);
    let bestId = -1, bestD2 = snap2;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = nodeGrid.get(gridKey(gx + dx, gz + dz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const id = list[i];
          const ndx = nodes[id].x - x, ndz = nodes[id].z - z;
          const d2 = ndx * ndx + ndz * ndz;
          if (d2 < bestD2) {
            bestD2 = d2;
            bestId = id;
          }
        }
      }
    }
    if (bestId >= 0) return bestId;
    const id = nodes.length;
    nodes.push({ x, z, outEdges: [] });
    const k = gridKey(gx, gz);
    let list = nodeGrid.get(k);
    if (!list) nodeGrid.set(k, (list = []));
    list.push(id);
    return id;
  };

  // 3. Cria arestas direcionadas nos dois sentidos (ida e volta, cada uma na mão direita)
  const edges: RoadGraphEdge[] = [];
  const edgeGrid = new Map<number, number[]>();
  const seenUndirected = new Set<number>();

  const indexEdge = (edge: RoadGraphEdge) => {
    const gx = Math.floor(edge.midX / EDGE_GRID_CELL);
    const gz = Math.floor(edge.midZ / EDGE_GRID_CELL);
    const k = gridKey(gx, gz);
    let list = edgeGrid.get(k);
    if (!list) edgeGrid.set(k, (list = []));
    list.push(edge.id);
  };

  const addBidirectional = (
    u: number,
    v: number,
    category: string,
    cls: number,
    width: number,
    minLen = 2,
  ) => {
    if (u === v) return;
    const pairKey = u < v ? u * 1_000_000 + v : v * 1_000_000 + u;
    if (seenUndirected.has(pairKey)) return;
    const nA = nodes[u], nB = nodes[v];
    const len = Math.hypot(nB.x - nA.x, nB.z - nA.z);
    if (len < minLen) return;
    seenUndirected.add(pairKey);

    const laneOffset = oneWay ? 0 : width * 0.24;
    const baseSpeed = CLASS_SPEED[category] ?? 8.0;
    const midX = (nA.x + nB.x) * 0.5;
    const midZ = (nA.z + nB.z) * 0.5;

    const idFwd = edges.length;
    const idRev = idFwd + 1;
    const fwd: RoadGraphEdge = {
      id: idFwd,
      from: u,
      to: v,
      reverseId: idRev,
      category,
      cls,
      width,
      laneOffset,
      baseSpeed,
      length: len,
      pts: [
        { x: nA.x, z: nA.z, s: 0 },
        { x: nB.x, z: nB.z, s: len },
      ],
      midX,
      midZ,
    };
    const rev: RoadGraphEdge = {
      id: idRev,
      from: v,
      to: u,
      reverseId: idFwd,
      category,
      cls,
      width,
      laneOffset,
      baseSpeed,
      length: len,
      pts: [
        { x: nB.x, z: nB.z, s: 0 },
        { x: nA.x, z: nA.z, s: len },
      ],
      midX,
      midZ,
    };
    edges.push(fwd, rev);
    nodes[u].outEdges.push(idFwd);
    if (!oneWay) { nodes[v].outEdges.push(idRev); indexEdge(rev); } // mão única: a aresta inversa existe só para manter os pares, ninguém a toma
    indexEdge(fwd);
  };

  for (const s of rawSegs) {
    s.splits.sort((a, b) => a - b);
    let prev = getNode(s.x0, s.z0);
    for (let i = 1; i < s.splits.length; i++) {
      if (s.splits[i] - s.splits[i - 1] < 1e-4) continue;
      const t = s.splits[i];
      const cur = getNode(s.x0 + (s.x1 - s.x0) * t, s.z0 + (s.z1 - s.z0) * t);
      addBidirectional(prev, cur, s.category, s.cls, s.width);
      prev = cur;
    }
  }

  // 4. Opcional: liga componentes desconexos muito próximos (ex.: avenidas duplicadas ou pontas soltas no OSM)
  const bridge = options?.bridgeGaps ?? 0;
  if (bridge > 0 && nodes.length > 1) {
    const parent = new Int32Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) parent[i] = i;
    const find = (x: number): number => {
      let r = x;
      while (parent[r] !== r) r = parent[r];
      while (parent[x] !== r) {
        const next = parent[x];
        parent[x] = r;
        x = next;
      }
      return r;
    };
    const unite = (a: number, b: number) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    for (let i = 0; i < edges.length; i += 2) unite(edges[i].from, edges[i].to);

    const bGrid = new Map<number, number[]>();
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].outEdges.length === 0) continue;
      const k = gridKey(Math.floor(nodes[i].x / bridge), Math.floor(nodes[i].z / bridge));
      let list = bGrid.get(k);
      if (!list) bGrid.set(k, (list = []));
      list.push(i);
    }

    const b2 = bridge * bridge;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].outEdges.length === 0) continue;
      const gx = Math.floor(nodes[i].x / bridge), gz = Math.floor(nodes[i].z / bridge);
      let bestJ = -1, bestD2 = b2;
      const ri = find(i);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = bGrid.get(gridKey(gx + dx, gz + dz));
          if (!list) continue;
          for (let m = 0; m < list.length; m++) {
            const j = list[m];
            if (find(j) === ri) continue;
            const ddx = nodes[j].x - nodes[i].x, ddz = nodes[j].z - nodes[i].z;
            const d2 = ddx * ddx + ddz * ddz;
            if (d2 < bestD2) {
              bestD2 = d2;
              bestJ = j;
            }
          }
        }
      }
      if (bestJ >= 0) {
        addBidirectional(i, bestJ, 'tertiary', 4, 7.5, 0.5);
        unite(i, bestJ);
      }
    }
  }

  return { nodes, edges, edgeGrid };
}

/** Constrói (e memoriza) o grafo direcionado das vias principais de Juiz de Fora para o tráfego. */
export function getRoadGraph(): RoadGraph {
  if (cachedGraph) return cachedGraph;
  cachedGraph = buildRoadGraph(cityLayout().roadLines, {
    filter: (cat) => MAIN_ROAD_CATEGORIES.has(cat),
    snap: 7.5,
    oneWay: false, // mão dupla: cada sentido na faixa da direita (como no Brasil)
  });
  return cachedGraph;
}

function edgeDirection(edge: RoadGraphEdge): [number, number] {
  const a = edge.pts[0], b = edge.pts[edge.pts.length - 1];
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return [dx / len, dz / len];
}

/** Posição na mão direita sobre a aresta no deslocamento longitudinal `s` (0..edge.length). */
function sampleEdgeLane(edge: RoadGraphEdge, s: number): {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  heading: number;
} {
  const a = edge.pts[0], b = edge.pts[edge.pts.length - 1];
  const t = edge.length > 0 ? Math.max(0, Math.min(1, s / edge.length)) : 0;
  const [dirX, dirZ] = edgeDirection(edge);
  // Mão direita em coordenadas PlayCanvas (+X leste, -Z norte): vetor à direita de (dirX, dirZ) é (-dirZ, dirX)
  const rightX = -dirZ;
  const rightZ = dirX;
  const cx = a.x + (b.x - a.x) * t;
  const cz = a.z + (b.z - a.z) * t;
  const heading = ((Math.atan2(dirX, -dirZ) * 180) / Math.PI + 360) % 360;
  return {
    x: cx + rightX * edge.laneOffset,
    z: cz + rightZ * edge.laneOffset,
    dirX,
    dirZ,
    heading,
  };
}

/** Mesma altura de superfície da rua usada pela física do carro do jogador. */
function roadSurfaceY(x: number, z: number): number {
  return Math.max(terrainHeight(x, z), roadHeightAt(x, z), 0);
}

function angleDeltaDeg(from: number, to: number): number {
  let d = ((to - from + 540) % 360) - 180;
  if (d < -180) d += 360;
  return d;
}

function targetCarCount(traffic: TrafficLevel, quality: 'low' | 'medium' | 'high'): number {
  if (traffic === 'off') return 0;
  if (traffic === 'low' || quality === 'low') return 14;
  return 36;
}

interface TrafficSlot {
  active: boolean;
  variant: number;
  color: [number, number, number];
  model: VehicleModel | null;
  glbTinted: boolean;
  extraMaterials: StandardMaterial[];
  edgeId: number;
  nextEdgeId: number;
  s: number;
  speed: number;
  speedFactor: number;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
  heading: number;
  pitch: number;
  wheelAngle: number;
  blendTimer: number;
  prevX: number;
  prevZ: number;
  stuckTimer: number;
  halfWidth: number;
  halfLength: number;
  height: number;
}

let activeObstacleProvider: (() => TrafficObstacle[]) | null = null;

/** Obstáculos circulares dos carros de tráfego ativos (para colisão do jogador em vehicles/car). */
export function getTrafficObstacles(): TrafficObstacle[] {
  return activeObstacleProvider ? activeObstacleProvider() : [];
}

/** Cria o sistema de tráfego urbano de Juiz de Fora com pool fixo (máx. 40 carros ativos). */
export function createTraffic(ctx: FlightContext): FlightModule {
  const { app, state } = ctx;
  const graph = getRoadGraph();
  const rand = rng(20261121);
  const parent = ctx.plane.root.parent instanceof Entity ? ctx.plane.root.parent : app.root;
  const trafficRoot = new Entity('TrafegoRoot', app);
  parent.addChild(trafficRoot);

  const slots: TrafficSlot[] = Array.from({ length: MAX_TRAFFIC_CARS }, (_, i) => ({
    active: false,
    variant: TRAFFIC_VARIANTS[i % TRAFFIC_VARIANTS.length],
    color: TRAFFIC_COLORS[i % TRAFFIC_COLORS.length],
    model: null,
    glbTinted: false,
    extraMaterials: [],
    edgeId: -1,
    nextEdgeId: -1,
    s: 0,
    speed: 0,
    speedFactor: 0.9 + ((i * 37) % 19) * 0.01, // 0.90..1.08
    x: 0,
    y: 0,
    z: 0,
    dirX: 0,
    dirZ: -1,
    heading: 0,
    pitch: 0,
    wheelAngle: 0,
    blendTimer: 0,
    prevX: 0,
    prevZ: 0,
    stuckTimer: 0,
    halfWidth: DEFAULT_CAR_HALF_WIDTH,
    halfLength: DEFAULT_CAR_HALF_LENGTH,
    height: DEFAULT_CAR_HEIGHT,
  }));

  const footprintScratch: HitboxFootprint = { halfWidth: 0, halfLength: 0, height: 0, centerX: 0, centerZ: 0 };

  function syncSlotFootprint(slot: TrafficSlot) {
    const fp = extractHitboxFootprint(slot.model?.hitbox, footprintScratch);
    if (fp && fp.halfWidth > 0.3 && fp.halfLength > 0.5) {
      slot.halfWidth = fp.halfWidth;
      slot.halfLength = fp.halfLength;
      slot.height = fp.height;
    }
  }

  function syncCarLights(model: VehicleModel) {
    // Delivered by Noon: sempre de dia — faróis desligados
    const front = model.root.findByName('CarHeadlights') as Entity | null;
    if (front) front.enabled = false;
    const rear = model.root.findByName('TrafficLights') as Entity | null;
    if (rear) rear.enabled = false;
  }

  function applyProceduralColor(model: VehicleModel, color: [number, number, number]) {
    const bodyMat = model.materials[0];
    if (bodyMat instanceof StandardMaterial) {
      bodyMat.diffuse.set(color[0], color[1], color[2]);
      bodyMat.update();
    }
  }

  function tryTintLoadedGlb(slot: TrafficSlot) {
    if (slot.glbTinted || !slot.model) return;
    const model = slot.model;
    // Detecta quando attachAsyncGlb substituiu o procedural (nenhum nó Procedural_* restante)
    const hasProcedural = model.root.children.some((c) => c.name.startsWith('Procedural_'));
    if (hasProcedural) return;
    slot.glbTinted = true;

    const [cr, cg, cb] = slot.color;
    const clonedMap = new Map<StandardMaterial, StandardMaterial>();
    for (let i = 0; i < model.exterior.length; i++) {
      const mis = model.exterior[i].render?.meshInstances;
      if (!mis) continue;
      for (let j = 0; j < mis.length; j++) {
        const mat = mis[j]?.material;
        if (!(mat instanceof StandardMaterial)) continue;
        // Só tinge materiais de lataria (evita pneus/vidros escuros e faróis/lanternas emissivas)
        const nameLower = (mat.name || '').toLowerCase();
        if (/(tire|pneu|wheel|roda|glass|vidro|window|light|farol|lanterna|chrome|cromo|black|preto|dark)/i.test(nameLower)) {
          continue;
        }
        // Modelos do Meshy têm uma textura só para o carro todo (vidro e pneu inclusos): tingir escurece tudo
        if (mat.diffuseMap) continue;
        const lum = mat.diffuse.r * 0.3 + mat.diffuse.g * 0.59 + mat.diffuse.b * 0.11;
        if (lum < 0.22) continue;
        let cloned = clonedMap.get(mat);
        if (!cloned) {
          cloned = mat.clone() as StandardMaterial;
          cloned.diffuse.set(cr, cg, cb);
          cloned.update();
          clonedMap.set(mat, cloned);
          slot.extraMaterials.push(cloned);
        }
        mis[j].material = cloned;
      }
    }
  }

  function ensureSlotModel(slot: TrafficSlot): VehicleModel {
    if (slot.model) return slot.model;
    const model = buildVehicleModel(app, 'car', slot.variant, trafficRoot);
    applyProceduralColor(model, slot.color);
    syncCarLights(model);
    model.root.enabled = false;
    slot.model = model;
    syncSlotFootprint(slot);
    return model;
  }

  function isInsideActiveDelivery(x: number, z: number, pad: number): boolean {
    const deliveries = ctx.mission?.deliveries;
    if (!deliveries) return false;
    for (let i = 0; i < deliveries.length; i++) {
      const d = deliveries[i];
      if (d.delivered || d.airDrop) continue;
      const r = d.radius + pad;
      const dx = x - d.x, dz = z - d.z;
      if (dx * dx + dz * dz <= r * r) return true;
    }
    return false;
  }

  function pickNextEdge(curEdge: RoadGraphEdge): number {
    const node = graph.nodes[curEdge.to];
    if (!node || node.outEdges.length === 0) return -1;
    const [inX, inZ] = edgeDirection(curEdge);
    const candidates: number[] = [];
    for (let i = 0; i < node.outEdges.length; i++) {
      const eid = node.outEdges[i];
      if (eid === curEdge.reverseId) continue; // nunca dá meia-volta
      const cand = graph.edges[eid];
      const [outX, outZ] = edgeDirection(cand);
      if (inX * outX + inZ * outZ < -0.88) continue; // evita retorno agudo ~180°
      // Evita entrar direto num ponto de entrega ativo se houver outra saída
      const ahead = sampleEdgeLane(cand, Math.min(12, cand.length * 0.5));
      if (isInsideActiveDelivery(ahead.x, ahead.z, 4)) continue;
      candidates.push(eid);
    }
    if (candidates.length === 0) return -1;
    return candidates[Math.floor(rand() * candidates.length)];
  }

  function despawnSlot(slot: TrafficSlot) {
    slot.active = false;
    slot.edgeId = -1;
    slot.nextEdgeId = -1;
    slot.speed = 0;
    slot.stuckTimer = 0;
    if (slot.model) slot.model.root.enabled = false;
  }

  function isTooCloseToOtherCar(x: number, z: number, minDist: number, ignoreIndex = -1): boolean {
    const min2 = minDist * minDist;
    for (let i = 0; i < slots.length; i++) {
      if (i === ignoreIndex || !slots[i].active) continue;
      const dx = slots[i].x - x, dz = slots[i].z - z;
      if (dx * dx + dz * dz < min2) return true;
    }
    return false;
  }

  const nearbyEdgeIds: number[] = [];
  function collectEdgesAround(px: number, pz: number) {
    nearbyEdgeIds.length = 0;
    const gx0 = Math.floor((px - SPAWN_MAX_DIST) / EDGE_GRID_CELL);
    const gx1 = Math.floor((px + SPAWN_MAX_DIST) / EDGE_GRID_CELL);
    const gz0 = Math.floor((pz - SPAWN_MAX_DIST) / EDGE_GRID_CELL);
    const gz1 = Math.floor((pz + SPAWN_MAX_DIST) / EDGE_GRID_CELL);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const list = graph.edgeGrid.get(gridKey(gx, gz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const eid = list[i];
          const e = graph.edges[eid];
          const d = Math.hypot(e.midX - px, e.midZ - pz);
          if (d >= SPAWN_MIN_DIST - 30 && d <= SPAWN_MAX_DIST + 30) {
            nearbyEdgeIds.push(eid);
          }
        }
      }
    }
  }

  function trySpawnSlot(slot: TrafficSlot, slotIndex: number): boolean {
    if (nearbyEdgeIds.length === 0) return false;
    const px = state.x, pz = state.z;
    for (let attempt = 0; attempt < 18; attempt++) {
      const eid = nearbyEdgeIds[Math.floor(rand() * nearbyEdgeIds.length)];
      const edge = graph.edges[eid];
      const s = rand() * edge.length;
      const pose = sampleEdgeLane(edge, s);
      const dist = Math.hypot(pose.x - px, pose.z - pz);
      if (dist < SPAWN_MIN_DIST || dist > SPAWN_MAX_DIST) continue;
      if (isInsideActiveDelivery(pose.x, pose.z, 10)) continue;
      if (isTooCloseToOtherCar(pose.x, pose.z, 18, slotIndex)) continue;

      const y = roadSurfaceY(pose.x, pose.z);
      const yF = roadSurfaceY(pose.x + pose.dirX * 1.6, pose.z + pose.dirZ * 1.6);
      const yB = roadSurfaceY(pose.x - pose.dirX * 1.6, pose.z - pose.dirZ * 1.6);
      const pitch = Math.max(-20, Math.min(20, (Math.atan2(yF - yB, 3.2) * 180) / Math.PI));

      const model = ensureSlotModel(slot);
      slot.active = true;
      slot.edgeId = eid;
      slot.nextEdgeId = pickNextEdge(edge);
      slot.s = s;
      slot.speed = Math.max(8, Math.min(16, edge.baseSpeed * slot.speedFactor));
      slot.x = pose.x;
      slot.y = y;
      slot.z = pose.z;
      slot.dirX = pose.dirX;
      slot.dirZ = pose.dirZ;
      slot.heading = pose.heading;
      slot.pitch = pitch;
      slot.blendTimer = 0;
      slot.prevX = pose.x;
      slot.prevZ = pose.z;
      slot.stuckTimer = 0;

      model.root.enabled = true;
      syncCarLights(model);
      model.root.setPosition(slot.x, slot.y, slot.z);
      model.root.setLocalEulerAngles(slot.pitch, -slot.heading, 0);
      return true;
    }
    return false;
  }

  function updateSlot(slot: TrafficSlot, idx: number, dt: number) {
    const px = state.x, py = state.y, pz = state.z;
    if (Math.hypot(slot.x - px, slot.z - pz) > DESPAWN_DIST) {
      despawnSlot(slot);
      return;
    }

    let edge = graph.edges[slot.edgeId];
    if (!edge) {
      despawnSlot(slot);
      return;
    }

    // 1. Velocidade alvo por categoria da via (8 a 16 m/s)
    let targetSpeed = Math.max(8, Math.min(16, edge.baseSpeed * slot.speedFactor));

    // 2. Reduz em curvas fechadas ao se aproximar de cruzamento
    const remain = edge.length - slot.s;
    if (remain < 18 && slot.nextEdgeId >= 0) {
      const nextEdge = graph.edges[slot.nextEdgeId];
      const [nx, nz] = edgeDirection(nextEdge);
      const dot = slot.dirX * nx + slot.dirZ * nz;
      if (dot < 0.92) {
        const sharpness = Math.max(0, Math.min(1, (0.92 - dot) / 1.1));
        const cornerSpeed = targetSpeed * (1 - 0.58 * sharpness);
        targetSpeed = Math.min(targetSpeed, Math.max(4.5, cornerSpeed));
      }
    }

    // 3. Evita entrar em pontos de entrega com raio ativo
    const checkDist = Math.min(14, Math.max(6, slot.speed * 1.1));
    if (isInsideActiveDelivery(slot.x + slot.dirX * checkDist, slot.z + slot.dirZ * checkDist, 4)) {
      targetSpeed = 0;
    }

    // 4. Freia quando o jogador (a pé ou em veículo próximo ao chão) está à frente a menos de ~12 m
    if (Math.abs(py - slot.y) < 5.0) {
      const dxP = px - slot.x, dzP = pz - slot.z;
      const fwdP = dxP * slot.dirX + dzP * slot.dirZ;
      const latP = Math.abs(dxP * -slot.dirZ + dzP * slot.dirX);
      if (fwdP > -1.0 && fwdP < PLAYER_BRAKE_DIST && latP < 3.4) {
        targetSpeed = 0;
      }
    }

    // 5. Mantém distância segura do carro da frente na mesma faixa
    for (let j = 0; j < slots.length; j++) {
      if (j === idx || !slots[j].active) continue;
      const other = slots[j];
      const dx = other.x - slot.x, dz = other.z - slot.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > FOLLOW_DETECT_DIST * FOLLOW_DETECT_DIST) continue;
      const sameDir = slot.dirX * other.dirX + slot.dirZ * other.dirZ;
      if (sameDir < 0.55) continue;
      const fwd = dx * slot.dirX + dz * slot.dirZ;
      if (fwd <= 0 || fwd > FOLLOW_DETECT_DIST) continue;
      const lat = Math.abs(dx * -slot.dirZ + dz * slot.dirX);
      if (lat > 2.2) continue;
      if (fwd <= FOLLOW_SAFE_DIST) {
        targetSpeed = 0;
      } else {
        const factor = (fwd - FOLLOW_SAFE_DIST) / (FOLLOW_DETECT_DIST - FOLLOW_SAFE_DIST);
        targetSpeed = Math.min(targetSpeed, Math.min(other.speed, targetSpeed * factor));
      }
    }

    // 6. Aceleração / frenagem suave
    if (slot.speed < targetSpeed) {
      slot.speed = Math.min(targetSpeed, slot.speed + 5.0 * dt);
    } else if (slot.speed > targetSpeed) {
      slot.speed = Math.max(targetSpeed, slot.speed - 14.0 * dt);
    }

    // Recicla se ficou travado muito tempo longe do campo imediato (ex.: parado diante de entrega ativa)
    if (slot.speed < 0.4) {
      slot.stuckTimer += dt;
      if (slot.stuckTimer > 12 && Math.hypot(slot.x - px, slot.z - pz) > 120) {
        despawnSlot(slot);
        return;
      }
    } else {
      slot.stuckTimer = 0;
    }

    // 7. Avança ao longo da aresta e escolhe próxima saída nos cruzamentos
    let advance = slot.speed * dt;
    while (advance > 0 && slot.s + advance >= edge.length) {
      advance -= edge.length - slot.s;
      const nextId = slot.nextEdgeId >= 0 ? slot.nextEdgeId : pickNextEdge(edge);
      if (nextId < 0) {
        despawnSlot(slot);
        return;
      }
      slot.prevX = slot.x;
      slot.prevZ = slot.z;
      slot.blendTimer = 0.35;
      slot.edgeId = nextId;
      edge = graph.edges[nextId];
      slot.s = 0;
      slot.nextEdgeId = pickNextEdge(edge);
    }
    slot.s += advance;

    const targetPose = sampleEdgeLane(edge, slot.s);
    if (slot.blendTimer > 0) {
      slot.blendTimer = Math.max(0, slot.blendTimer - dt);
      const blend = slot.blendTimer / 0.35;
      slot.x = targetPose.x + (slot.prevX - targetPose.x) * blend;
      slot.z = targetPose.z + (slot.prevZ - targetPose.z) * blend;
    } else {
      slot.x = targetPose.x;
      slot.z = targetPose.z;
    }
    slot.dirX = targetPose.dirX;
    slot.dirZ = targetPose.dirZ;

    // Suaviza rotação em curvas sem cortar esquina para fora da via
    const dHead = angleDeltaDeg(slot.heading, targetPose.heading);
    const maxTurn = Math.min(1, dt * 8.5);
    slot.heading = (slot.heading + dHead * maxTurn + 360) % 360;

    // Altura e inclinação seguindo exatamente o relevo da via
    slot.y = roadSurfaceY(slot.x, slot.z);
    const yF = roadSurfaceY(slot.x + slot.dirX * 1.6, slot.z + slot.dirZ * 1.6);
    const yB = roadSurfaceY(slot.x - slot.dirX * 1.6, slot.z - slot.dirZ * 1.6);
    const targetPitch = Math.max(-20, Math.min(20, (Math.atan2(yF - yB, 3.2) * 180) / Math.PI));
    slot.pitch += (targetPitch - slot.pitch) * Math.min(1, dt * 10);

    if (slot.model) {
      tryTintLoadedGlb(slot);
      syncSlotFootprint(slot);
      slot.model.root.setPosition(slot.x, slot.y, slot.z);
      slot.model.root.setLocalEulerAngles(slot.pitch, -slot.heading, 0);
      if (slot.model.wheels && slot.speed > 0.1) {
        slot.wheelAngle = (slot.wheelAngle - (slot.speed * dt * 180) / (Math.PI * 0.35)) % 360;
        for (let w = 0; w < slot.model.wheels.length; w++) {
          slot.model.wheels[w].setLocalEulerAngles(slot.wheelAngle, 0, 0);
        }
      }
    }
  }

  let destroyed = false;
  const obstaclesBuffer: TrafficObstacle[] = [];

  const getObstacles = (): TrafficObstacle[] => {
    obstaclesBuffer.length = 0;
    if (destroyed) return obstaclesBuffer;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.active) {
        obstaclesBuffer.push({
          x: slot.x,
          y: slot.y,
          z: slot.z,
          radius: slot.halfWidth,
          heading: slot.heading,
          halfWidth: slot.halfWidth,
          halfLength: slot.halfLength,
          height: slot.height,
        });
      }
    }
    return obstaclesBuffer;
  };
  activeObstacleProvider = getObstacles;

  return {
    update(dt: number) {
      if (destroyed || !Number.isFinite(dt) || dt < 0) return;
      const rtSettings = getRuntime(state).settings;
      const cap = Math.min(MAX_TRAFFIC_CARS, targetCarCount(rtSettings.traffic, rtSettings.quality));

      // Se tráfego desligado ou cap reduzido, desativa excedentes sem destruir o pool
      let activeCount = 0;
      for (let i = 0; i < slots.length; i++) {
        if (!slots[i].active) continue;
        if (activeCount >= cap) {
          despawnSlot(slots[i]);
        } else {
          activeCount++;
        }
      }
      if (cap === 0) return;

      // Atualiza carros ativos
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].active) updateSlot(slots[i], i, dt);
      }

      // Reconta ativos e preenche até o alvo usando o pool (até 6 spawns por quadro para suavidade)
      activeCount = 0;
      for (let i = 0; i < slots.length; i++) if (slots[i].active) activeCount++;
      if (activeCount < cap) {
        collectEdgesAround(state.x, state.z);
        let spawnedThisFrame = 0;
        for (let i = 0; i < slots.length && activeCount < cap && spawnedThisFrame < 6; i++) {
          if (slots[i].active) continue;
          if (trySpawnSlot(slots[i], i)) {
            activeCount++;
            spawnedThisFrame++;
          }
        }
      }
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (activeObstacleProvider === getObstacles) activeObstacleProvider = null;

      const mats = new Set<StandardMaterial>();
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        slot.active = false;
        if (slot.model) {
          for (let m = 0; m < slot.model.materials.length; m++) mats.add(slot.model.materials[m]);
          slot.model.root.destroy();
          slot.model = null;
        }
        for (let m = 0; m < slot.extraMaterials.length; m++) mats.add(slot.extraMaterials[m]);
        slot.extraMaterials.length = 0;
      }
      trafficRoot.destroy();
      for (const m of mats) m.destroy();
    },
  };
}
