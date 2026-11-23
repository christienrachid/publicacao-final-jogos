import {
  BLEND_NORMAL,
  CULLFACE_NONE,
  Color,
  Entity,
  Mesh,
  MeshInstance,
  StandardMaterial,
} from 'playcanvas';
import {
  PEDESTRIAN_CATEGORIES,
  buildRoadGraph,
  type RoadGraph,
  type RoadGraphEdge,
  type RoadLineGroup,
} from './trafego';
import type { DeliveryPoint, FlightContext, FlightModule, FlightState, MissionState, Stage } from './types';
import { getRuntime } from './ui/settings';
import { cityLayout, roadHeightAt, terrainHeight } from './world-data';

// ---------------------------------------------------------------------------
// Rota de GPS pelas ruas de Juiz de Fora (A* no grafo viário + faixa/setas 3D
// em uma única malha reconstruída apenas ao recalcular a rota).
// ---------------------------------------------------------------------------

export interface RoutePoint {
  x: number;
  z: number;
}

export interface RouteResult {
  /** Polilinha simplificada sobre as vias (início projetado → cruzamentos → ponto da via mais próximo do destino). */
  points: RoutePoint[];
  /** Destino real (entrega), para o trecho final tracejado do último ponto da via até a entrega. */
  target: RoutePoint;
  /** Distância total em metros (vias + trecho final até a entrega). */
  distance: number;
  /** Distância somente ao longo das vias (m). */
  roadDistance: number;
  /** Distância do último ponto da via até o destino (m). */
  finalLegDistance: number;
  /** true se encontrou caminho conectado no grafo; false se recorreu à linha direta. */
  found: boolean;
}

export interface ActiveRouteSnapshot extends RouteResult {
  deliveryId: string;
  leadsToNext: boolean;
  recalcCount: number;
}

const EDGE_GRID_CELL = 100;
const GROUND_GPS_RANGE_M = 250;
const GROUND_GPS_STEP_M = 6;
const GROUND_GPS_HALF_W = 0.85;
const GROUND_GPS_LIFT_M = 0.18;
const OFF_ROUTE_RECALC_M = 30;
const RECALC_COOLDOWN_S = 1.0;

const gridKey = (gx: number, gz: number) => gx * 4096 + gz;

let cachedRouteGraph: RoadGraph | undefined;
let cachedBuildMs = 0;

/** Constrói um grafo de rotas com todas as vias dirigíveis (exclui caminhos de pedestre). */
export function createRouteGraph(roadLines: ReadonlyArray<RoadLineGroup>): RoadGraph {
  return buildRoadGraph(roadLines, {
    filter: (cat) => !PEDESTRIAN_CATEGORIES.has(cat),
    snap: 8.5,
    bridgeGaps: 24,
  });
}

/** Grafo de rotas memorizado de Juiz de Fora (construído uma única vez). */
export function getRouteGraph(): RoadGraph {
  if (cachedRouteGraph) return cachedRouteGraph;
  const roadLines = cityLayout().roadLines;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  cachedRouteGraph = createRouteGraph(roadLines);
  cachedBuildMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return cachedRouteGraph;
}

/** Tempo de construção do grafo de rotas em milissegundos (para diagnóstico/testes). */
export function getRouteGraphBuildMs(): number {
  getRouteGraph();
  return cachedBuildMs;
}

interface ProjectedEdge {
  edge: RoadGraphEdge;
  x: number;
  z: number;
  t: number;
  dist: number;
}

function projectOntoGraph(graph: RoadGraph, x: number, z: number): ProjectedEdge | null {
  let bestEdge: RoadGraphEdge | null = null;
  let bestX = x, bestZ = z, bestT = 0, bestDistSq = Infinity;

  const gx0 = Math.floor(x / EDGE_GRID_CELL);
  const gz0 = Math.floor(z / EDGE_GRID_CELL);

  for (const ring of [1, 2, 4, 8, 16, 32]) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dz = -ring; dz <= ring; dz++) {
        // Nos anéis maiores, pula células já visitadas no anel anterior
        if (ring > 1 && Math.abs(dx) <= ring / 2 && Math.abs(dz) <= ring / 2) continue;
        const list = graph.edgeGrid.get(gridKey(gx0 + dx, gz0 + dz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const eid = list[i];
          if (eid % 2 === 1) continue; // testa só uma direção do par
          const edge = graph.edges[eid];
          const a = edge.pts[0], b = edge.pts[edge.pts.length - 1];
          const sdx = b.x - a.x, sdz = b.z - a.z;
          const len2 = sdx * sdx + sdz * sdz;
          const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * sdx + (z - a.z) * sdz) / len2)) : 0;
          const px = a.x + sdx * t, pz = a.z + sdz * t;
          const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
          if (d2 < bestDistSq) {
            bestDistSq = d2;
            bestEdge = edge;
            bestX = px;
            bestZ = pz;
            bestT = t;
          }
        }
      }
    }
    if (bestEdge && bestDistSq <= (ring * EDGE_GRID_CELL) * (ring * EDGE_GRID_CELL)) {
      break;
    }
  }

  if (!bestEdge) return null;
  return { edge: bestEdge, x: bestX, z: bestZ, t: bestT, dist: Math.sqrt(bestDistSq) };
}

// Buffers reutilizáveis para A* (zero alocação de arrays grandes por consulta)
interface AStarScratch {
  size: number;
  stamp: number;
  seen: Uint32Array;
  closed: Uint32Array;
  gScore: Float64Array;
  cameFrom: Int32Array;
  heapNode: Int32Array;
  heapF: Float64Array;
  edgeCost: Float32Array;
}

const scratchByGraph = new WeakMap<RoadGraph, AStarScratch>();

function getScratch(graph: RoadGraph): AStarScratch {
  const n = graph.nodes.length;
  let s = scratchByGraph.get(graph);
  if (!s || s.size < n || s.edgeCost.length < graph.edges.length) {
    // Penaliza subidas acima do limite de inclinação do carro (0,55) para o A* evitar ladeiras intransponíveis sem desvios excessivos
    const edgeCost = new Float32Array(graph.edges.length);
    for (let i = 0; i < graph.edges.length; i += 2) {
      const e = graph.edges[i];
      const a = e.pts[0], b = e.pts[e.pts.length - 1];
      const steps = Math.max(2, Math.min(20, Math.ceil(e.length / 3)));
      const stepLen = e.length / steps;
      let prevY = Math.max(terrainHeight(a.x, a.z), roadHeightAt(a.x, a.z));
      let maxUpFwd = 0;
      let maxUpRev = 0;
      for (let k = 1; k <= steps; k++) {
        const f = k / steps;
        const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
        const y = Math.max(terrainHeight(x, z), roadHeightAt(x, z));
        const diff = (y - prevY) / stepLen;
        if (diff > maxUpFwd) maxUpFwd = diff;
        if (-diff > maxUpRev) maxUpRev = -diff;
        prevY = y;
      }
      edgeCost[i] = maxUpFwd > 0.55 ? e.length * 8 : e.length;
      if (i + 1 < graph.edges.length) {
        edgeCost[i + 1] = maxUpRev > 0.55 ? graph.edges[i + 1].length * 8 : graph.edges[i + 1].length;
      }
    }
    s = {
      size: n,
      stamp: 0,
      seen: new Uint32Array(n),
      closed: new Uint32Array(n),
      gScore: new Float64Array(n),
      cameFrom: new Int32Array(n),
      heapNode: new Int32Array(Math.max(256, n * 4)),
      heapF: new Float64Array(Math.max(256, n * 4)),
      edgeCost,
    };
    scratchByGraph.set(graph, s);
  }
  s.stamp++;
  if (s.stamp >= 0xfffffffe) {
    s.seen.fill(0);
    s.closed.fill(0);
    s.stamp = 1;
  }
  return s;
}

function simplifyPolyline(pts: RoutePoint[], tolerance = 1.2): RoutePoint[] {
  if (pts.length <= 2) return pts;
  const out: RoutePoint[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const dx = next.x - prev.x, dz = next.z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const dev = Math.abs((cur.x - prev.x) * dz - (cur.z - prev.z) * dx) / len;
    if (dev >= tolerance) out.push(cur);
  }
  const last = pts[pts.length - 1];
  const prev = out[out.length - 1];
  if (Math.hypot(last.x - prev.x, last.z - prev.z) > 0.5) out.push(last);
  return out;
}

/** Calcula a rota A* pelas ruas do ponto (fromX, fromZ) até (toX, toZ). */
export function computeRoute(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  graph: RoadGraph = getRouteGraph(),
): RouteResult {
  const target: RoutePoint = { x: toX, z: toZ };
  const straightDist = Math.hypot(toX - fromX, toZ - fromZ);
  const startProj = projectOntoGraph(graph, fromX, fromZ);
  const endProj = projectOntoGraph(graph, toX, toZ);

  if (!startProj || !endProj) {
    return {
      points: [{ x: fromX, z: fromZ }, target],
      target,
      distance: straightDist,
      roadDistance: straightDist,
      finalLegDistance: 0,
      found: false,
    };
  }

  // Mesmo segmento de via: vai direto sobre a aresta
  if (startProj.edge.id === endProj.edge.id || startProj.edge.reverseId === endProj.edge.id) {
    const roadDistance = Math.hypot(endProj.x - startProj.x, endProj.z - startProj.z);
    const finalLegDistance = Math.hypot(toX - endProj.x, toZ - endProj.z);
    return {
      points: [
        { x: startProj.x, z: startProj.z },
        { x: endProj.x, z: endProj.z },
      ],
      target,
      distance: roadDistance + finalLegDistance,
      roadDistance,
      finalLegDistance,
      found: true,
    };
  }

  const sc = getScratch(graph);
  const stamp = sc.stamp;
  const { seen, closed, gScore, cameFrom, heapNode, heapF, edgeCost } = sc;
  let heapLen = 0;

  const pushHeap = (node: number, f: number) => {
    if (heapLen >= heapNode.length) return;
    let i = heapLen++;
    heapNode[i] = node;
    heapF[i] = f;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= heapF[i]) break;
      const tn = heapNode[p], tf = heapF[p];
      heapNode[p] = heapNode[i];
      heapF[p] = heapF[i];
      heapNode[i] = tn;
      heapF[i] = tf;
      i = p;
    }
  };

  const popHeap = (): number => {
    const top = heapNode[0];
    heapLen--;
    if (heapLen > 0) {
      heapNode[0] = heapNode[heapLen];
      heapF[0] = heapF[heapLen];
      let i = 0;
      while (true) {
        const l = i * 2 + 1, r = l + 1;
        let sm = i;
        if (l < heapLen && heapF[l] < heapF[sm]) sm = l;
        if (r < heapLen && heapF[r] < heapF[sm]) sm = r;
        if (sm === i) break;
        const tn = heapNode[i], tf = heapF[i];
        heapNode[i] = heapNode[sm];
        heapF[i] = heapF[sm];
        heapNode[sm] = tn;
        heapF[sm] = tf;
        i = sm;
      }
    }
    return top;
  };

  const goalA = endProj.edge.from;
  const goalB = endProj.edge.to;
  const goalCostA = endProj.t * endProj.edge.length;
  const goalCostB = (1 - endProj.t) * endProj.edge.length;

  const seedStart = (nodeId: number, cost: number) => {
    const n = graph.nodes[nodeId];
    if (seen[nodeId] === stamp && gScore[nodeId] <= cost) return;
    seen[nodeId] = stamp;
    gScore[nodeId] = cost;
    cameFrom[nodeId] = -1;
    pushHeap(nodeId, cost + Math.hypot(n.x - endProj.x, n.z - endProj.z));
  };

  seedStart(startProj.edge.from, startProj.t * startProj.edge.length);
  seedStart(startProj.edge.to, (1 - startProj.t) * startProj.edge.length);

  let bestGoalNode = -1;
  let bestTotal = Infinity;

  while (heapLen > 0) {
    const cur = popHeap();
    if (closed[cur] === stamp) continue;
    closed[cur] = stamp;

    const gCur = gScore[cur];
    if (gCur >= bestTotal) break;

    if (cur === goalA && gCur + goalCostA < bestTotal) {
      bestTotal = gCur + goalCostA;
      bestGoalNode = goalA;
    }
    if (cur === goalB && gCur + goalCostB < bestTotal) {
      bestTotal = gCur + goalCostB;
      bestGoalNode = goalB;
    }

    const out = graph.nodes[cur].outEdges;
    for (let i = 0; i < out.length; i++) {
      const eid = out[i];
      const e = graph.edges[eid];
      const next = e.to;
      if (closed[next] === stamp) continue;
      const candG = gCur + edgeCost[eid];
      if (seen[next] !== stamp || candG < gScore[next]) {
        seen[next] = stamp;
        gScore[next] = candG;
        cameFrom[next] = cur;
        const nn = graph.nodes[next];
        pushHeap(next, candG + Math.hypot(nn.x - endProj.x, nn.z - endProj.z));
      }
    }
  }

  if (bestGoalNode < 0) {
    return {
      points: [{ x: fromX, z: fromZ }, target],
      target,
      distance: straightDist,
      roadDistance: straightDist,
      finalLegDistance: 0,
      found: false,
    };
  }

  // Reconstrói sequência de nós
  const revNodes: number[] = [];
  let walk = bestGoalNode;
  while (walk >= 0) {
    revNodes.push(walk);
    walk = cameFrom[walk];
  }

  const rawPts: RoutePoint[] = [{ x: startProj.x, z: startProj.z }];
  for (let i = revNodes.length - 1; i >= 0; i--) {
    const n = graph.nodes[revNodes[i]];
    const prev = rawPts[rawPts.length - 1];
    if (Math.hypot(n.x - prev.x, n.z - prev.z) > 1.0) {
      rawPts.push({ x: n.x, z: n.z });
    }
  }
  const lastRaw = rawPts[rawPts.length - 1];
  if (Math.hypot(endProj.x - lastRaw.x, endProj.z - lastRaw.z) > 1.0) {
    rawPts.push({ x: endProj.x, z: endProj.z });
  }

  const points = simplifyPolyline(rawPts, 0.6);
  let roadDistance = 0;
  for (let i = 1; i < points.length; i++) {
    roadDistance += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  const lastRoad = points[points.length - 1];
  const finalLegDistance = Math.hypot(toX - lastRoad.x, toZ - lastRoad.z);

  return {
    points,
    target,
    distance: roadDistance + finalLegDistance,
    roadDistance,
    finalLegDistance,
    found: true,
  };
}

/** Distância mínima de (x, z) até a polilinha de rota (sem alocar memória). */
export function distanceToPolyline(points: ReadonlyArray<RoutePoint>, x: number, z: number): number {
  const n = points.length;
  if (n === 0) return Infinity;
  if (n === 1) return Math.hypot(x - points[0].x, z - points[0].z);
  let best2 = Infinity;
  for (let i = 0; i < n - 1; i++) {
    const ax = points[i].x, az = points[i].z;
    const dx = points[i + 1].x - ax, dz = points[i + 1].z - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
    const px = ax + dx * t, pz = az + dz * t;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < best2) best2 = d2;
  }
  return Math.sqrt(best2);
}

function isGroundVehicle(v: FlightState['vehicle']): boolean {
  return v === 'foot' || v === 'car' || v === 'tuned';
}

function selectNextGroundDelivery(mission: MissionState | undefined, state: FlightState): DeliveryPoint | null {
  if (!mission || mission.status !== 'playing' || mission.deliveries.length === 0) return null;
  const activeStage: Stage = mission.carrying ?? mission.stage;
  if (activeStage === 'heli' || activeStage === 'a29') return null;

  let next: DeliveryPoint | null = null;
  let bestDistSq = Infinity;
  let stagePendingCount = 0;
  for (let i = 0; i < mission.deliveries.length; i++) {
    const d = mission.deliveries[i];
    if (!d.delivered && d.stage === activeStage) stagePendingCount++;
    if (mission.nextDeliveryId && d.id === mission.nextDeliveryId && !d.delivered) {
      next = d;
    }
  }
  if (next) return next;

  for (let i = 0; i < mission.deliveries.length; i++) {
    const d = mission.deliveries[i];
    if (d.delivered || d.stage !== activeStage) continue;
    if (stagePendingCount > 1 && (d.leadsToNext || d.id === 'a29-4')) continue;
    const dSq = (d.x - state.x) * (d.x - state.x) + (d.z - state.z) * (d.z - state.z);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      next = d;
    }
  }
  return next;
}

// Estado vivo da rota compartilhado com HUD e marcadores (sem recomputar nem alocar por quadro)
const activeRouteByState = new WeakMap<FlightState, ActiveRouteSnapshot | null>();

/** Retorna a rota GPS ativa nos estágios de chão (null no heli, no A-29 ou fora da partida). */
export function getActiveRoute(state: FlightState): ActiveRouteSnapshot | null {
  if (!isGroundVehicle(state.vehicle)) return null;
  return activeRouteByState.get(state) ?? null;
}

function surfaceY(x: number, z: number): number {
  return Math.max(terrainHeight(x, z), roadHeightAt(x, z), 0) + GROUND_GPS_LIFT_M;
}

/** Constrói a malha única (faixa + setas + trecho final tracejado) dos próximos ~250 m da rota. */
function fillGroundRouteBuffers(
  route: ActiveRouteSnapshot,
  pos: number[],
  normals: number[],
  col: number[],
  idx: number[],
): void {
  pos.length = 0;
  normals.length = 0;
  col.length = 0;
  idx.length = 0;

  const pts = route.points;
  if (pts.length < 2) return;

  const ribbonColor: [number, number, number, number] = route.leadsToNext
    ? [255, 110, 224, 210]
    : [255, 214, 72, 215];
  const arrowColor: [number, number, number, number] = [255, 250, 220, 255];

  const pushV = (x: number, y: number, z: number, c: [number, number, number, number]) => {
    const id = pos.length / 3;
    pos.push(x, y, z);
    normals.push(0, 1, 0);
    col.push(c[0], c[1], c[2], c[3]);
    return id;
  };

  // Subdivide os primeiros ~250 m em amostras a cada <= 6 m para acompanhar o relevo das ladeiras
  const sampleX: number[] = [];
  const sampleZ: number[] = [];
  const sampleS: number[] = [];
  let acc = 0;
  let reachedEnd = true;

  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i].x, az = pts[i].z;
    const bx = pts[i + 1].x, bz = pts[i + 1].z;
    const segLen = Math.hypot(bx - ax, bz - az);
    if (segLen < 0.25) continue;
    const remaining = GROUND_GPS_RANGE_M - acc;
    if (remaining <= 0) {
      reachedEnd = false;
      break;
    }
    const useLen = Math.min(segLen, remaining);
    const steps = Math.max(1, Math.ceil(useLen / GROUND_GPS_STEP_M));
    for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
      const f = (useLen * (k / steps)) / segLen;
      sampleX.push(ax + (bx - ax) * f);
      sampleZ.push(az + (bz - az) * f);
      sampleS.push(acc + useLen * (k / steps));
    }
    acc += useLen;
    if (useLen < segLen) {
      reachedEnd = false;
      break;
    }
  }

  if (sampleX.length >= 2) {
    // Faixa contínua central
    const baseRibbon = pos.length / 3;
    for (let i = 0; i < sampleX.length; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(sampleX.length - 1, i + 1);
      const tx = sampleX[i1] - sampleX[i0];
      const tz = sampleZ[i1] - sampleZ[i0];
      const len = Math.hypot(tx, tz) || 1;
      const nx = (-tz / len) * GROUND_GPS_HALF_W;
      const nz = (tx / len) * GROUND_GPS_HALF_W;
      const lx = sampleX[i] + nx, lz = sampleZ[i] + nz;
      const rx = sampleX[i] - nx, rz = sampleZ[i] - nz;
      pushV(lx, surfaceY(lx, lz), lz, ribbonColor);
      pushV(rx, surfaceY(rx, rz), rz, ribbonColor);
    }
    for (let i = 0; i < sampleX.length - 1; i++) {
      const l0 = baseRibbon + i * 2;
      idx.push(l0, l0 + 2, l0 + 1, l0 + 1, l0 + 2, l0 + 3);
    }

    // Setas direcionais (chevrons) embutidas na mesma malha a cada ~18 m
    let nextArrow = 10;
    for (let i = 1; i < sampleX.length - 1; i++) {
      if (sampleS[i] < nextArrow) continue;
      nextArrow = sampleS[i] + 18;
      const tx = sampleX[i + 1] - sampleX[i - 1];
      const tz = sampleZ[i + 1] - sampleZ[i - 1];
      const len = Math.hypot(tx, tz);
      if (len < 0.1) continue;
      const fx = tx / len, fz = tz / len;
      const rx = -fz, rz = fx;
      const cx = sampleX[i], cz = sampleZ[i];
      const tipX = cx + fx * 2.2, tipZ = cz + fz * 2.2;
      const leftX = cx - fx * 1.1 + rx * 1.65, leftZ = cz - fz * 1.1 + rz * 1.65;
      const rightX = cx - fx * 1.1 - rx * 1.65, rightZ = cz - fz * 1.1 - rz * 1.65;
      const vTip = pushV(tipX, surfaceY(tipX, tipZ) + 0.05, tipZ, arrowColor);
      const vLeft = pushV(leftX, surfaceY(leftX, leftZ) + 0.05, leftZ, arrowColor);
      const vRight = pushV(rightX, surfaceY(rightX, rightZ) + 0.05, rightZ, arrowColor);
      idx.push(vLeft, vTip, vRight);
    }
  }

  // Trecho final tracejado do último ponto da via até a entrega (quando dentro dos 250 m)
  if (reachedEnd && route.finalLegDistance > 2.5) {
    const last = pts[pts.length - 1];
    const tx = route.target.x - last.x, tz = route.target.z - last.z;
    const total = Math.hypot(tx, tz);
    if (total > 1) {
      const fx = tx / total, fz = tz / total;
      const nx = -fz * 0.65, nz = fx * 0.65;
      const dashLen = 3.8, gapLen = 2.8;
      for (let s0 = 0; s0 < total; s0 += dashLen + gapLen) {
        const s1 = Math.min(total, s0 + dashLen);
        const ax = last.x + fx * s0, az = last.z + fz * s0;
        const bx = last.x + fx * s1, bz = last.z + fz * s1;
        const v0 = pushV(ax + nx, surfaceY(ax + nx, az + nz), az + nz, arrowColor);
        const v1 = pushV(ax - nx, surfaceY(ax - nx, az - nz), az - nz, arrowColor);
        const v2 = pushV(bx + nx, surfaceY(bx + nx, bz + nz), bz + nz, arrowColor);
        const v3 = pushV(bx - nx, surfaceY(bx - nx, bz - nz), bz - nz, arrowColor);
        idx.push(v0, v2, v1, v1, v2, v3);
      }
    }
  }
}

/**
 * Módulo de GPS pelas ruas: calcula a rota A* apenas quando necessário e mantém
 * 1 única malha no chão (1 draw call) nos estágios de chão (a pé, carro, tunado).
 */
export function createGpsRoute(ctx: FlightContext): FlightModule {
  const { app, state } = ctx;
  const graph = getRouteGraph();
  const parent = ctx.plane.root.parent instanceof Entity ? ctx.plane.root.parent : app.root;

  let entity: Entity | null = null;
  let mesh: Mesh | null = null;
  let material: StandardMaterial | null = null;

  if (app.graphicsDevice && typeof Mesh === 'function') {
    material = new StandardMaterial();
    material.useLighting = false;
    material.diffuse = new Color(0, 0, 0);
    material.emissive = new Color(1, 1, 1);
    material.emissiveVertexColor = true;
    material.emissiveIntensity = 1.45;
    material.opacity = 0.86;
    material.blendType = BLEND_NORMAL;
    material.depthWrite = false;
    material.cull = CULLFACE_NONE;
    material.update();

    mesh = new Mesh(app.graphicsDevice);
    entity = new Entity('GpsRouteGround', app);
    entity.addComponent('render', {
      meshInstances: [new MeshInstance(mesh, material)],
      castShadows: false,
      receiveShadows: false,
    });
    entity.enabled = false;
    parent.addChild(entity);
  }

  // Buffers pré-alocados e reutilizados a cada recálculo
  const posBuf: number[] = [];
  const normBuf: number[] = [];
  const colBuf: number[] = [];
  const idxBuf: number[] = [];

  let activeSnapshot: ActiveRouteSnapshot | null = null;
  let lastDeliveryId = '';
  let lastTargetX = Number.NaN;
  let lastTargetZ = Number.NaN;
  let lastCalcX = Number.NaN;
  let lastCalcZ = Number.NaN;
  let timeSinceRecalc = RECALC_COOLDOWN_S;
  let recalcCount = 0;
  let destroyed = false;

  function clearActive() {
    if (activeSnapshot !== null) {
      activeSnapshot = null;
      activeRouteByState.set(state, null);
    }
    lastDeliveryId = '';
    if (entity) entity.enabled = false;
  }

  function rebuildGroundMesh(route: ActiveRouteSnapshot, showGround: boolean) {
    if (!entity || !mesh) return;
    if (!showGround || route.points.length < 2) {
      entity.enabled = false;
      return;
    }
    fillGroundRouteBuffers(route, posBuf, normBuf, colBuf, idxBuf);
    if (posBuf.length === 0 || idxBuf.length === 0) {
      entity.enabled = false;
      return;
    }
    mesh.setPositions(posBuf);
    mesh.setNormals(normBuf);
    mesh.setColors32(colBuf);
    mesh.setIndices(posBuf.length / 3 > 65535 ? new Uint32Array(idxBuf) : new Uint16Array(idxBuf));
    mesh.update();
    entity.enabled = true;
  }

  return {
    update(dt: number) {
      if (destroyed) return;
      const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
      timeSinceRecalc += safeDt;

      const rt = getRuntime(state);
      if (rt.mode !== 'playing' || !isGroundVehicle(state.vehicle)) {
        clearActive();
        return;
      }

      const next = selectNextGroundDelivery(ctx.mission, state);
      if (!next) {
        clearActive();
        return;
      }

      const targetChanged =
        next.id !== lastDeliveryId ||
        next.x !== lastTargetX ||
        next.z !== lastTargetZ ||
        activeSnapshot === null;

      let shouldRecalc = targetChanged;
      if (!shouldRecalc && activeSnapshot) {
        const offRoute = distanceToPolyline(activeSnapshot.points, state.x, state.z) > OFF_ROUTE_RECALC_M;
        const movedEnough = Math.hypot(state.x - lastCalcX, state.z - lastCalcZ) > 8;
        if (offRoute || (timeSinceRecalc >= RECALC_COOLDOWN_S && movedEnough)) {
          shouldRecalc = true;
        }
      }

      if (shouldRecalc) {
        const result = computeRoute(state.x, state.z, next.x, next.z, graph);
        recalcCount++;
        lastDeliveryId = next.id;
        lastTargetX = next.x;
        lastTargetZ = next.z;
        lastCalcX = state.x;
        lastCalcZ = state.z;
        timeSinceRecalc = 0;

        activeSnapshot = {
          ...result,
          deliveryId: next.id,
          leadsToNext: Boolean(next.leadsToNext),
          recalcCount,
        };
        activeRouteByState.set(state, activeSnapshot);
        rebuildGroundMesh(activeSnapshot, rt.settings.showGroundGps);
      } else if (entity && activeSnapshot) {
        const wantGround = rt.settings.showGroundGps && activeSnapshot.points.length >= 2;
        if (wantGround && !entity.enabled && posBuf.length === 0) {
          rebuildGroundMesh(activeSnapshot, true);
        } else if (entity.enabled !== wantGround) {
          entity.enabled = wantGround;
        }
      }
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      activeRouteByState.delete(state);
      entity?.destroy();
      entity = null;
      mesh?.destroy();
      mesh = null;
      material?.destroy();
      material = null;
    },
  };
}
