import { type Entity, KEY_SHIFT, KEY_W, Quat, Vec3 } from 'playcanvas';
import { getActiveRoute } from './rota';
import { isSmokeActive } from './smoke';
import {
  STAGE_ORDER,
  type DeliveryPoint,
  type FlightContext,
  type FlightModule,
  type FlightState,
  type MissionState,
  type Stage,
  type VehicleKind,
} from './types';
import { getRuntime } from './ui/settings';
import { AIRPORT, cityLayout, terrainHeight } from './world-data';

type AlertState = 'none' | 'stall' | 'crashed';

interface MarkerCache {
  visible: boolean;
  x: number;
  y: number;
}

interface MinimapBlip {
  kind: Exclude<VehicleKind, 'foot'>;
  x: number;
  z: number;
}

const NEARBY_LABEL: Record<Exclude<VehicleKind, 'foot'>, string> = {
  car: 'Hatch',
  tuned: 'Esportivo',
  a29: 'A-29',
  heli: 'helicóptero',
};

const STAGE_INDEX_LABEL: Record<Stage, string> = {
  car: 'Etapa 1/4',
  tuned: 'Etapa 2/4',
  heli: 'Etapa 3/4',
  a29: 'Etapa 4/4',
};

const STAGE_SHORT_CODE: Record<Stage, string> = {
  car: 'H',
  tuned: 'C',
  heli: 'H',
  a29: 'A',
};

const PROJECTION_DIST = 500;
const MAP_CANVAS_PX = 1024;
const MINIMAP_REDRAW_INTERVAL = 3;

// Constantes do arco SVG do velocímetro (240°: -210° até +30°)
const SVG_NS = 'http://www.w3.org/2000/svg';
const DIAL_CX = 74;
const DIAL_CY = 74;
const DIAL_R = 56;
const DIAL_START_DEG = 150;
const DIAL_SWEEP_DEG = 240;

interface MinimapLandmark {
  name: string;
  x: number;
  z: number;
  highlight?: boolean;
}

interface MinimapBlueprint {
  canvas: HTMLCanvasElement;
  minX: number;
  minZ: number;
  spanX: number;
  spanZ: number;
  pxPerMX: number;
  pxPerMZ: number;
  helipad: { x: number; z: number };
  workshop: { x: number; z: number };
  runwayCenter: { x: number; z: number };
  landmarks: MinimapLandmark[];
}

let cachedBlueprint: MinimapBlueprint | null = null;

function traceFlatPolygon(
  g: CanvasRenderingContext2D,
  pts: ReadonlyArray<number>,
  wx: (x: number) => number,
  wz: (z: number) => number,
): boolean {
  if (pts.length < 6) return false;
  g.beginPath();
  g.moveTo(wx(pts[0]), wz(pts[1]));
  for (let i = 2; i + 1 < pts.length; i += 2) {
    g.lineTo(wx(pts[i]), wz(pts[i + 1]));
  }
  g.closePath();
  return true;
}

function strokeFlatLines(
  g: CanvasRenderingContext2D,
  lines: ReadonlyArray<ReadonlyArray<number>>,
  wx: (x: number) => number,
  wz: (z: number) => number,
): void {
  g.beginPath();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 4) continue;
    g.moveTo(wx(line[0]), wz(line[1]));
    for (let j = 2; j + 1 < line.length; j += 2) {
      g.lineTo(wx(line[j]), wz(line[j + 1]));
    }
  }
  g.stroke();
}

const ROAD_STYLE: Record<string, { color: string; casing?: string; minPx: number; scale: number }> = {
  tertiary: { color: '#45433d', minPx: 1.0, scale: 0.72 },
  secondary: { color: '#6b675c', minPx: 1.5, scale: 0.8 },
  primary: { color: '#9c9686', casing: 'rgba(14, 13, 11, 0.78)', minPx: 2.1, scale: 0.86 },
  trunk: { color: '#cfc09b', casing: 'rgba(14, 13, 11, 0.86)', minPx: 2.7, scale: 0.92 },
  motorway: { color: '#e6ca7a', casing: 'rgba(14, 13, 11, 0.92)', minPx: 3.3, scale: 0.98 },
};

function buildMinimapBlueprint(): MinimapBlueprint | null {
  if (cachedBlueprint) return cachedBlueprint;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = MAP_CANVAS_PX;
  canvas.height = MAP_CANVAS_PX;
  const g = canvas.getContext('2d');
  if (!g) return null;

  const layout = cityLayout();
  const minX = layout.bounds.x0;
  const minZ = layout.bounds.z0;
  const spanX = Math.max(1, layout.bounds.x1 - layout.bounds.x0);
  const spanZ = Math.max(1, layout.bounds.z1 - layout.bounds.z0);
  const pxPerMX = MAP_CANVAS_PX / spanX;
  const pxPerMZ = MAP_CANVAS_PX / spanZ;
  const pxPerM = (pxPerMX + pxPerMZ) * 0.5;
  const wx = (x: number) => (x - minX) * pxPerMX;
  const wz = (z: number) => (z - minZ) * pxPerMZ;
  const ws = (m: number) => m * pxPerM;

  // 1) Fundo topográfico quente escuro de Juiz de Fora
  g.fillStyle = '#191a16';
  g.fillRect(0, 0, MAP_CANVAS_PX, MAP_CANVAS_PX);

  const reliefStep = 90;
  const cellW = reliefStep * pxPerMX + 1;
  const cellH = reliefStep * pxPerMZ + 1;
  for (let z = minZ; z < layout.bounds.z1; z += reliefStep) {
    for (let x = minX; x < layout.bounds.x1; x += reliefStep) {
      const h = terrainHeight(x + reliefStep * 0.5, z + reliefStep * 0.5);
      if (h > 35) {
        const a = Math.min(0.24, (h - 35) / 380);
        g.fillStyle = h > 135 ? `rgba(164, 156, 138, ${a.toFixed(3)})` : `rgba(104, 122, 92, ${a.toFixed(3)})`;
        g.fillRect(wx(x), wz(z), cellW, cellH);
      }
    }
  }

  // 2) Polígonos reais: aeroporto, universidades (UFJF), praças/parques e estádios
  if (traceFlatPolygon(g, layout.airportPolygon, wx, wz)) {
    g.fillStyle = '#2a2925';
    g.fill();
    g.strokeStyle = 'rgba(212, 195, 159, 0.32)';
    g.lineWidth = 1.2;
    g.stroke();
  }

  g.fillStyle = '#243a2e';
  g.strokeStyle = 'rgba(138, 184, 146, 0.36)';
  g.lineWidth = 1.1;
  for (let i = 0; i < layout.universityPolygons.length; i++) {
    if (traceFlatPolygon(g, layout.universityPolygons[i].pts, wx, wz)) {
      g.fill();
      g.stroke();
    }
  }

  g.fillStyle = '#21402a';
  g.strokeStyle = 'rgba(122, 178, 126, 0.4)';
  g.lineWidth = 1.0;
  for (let i = 0; i < layout.parkPolygons.length; i++) {
    if (traceFlatPolygon(g, layout.parkPolygons[i].pts, wx, wz)) {
      g.fill();
      g.stroke();
    }
  }

  g.fillStyle = '#2a4a32';
  g.strokeStyle = 'rgba(246, 240, 225, 0.6)';
  g.lineWidth = 1.4;
  for (let i = 0; i < layout.stadiumPolygons.length; i++) {
    if (traceFlatPolygon(g, layout.stadiumPolygons[i].pts, wx, wz)) {
      g.fill();
      g.stroke();
    }
  }

  // 3) Planta dos prédios
  for (let i = 0; i < layout.buildings.length; i++) {
    const b = layout.buildings[i];
    const hNorm = Math.max(0, Math.min(1, (b.top - 10) / 140));
    const lum = Math.round(58 + hNorm * 52);
    g.fillStyle = `rgba(${lum + 4}, ${lum + 1}, ${lum - 4}, 0.7)`;
    g.fillRect(wx(b.x0), wz(b.z0), Math.max(1.1, (b.x1 - b.x0) * pxPerMX), Math.max(1.1, (b.z1 - b.z0) * pxPerMZ));
  }

  // 4) Rio Paraibuna
  if (layout.river.lines.length > 0) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const riverW = Math.max(2.8, ws(layout.river.width));
    g.strokeStyle = 'rgba(32, 92, 126, 0.35)';
    g.lineWidth = riverW + 2.2;
    strokeFlatLines(g, layout.river.lines, wx, wz);
    g.strokeStyle = '#3b88ad';
    g.lineWidth = riverW;
    strokeFlatLines(g, layout.river.lines, wx, wz);
  }

  // 5) Malha viária real
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let i = layout.roadLines.length - 1; i >= 0; i--) {
    const group = layout.roadLines[i];
    if (group.lines.length === 0) continue;
    const style = ROAD_STYLE[group.category] ?? ROAD_STYLE.tertiary;
    const widthPx = Math.max(style.minPx, ws(group.width * style.scale));
    if (style.casing) {
      g.strokeStyle = style.casing;
      g.lineWidth = widthPx + 1.5;
      strokeFlatLines(g, group.lines, wx, wz);
    }
    g.strokeStyle = style.color;
    g.lineWidth = widthPx;
    strokeFlatLines(g, group.lines, wx, wz);
  }

  // 6) Pista real do Aeroporto da Serrinha
  const { a: rA, b: rB, width: rwWidthM } = layout.runwayLine;
  const rAx = wx(rA.x);
  const rAz = wz(rA.z);
  const rBx = wx(rB.x);
  const rBz = wz(rB.z);
  const rwPx = Math.max(4.6, ws(rwWidthM));
  g.lineCap = 'butt';
  g.strokeStyle = '#11100e';
  g.lineWidth = rwPx + 2;
  g.beginPath();
  g.moveTo(rAx, rAz);
  g.lineTo(rBx, rBz);
  g.stroke();
  g.strokeStyle = '#6b675c';
  g.lineWidth = rwPx;
  g.beginPath();
  g.moveTo(rAx, rAz);
  g.lineTo(rBx, rBz);
  g.stroke();
  g.strokeStyle = '#f2c21a';
  g.lineWidth = 1.2;
  g.setLineDash([4, 3]);
  g.beginPath();
  g.moveTo(rAx, rAz);
  g.lineTo(rBx, rBz);
  g.stroke();
  g.setLineDash([]);

  // 7) Lote da UniAcademia em destaque amarelo-correio
  const uni = layout.landmarks.uniacademia;
  g.save();
  g.translate(wx(uni.x), wz(uni.z));
  g.rotate((uni.heading * Math.PI) / 180);
  const uniW = Math.max(7, uni.width * pxPerMX);
  const uniD = Math.max(5.5, uni.depth * pxPerMZ);
  g.fillStyle = '#f2c21a';
  g.strokeStyle = '#171512';
  g.lineWidth = 1.4;
  g.fillRect(-uniW * 0.5, -uniD * 0.5, uniW, uniD);
  g.strokeRect(-uniW * 0.5, -uniD * 0.5, uniW, uniD);
  g.restore();

  // 8) Oficina do Esportivo
  const wkX = wx(layout.workshop.x);
  const wkZ = wz(layout.workshop.z);
  g.fillStyle = '#171512';
  g.strokeStyle = '#f2c21a';
  g.lineWidth = 1.5;
  g.fillRect(wkX - 5, wkZ - 5, 10, 10);
  g.strokeRect(wkX - 5, wkZ - 5, 10, 10);

  // 9) Heliponto
  const hpX = wx(layout.helipad.x);
  const hpZ = wz(layout.helipad.z);
  g.beginPath();
  g.arc(hpX, hpZ, 5.5, 0, Math.PI * 2);
  g.fillStyle = '#171512';
  g.fill();
  g.strokeStyle = '#f6f0e1';
  g.lineWidth = 1.4;
  g.stroke();

  const runwayCenter = { x: (rA.x + rB.x) * 0.5, z: (rA.z + rB.z) * 0.5 };
  const landmarks: MinimapLandmark[] = [
    { name: 'Centro', x: layout.landmarks.centro.x, z: layout.landmarks.centro.z },
    { name: 'UFJF', x: layout.landmarks.ufjf.x, z: layout.landmarks.ufjf.z },
    { name: 'Cristo', x: layout.landmarks.cristo.x, z: layout.landmarks.cristo.z },
    { name: 'Estádio', x: layout.landmarks.estadio.x, z: layout.landmarks.estadio.z },
    { name: 'Aeroporto', x: runwayCenter.x, z: runwayCenter.z },
    { name: 'UniAcademia', x: uni.x, z: uni.z, highlight: true },
  ];

  cachedBlueprint = {
    canvas,
    minX,
    minZ,
    spanX,
    spanZ,
    pxPerMX,
    pxPerMZ,
    helipad: { x: layout.helipad.x, z: layout.helipad.z },
    workshop: { x: layout.workshop.x, z: layout.workshop.z },
    runwayCenter,
    landmarks,
  };
  return cachedBlueprint;
}

// Estado de nitro do carro tunado compartilhado com áudio e chamas de escape
const nitroActiveByState = new WeakMap<FlightState, boolean>();

export function isTunedNitroActive(state: FlightState): boolean {
  return state.vehicle === 'tuned' && (nitroActiveByState.get(state) ?? false);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = (startDeg * Math.PI) / 180;
  const e = (endDeg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(s);
  const y1 = cy + r * Math.sin(s);
  const x2 = cx + r * Math.cos(e);
  const y2 = cy + r * Math.sin(e);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function formatClockDigits(minutes: number): [string, string, string, string] {
  const clamped = Math.max(360, Math.min(720, Math.floor(minutes)));
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
  const mm = String(clamped % 60).padStart(2, '0');
  return [hh[0], hh[1], mm[0], mm[1]];
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(meters)} m`;
}

function estimateCarGear(speedMs: number, throttle: number, isTuned: boolean): { label: string; rpmRatio: number } {
  const kmh = Math.abs(speedMs) * 3.6;
  if (speedMs < -0.6) return { label: 'R', rpmRatio: Math.min(1, 0.25 + kmh / 45) };
  if (kmh < 2 && throttle < 0.05) return { label: 'N', rpmRatio: 0.14 };
  const bands = isTuned ? [38, 76, 118, 165, 220, 275] : [26, 54, 86, 122, 168];
  let gear = 1;
  let low = 0;
  let high = bands[0];
  for (let i = 0; i < bands.length; i++) {
    if (kmh <= bands[i] || i === bands.length - 1) {
      gear = i + 1;
      low = i === 0 ? 0 : bands[i - 1] * 0.72;
      high = bands[i];
      break;
    }
  }
  const ratio = Math.max(0.18, Math.min(1, ((kmh - low) / Math.max(12, high - low)) * 0.78 + throttle * 0.22));
  return { label: String(gear), rpmRatio: ratio };
}

function scanSceneVehicles(root: Entity, out: MinimapBlip[]): void {
  out.length = 0;
  const stack: Entity[] = [];
  for (let i = root.children.length - 1; i >= 0; i--) {
    stack.push(root.children[i] as Entity);
  }
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (!cur.enabled) continue;
    const lower = cur.name.toLowerCase();
    let kind: Exclude<VehicleKind, 'foot'> | null = null;
    if (lower === 'a29' || lower === 'airplane' || lower.startsWith('veiculo-a29')) kind = 'a29';
    else if (lower === 'heli' || lower === 'helicopter' || lower.startsWith('veiculo-heli')) kind = 'heli';
    else if (lower === 'carro_tunado' || lower.includes('tunado') || lower.startsWith('veiculo-tuned')) kind = 'tuned';
    else if (lower.startsWith('carro_') || lower.startsWith('veiculo-car')) kind = 'car';

    if (kind) {
      const p = cur.getPosition();
      out.push({ kind, x: p.x, z: p.z });
      continue;
    }
    for (let i = cur.children.length - 1; i >= 0; i--) {
      stack.push(cur.children[i] as Entity);
    }
  }
}

function isStageLocked(kind: Exclude<VehicleKind, 'foot'>, mission?: MissionState): boolean {
  if (!mission || mission.status !== 'playing') return false;
  const unlockedIdx = STAGE_ORDER.indexOf(mission.stage);
  const targetIdx = STAGE_ORDER.indexOf(kind);
  return unlockedIdx >= 0 && targetIdx > unlockedIdx;
}

function readExternalNitro(state: FlightState): number | null {
  const raw = (state as { nitro?: unknown }).nitro;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw > 1.01) return Math.max(0, Math.min(1, raw / 100));
  return Math.max(0, Math.min(1, raw));
}

export function createHud(ctx: FlightContext, uiRoot?: HTMLElement | null): FlightModule {
  const { app, plane, camera, state } = ctx;
  const ui = uiRoot ?? (typeof document !== 'undefined' ? document.getElementById('ui') : null);
  if (!ui) return { update() {} };

  const blueprint = buildMinimapBlueprint();

  const root = el('div', 'hud-root');

  // Camada de mira e cruz do nariz (somente A-29 no modo mouse)
  const reticlesLayer = el('div', 'hud-reticles');
  const aimRing = el('div', 'hud-aim-ring');
  aimRing.hidden = true;
  const noseCross = el('div', 'hud-nose-cross');
  noseCross.hidden = true;
  reticlesLayer.append(aimRing, noseCross);

  // 1) TOPO CENTRAL — Relógio protagonista estilo flip-clock
  const clockWrap = el('div', 'hud-clock-wrap');
  const clockTag = el('div', 'hud-clock-tag', 'ATÉ O ALMOÇO');
  const flipBoard = el('div', 'hud-flip-board');
  const d0 = el('span', 'hud-flip-tile', '0');
  const d1 = el('span', 'hud-flip-tile', '6');
  const colon = el('span', 'hud-flip-colon', ':');
  const d2 = el('span', 'hud-flip-tile', '0');
  const d3 = el('span', 'hud-flip-tile', '0');
  flipBoard.append(d0, d1, colon, d2, d3);

  const clockMeta = el('div', 'hud-clock-meta');
  const scoreBadge = el('span', 'hud-score', '0 pts');
  const totalBadge = el('span', 'hud-total', '0/0');
  clockMeta.append(scoreBadge, totalBadge);
  clockWrap.append(clockTag, flipBoard, clockMeta);

  // Mensagem curta de despacho (avisos/bloqueios)
  const missionMsg = el('div', 'hud-mission-msg');
  missionMsg.hidden = true;

  // 2) CANTO SUPERIOR ESQUERDO — Etiqueta de entrega GoPostal (papel creme + faixa amarela + carimbo)
  const objPanel = el('div', 'hud-objective');
  objPanel.hidden = true;

  const objBand = el('div', 'hud-obj-band');
  const objBrand = el('span', 'hud-obj-brand', 'GOPOSTAL');
  const objOrder = el('span', 'hud-obj-order', '#01/16');
  objBand.append(objBrand, objOrder);

  const objBody = el('div', 'hud-obj-body');
  const objKicker = el('div', 'hud-obj-kicker');
  const objKickerLbl = el('span', '', 'Destinatário');
  const objStage = el('span', '', 'Etapa 1/4');
  objKicker.append(objKickerLbl, objStage);
  const objTarget = el('div', 'hud-obj-target', 'Aguardando despacho');

  const objFoot = el('div', 'hud-obj-foot');
  const objDist = el('span', 'hud-obj-dist', '');
  const objHint = el('span', 'hud-obj-hint', '');
  objHint.hidden = true;
  objFoot.append(objDist, objHint);
  objBody.append(objKicker, objTarget, objFoot);

  const objStub = el('div', 'hud-obj-stub');
  const objBarcode = el('div', 'hud-obj-barcode');
  const objCode = el('span', 'hud-obj-code', 'GP-JF-001');
  objStub.append(objBarcode, objCode);

  const objStamp = el('div', 'hud-obj-stamp', 'ENTREGUE');
  objStamp.hidden = true;

  const scorePop = el('div', 'hud-score-pop');
  scorePop.hidden = true;

  objPanel.append(objBand, objBody, objStub, objStamp, scorePop);

  // 3) CANTO INFERIOR DIREITO — Mostrador circular SVG (velocímetro / altímetro)
  const gaugeWrap = el('div', 'hud-gauge-wrap');
  const gaugeRow = el('div', 'hud-gauge-row');

  // Sub-mostrador aéreo (altitude + potência para heli / A-29)
  const airSub = el('div', 'hud-gauge-air-sub');
  airSub.hidden = true;
  const altRow = el('div', 'hud-air-row');
  const altVal = el('span', 'hud-air-val', '0 m');
  altRow.append(el('span', 'hud-air-lbl', 'ALT'), altVal);
  const thrRow = el('div', 'hud-air-row');
  const throttleVal = el('span', 'hud-air-val', '0%');
  thrRow.append(el('span', 'hud-air-lbl', 'POT'), throttleVal);
  airSub.append(altRow, thrRow);

  // Mostrador circular principal
  const dialBox = el('div', 'hud-dial-box');
  const dialSvg = svgEl('svg', { viewBox: '0 0 148 148', class: 'hud-dial-svg' });
  const dialBg = svgEl('circle', { cx: DIAL_CX, cy: DIAL_CY, r: 68, class: 'hud-dial-bg' });

  const fullArcPath = describeArc(DIAL_CX, DIAL_CY, DIAL_R, DIAL_START_DEG, DIAL_START_DEG + DIAL_SWEEP_DEG);
  const redlinePath = describeArc(
    DIAL_CX,
    DIAL_CY,
    DIAL_R,
    DIAL_START_DEG + DIAL_SWEEP_DEG * 0.78,
    DIAL_START_DEG + DIAL_SWEEP_DEG,
  );
  const arcTotalLen = (DIAL_SWEEP_DEG / 360) * (2 * Math.PI * DIAL_R);

  const dialTrack = svgEl('path', { d: fullArcPath, class: 'hud-dial-ring' });
  const dialRedline = svgEl('path', { d: redlinePath, class: 'hud-dial-redline' });
  const dialArc = svgEl('path', {
    d: fullArcPath,
    class: 'hud-dial-arc',
    'stroke-dasharray': arcTotalLen.toFixed(2),
    'stroke-dashoffset': arcTotalLen.toFixed(2),
  });

  // Marcações radiais do mostrador
  const ticksGroup = svgEl('g', {});
  const tickCount = 12;
  for (let i = 0; i <= tickCount; i++) {
    const frac = i / tickCount;
    const deg = DIAL_START_DEG + frac * DIAL_SWEEP_DEG;
    const rad = (deg * Math.PI) / 180;
    const isMajor = i % 2 === 0;
    const rOut = DIAL_R + 5;
    const rIn = DIAL_R - (isMajor ? 7 : 3);
    const line = svgEl('line', {
      x1: (DIAL_CX + rIn * Math.cos(rad)).toFixed(1),
      y1: (DIAL_CY + rIn * Math.sin(rad)).toFixed(1),
      x2: (DIAL_CX + rOut * Math.cos(rad)).toFixed(1),
      y2: (DIAL_CY + rOut * Math.sin(rad)).toFixed(1),
      class: frac >= 0.78 ? 'hud-dial-ticks-red' : 'hud-dial-ticks',
    });
    ticksGroup.append(line);
  }

  // Ponteiro fino na borda do arco (sem cobrir os números centrais)
  const needleGroup = svgEl('g', { transform: `rotate(${DIAL_START_DEG} ${DIAL_CX} ${DIAL_CY})` });
  const needleLine = svgEl('line', {
    x1: DIAL_CX + 38,
    y1: DIAL_CY,
    x2: DIAL_CX + DIAL_R + 6,
    y2: DIAL_CY,
    class: 'hud-dial-needle',
  });
  needleGroup.append(needleLine);

  dialSvg.append(dialBg, dialTrack, dialRedline, dialArc, ticksGroup, needleGroup);

  const dialReadout = el('div', 'hud-dial-readout');
  const dialSpeed = el('span', 'hud-dial-speed', '0');
  const dialUnit = el('span', 'hud-dial-unit', 'km/h');
  const dialGear = el('span', 'hud-dial-gear', 'N');
  dialReadout.append(dialSpeed, dialUnit, dialGear);

  dialBox.append(dialSvg, dialReadout);
  gaugeRow.append(airSub, dialBox);

  // Barra de nitro (exclusiva do Esportivo)
  const nitroWrap = el('div', 'hud-nitro-wrap');
  nitroWrap.hidden = true;
  const nitroHead = el('div', 'hud-nitro-head');
  const nitroVal = el('span', '', '100%');
  nitroHead.append(el('span', '', 'NITRO · SHIFT'), nitroVal);
  const nitroTrack = el('div', 'hud-nitro-track');
  const nitroFill = el('div', 'hud-nitro-fill');
  nitroTrack.append(nitroFill);
  nitroWrap.append(nitroHead, nitroTrack);

  // Chips mínimos só para A-29 (mouse/teclado e fumaça)
  const airChips = el('div', 'hud-air-chips');
  airChips.hidden = true;
  const controlBadge = el('span', 'hud-control');
  const smokeBadge = el('span', 'hud-smoke');
  airChips.append(controlBadge, smokeBadge);

  gaugeWrap.append(airChips, gaugeRow, nitroWrap);

  // Dica discreta de trava do mouse (canto inferior esquerdo, apenas quando relevante)
  const lockHint = el('div', 'hud-lock-hint', 'Clique para girar a câmera');
  lockHint.hidden = true;

  // 4) CANTO SUPERIOR DIREITO — Minimapa quadrado sem cartão translúcido
  const minimapWrap = el('div', 'hud-minimap');
  const minimapCanvas = document.createElement('canvas');
  minimapCanvas.className = 'hud-minimap-canvas';
  minimapCanvas.width = 176;
  minimapCanvas.height = 176;
  const minimapTag = el('div', 'hud-minimap-tag', 'JUIZ DE FORA');
  minimapWrap.append(minimapCanvas, minimapTag);
  const mapCtx = minimapCanvas.getContext('2d');

  // Aviso de proximidade para entrar em veículo (com keycap física)
  const nearbyPrompt = el('div', 'hud-nearby');
  nearbyPrompt.hidden = true;

  // Aviso central (estol / impacto)
  const alertBox = el('div', 'hud-alert');
  alertBox.hidden = true;

  // Selo e atalhos do Modo Apresentação
  const presBox = el('div', 'hud-pres-wrap');
  presBox.hidden = true;
  const presBadge = el('div', 'hud-pres-badge', 'MODO APRESENTAÇÃO');
  const presKeys = el('div', 'hud-pres-keys', 'F1 Carro · F2 Esportivo · F3 Heli · F4 A-29 · F5 Final · F6 +1h');
  presBox.append(presBadge, presKeys);

  // Vinheta vermelha a partir das 11:00 + contagem regressiva nos últimos 60 s antes de 12:00
  const urgentVignette = el('div', 'hud-urgent-vignette');
  urgentVignette.hidden = true;

  const countdownEl = el('div', 'hud-countdown');
  countdownEl.hidden = true;

  root.append(
    urgentVignette,
    reticlesLayer,
    clockWrap,
    countdownEl,
    missionMsg,
    objPanel,
    minimapWrap,
    gaugeWrap,
    lockHint,
    nearbyPrompt,
    alertBox,
    presBox,
  );
  ui.append(root);

  const canvas = (app.graphicsDevice as { canvas?: HTMLCanvasElement } | undefined)?.canvas ?? null;
  const camPos = new Vec3();
  const camRot = new Quat();
  const camFwd = new Vec3();
  const planeRot = new Quat();
  const noseDir = new Vec3();
  const worldPt = new Vec3();
  const delta = new Vec3();
  const screenPt = new Vec3();
  const blips: MinimapBlip[] = [];

  const aimCache: MarkerCache = { visible: false, x: Number.NaN, y: Number.NaN };
  const noseCache: MarkerCache = { visible: false, x: Number.NaN, y: Number.NaN };

  let lastDialSpeed = Number.NaN;
  let lastDialGear = '';
  let lastDialRatio = Number.NaN;
  let lastDialHot: boolean | null = null;
  let lastAltM = Number.NaN;
  let lastThrottlePct = Number.NaN;
  let lastNitroPct = Number.NaN;
  let lastNitroHot: boolean | null = null;
  let lastVehicle: VehicleKind | null = null;
  let lastControl: FlightState['controlMode'] | null = null;
  let lastLocked: boolean | null = null;
  let lastSmoke: boolean | null = null;
  let lastCockpit: boolean | null = null;
  let lastHudVisible: boolean | null = null;
  let lastPresVisible: boolean | null = null;
  let lastNearbyKey = '';
  let lastAlert: AlertState = 'none';
  let lastClockKey = '';
  let lastClockUrgent: boolean | null = null;
  let lastVignetteOpacity = -1;
  let lastCountdownSec = -1;
  let scorePopTimer = 0;
  let stampTimer = 0;
  let lastScore = Number.NaN;
  let lastDelivered = Number.NaN;
  let lastTotalKey = '';
  let lastObjKey = '';
  let lastMsgKey = '';
  let minimapFrame = 0;
  let animPhase = 0;
  let localNitro = 1;
  let nitroExhausted = false;

  function setDialArc(ratio: number, hot: boolean) {
    const clamped = Math.max(0, Math.min(1, ratio));
    const quantized = Math.round(clamped * 200) / 200;
    if (quantized !== lastDialRatio) {
      lastDialRatio = quantized;
      const offset = arcTotalLen * (1 - quantized);
      dialArc.setAttribute('stroke-dashoffset', offset.toFixed(2));
      const angle = DIAL_START_DEG + quantized * DIAL_SWEEP_DEG;
      needleGroup.setAttribute('transform', `rotate(${angle.toFixed(1)} ${DIAL_CX} ${DIAL_CY})`);
    }
    if (hot !== lastDialHot) {
      lastDialHot = hot;
      dialArc.classList.toggle('hud-dial-arc--hot', hot);
    }
  }

  function findNextDelivery(mission: MissionState): {
    activeStage: Stage;
    stageDeliveries: DeliveryPoint[];
    pendingStage: DeliveryPoint[];
    doneInStage: number;
    next: DeliveryPoint | null;
  } {
    const activeStage: Stage = mission.carrying ?? mission.stage;
    const stageDeliveries: DeliveryPoint[] = [];
    const allPending: DeliveryPoint[] = [];
    let next: DeliveryPoint | null = null;

    for (let i = 0; i < mission.deliveries.length; i++) {
      const d = mission.deliveries[i];
      if (d.stage === activeStage) {
        stageDeliveries.push(d);
        if (!d.delivered) allPending.push(d);
      }
      if (mission.nextDeliveryId && d.id === mission.nextDeliveryId && !d.delivered) {
        next = d;
      }
    }

    const pendingStage =
      allPending.length > 1 ? allPending.filter((p) => !p.leadsToNext && p.id !== 'a29-4') : allPending;

    if (!next && pendingStage.length > 0) {
      let bestSq = Infinity;
      for (let i = 0; i < pendingStage.length; i++) {
        const d = pendingStage[i];
        const dSq = (d.x - state.x) ** 2 + (d.z - state.z) ** 2;
        if (dSq < bestSq) {
          bestSq = dSq;
          next = d;
        }
      }
    }

    return { activeStage, stageDeliveries, pendingStage, doneInStage: stageDeliveries.length - allPending.length, next };
  }

  function findNextVehicleCoords(mission: MissionState): { stage: Stage; x: number; z: number } | null {
    const idx = STAGE_ORDER.indexOf(mission.stage);
    if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null;
    const nextStage = STAGE_ORDER[idx + 1];

    for (let i = 0; i < blips.length; i++) {
      if (blips[i].kind === nextStage) {
        return { stage: nextStage, x: blips[i].x, z: blips[i].z };
      }
    }
    for (let i = 0; i < mission.deliveries.length; i++) {
      const d = mission.deliveries[i];
      if (d.stage === mission.stage && d.leadsToNext) {
        return { stage: nextStage, x: d.x, z: d.z };
      }
    }
    if (nextStage === 'tuned' && blueprint) return { stage: nextStage, x: blueprint.workshop.x, z: blueprint.workshop.z };
    if (nextStage === 'heli' && blueprint) return { stage: nextStage, x: blueprint.helipad.x, z: blueprint.helipad.z };
    if (nextStage === 'a29') {
      return blueprint
        ? { stage: nextStage, x: blueprint.runwayCenter.x, z: blueprint.runwayCenter.z }
        : { stage: nextStage, x: AIRPORT.x, z: AIRPORT.z };
    }
    return null;
  }

  function worldToRotatedMap(
    wx: number,
    wz: number,
    scale: number,
    cosH: number,
    sinH: number,
    half: number,
  ): { x: number; y: number } {
    const dx = (wx - state.x) * scale;
    const dz = (wz - state.z) * scale;
    const rx = dx * cosH + dz * sinH;
    const ry = -dx * sinH + dz * cosH;
    return { x: half + rx, y: half + ry };
  }

  function clampToMap(x: number, y: number, size: number, pad: number): { x: number; y: number; clamped: boolean } {
    const half = size * 0.5;
    const dx = x - half;
    const dy = y - half;
    const maxR = half - pad;
    if (Math.abs(dx) <= maxR && Math.abs(dy) <= maxR) {
      return { x, y, clamped: false };
    }
    const s = Math.max(Math.abs(dx) / maxR, Math.abs(dy) / maxR, 1e-4);
    return { x: half + dx / s, y: half + dy / s, clamped: true };
  }

  function drawMinimap() {
    if (!mapCtx) return;
    const size = 176;
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    const targetPx = Math.round(size * dpr);
    if (minimapCanvas.width !== targetPx || minimapCanvas.height !== targetPx) {
      minimapCanvas.width = targetPx;
      minimapCanvas.height = targetPx;
    }

    mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const half = size * 0.5;
    const range =
      state.vehicle === 'foot'
        ? 360
        : state.vehicle === 'car'
          ? 480
          : state.vehicle === 'tuned'
            ? 620
            : 1220;
    const scale = half / range;
    const hRad = (state.heading * Math.PI) / 180;
    const cosH = Math.cos(hRad);
    const sinH = Math.sin(hRad);

    mapCtx.fillStyle = '#191a16';
    mapCtx.fillRect(0, 0, size, size);

    // 1) Planta pré-renderizada de Juiz de Fora
    if (blueprint) {
      mapCtx.save();
      mapCtx.translate(half, half);
      mapCtx.rotate(-hRad);
      const drawW = blueprint.spanX * scale;
      const drawH = blueprint.spanZ * scale;
      const ox = -(state.x - blueprint.minX) * scale;
      const oz = -(state.z - blueprint.minZ) * scale;
      mapCtx.drawImage(blueprint.canvas, ox, oz, drawW, drawH);
      mapCtx.restore();

      const uniPulse = 0.5 + 0.5 * Math.sin(animPhase * 4.2);
      mapCtx.save();
      mapCtx.textAlign = 'center';
      mapCtx.textBaseline = 'bottom';
      mapCtx.lineJoin = 'round';
      for (let i = 0; i < blueprint.landmarks.length; i++) {
        const lm = blueprint.landmarks[i];
        const p = worldToRotatedMap(lm.x, lm.z, scale, cosH, sinH, half);
        if (p.x < 10 || p.x > size - 10 || p.y < 14 || p.y > size - 14) continue;

        if (lm.highlight) {
          mapCtx.beginPath();
          mapCtx.arc(p.x, p.y, 4.8 + uniPulse * 2.0, 0, Math.PI * 2);
          mapCtx.strokeStyle = 'rgba(242, 194, 26, 0.9)';
          mapCtx.lineWidth = 1.4;
          mapCtx.stroke();

          mapCtx.save();
          mapCtx.translate(p.x, p.y);
          mapCtx.rotate(Math.PI / 4);
          mapCtx.fillStyle = '#f2c21a';
          mapCtx.strokeStyle = '#171512';
          mapCtx.lineWidth = 1.1;
          mapCtx.fillRect(-3.4, -3.4, 6.8, 6.8);
          mapCtx.strokeRect(-3.4, -3.4, 6.8, 6.8);
          mapCtx.restore();

          mapCtx.font = '700 8.5px "Segoe UI", sans-serif';
          mapCtx.strokeStyle = 'rgba(14, 13, 11, 0.95)';
          mapCtx.lineWidth = 2.8;
          mapCtx.strokeText(lm.name, p.x, p.y - 6);
          mapCtx.fillStyle = '#f2c21a';
          mapCtx.fillText(lm.name, p.x, p.y - 6);
        } else {
          mapCtx.beginPath();
          mapCtx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
          mapCtx.fillStyle = '#e9dfc8';
          mapCtx.fill();
          mapCtx.strokeStyle = '#171512';
          mapCtx.lineWidth = 0.8;
          mapCtx.stroke();

          mapCtx.font = '700 7.5px "Segoe UI", sans-serif';
          mapCtx.strokeStyle = 'rgba(14, 13, 11, 0.9)';
          mapCtx.lineWidth = 2.4;
          mapCtx.strokeText(lm.name, p.x, p.y - 4);
          mapCtx.fillStyle = 'rgba(246, 240, 225, 0.9)';
          mapCtx.fillText(lm.name, p.x, p.y - 4);
        }
      }
      mapCtx.restore();
    }

    // 2) Veículos na cena
    for (let i = 0; i < blips.length; i++) {
      const b = blips[i];
      if (Math.hypot(b.x - state.x, b.z - state.z) < 4) continue;
      const p = worldToRotatedMap(b.x, b.z, scale, cosH, sinH, half);
      if (p.x < 4 || p.x > size - 4 || p.y < 4 || p.y > size - 4) continue;
      mapCtx.fillStyle = b.kind === 'car' ? '#d4c39f' : '#f7f3e8';
      mapCtx.beginPath();
      mapCtx.arc(p.x, p.y, b.kind === 'car' ? 2.6 : 3.4, 0, Math.PI * 2);
      mapCtx.fill();
      mapCtx.strokeStyle = '#171512';
      mapCtx.lineWidth = 1;
      mapCtx.stroke();
    }

    // 3) Rota de GPS e entregas pendentes na paleta GoPostal
    const mission = ctx.mission;
    if (mission && mission.status === 'playing') {
      const { pendingStage, next } = findNextDelivery(mission);
      const pulse = 0.5 + 0.5 * Math.sin(animPhase * 5.0);

      const nextVeh = findNextVehicleCoords(mission);
      if (nextVeh) {
        const raw = worldToRotatedMap(nextVeh.x, nextVeh.z, scale, cosH, sinH, half);
        const pt = clampToMap(raw.x, raw.y, size, 12);
        mapCtx.save();
        mapCtx.fillStyle = '#d93025';
        mapCtx.strokeStyle = '#171512';
        mapCtx.lineWidth = 1.5;
        mapCtx.fillRect(pt.x - 6, pt.y - 6, 12, 12);
        mapCtx.strokeRect(pt.x - 6, pt.y - 6, 12, 12);
        mapCtx.fillStyle = '#f7f3e8';
        mapCtx.font = '700 8.5px "Segoe UI", sans-serif';
        mapCtx.textAlign = 'center';
        mapCtx.textBaseline = 'middle';
        mapCtx.fillText(STAGE_SHORT_CODE[nextVeh.stage], pt.x, pt.y + 0.5);
        mapCtx.restore();
      }

      for (let i = 0; i < pendingStage.length; i++) {
        const d = pendingStage[i];
        if (next && d.id === next.id) continue;
        const raw = worldToRotatedMap(d.x, d.z, scale, cosH, sinH, half);
        const pt = clampToMap(raw.x, raw.y, size, 8);
        mapCtx.save();
        mapCtx.translate(pt.x, pt.y);
        mapCtx.rotate(Math.PI / 4);
        mapCtx.fillStyle = d.leadsToNext ? '#d93025' : '#f6f0e1';
        mapCtx.fillRect(-3.1, -3.1, 6.2, 6.2);
        mapCtx.strokeStyle = '#171512';
        mapCtx.lineWidth = 1;
        mapCtx.strokeRect(-3.1, -3.1, 6.2, 6.2);
        mapCtx.restore();
      }

      if (next) {
        const route = getActiveRoute(state);
        if (route && route.points.length >= 2) {
          const routeColor = next.leadsToNext ? '#d93025' : '#f2c21a';
          mapCtx.save();
          mapCtx.lineCap = 'round';
          mapCtx.lineJoin = 'round';
          mapCtx.beginPath();
          for (let i = 0; i < route.points.length; i++) {
            const p = worldToRotatedMap(route.points[i].x, route.points[i].z, scale, cosH, sinH, half);
            if (i === 0) mapCtx.moveTo(p.x, p.y);
            else mapCtx.lineTo(p.x, p.y);
          }
          mapCtx.strokeStyle = 'rgba(14, 13, 11, 0.92)';
          mapCtx.lineWidth = 5.4;
          mapCtx.stroke();
          mapCtx.strokeStyle = routeColor;
          mapCtx.lineWidth = 3.2;
          mapCtx.stroke();

          if (route.finalLegDistance > 2) {
            const lastPt = route.points[route.points.length - 1];
            const pA = worldToRotatedMap(lastPt.x, lastPt.z, scale, cosH, sinH, half);
            const pB = worldToRotatedMap(route.target.x, route.target.z, scale, cosH, sinH, half);
            mapCtx.setLineDash([4, 3]);
            mapCtx.beginPath();
            mapCtx.moveTo(pA.x, pA.y);
            mapCtx.lineTo(pB.x, pB.y);
            mapCtx.strokeStyle = routeColor;
            mapCtx.lineWidth = 2.2;
            mapCtx.stroke();
            mapCtx.setLineDash([]);
          }
          mapCtx.restore();
        }

        const raw = worldToRotatedMap(next.x, next.z, scale, cosH, sinH, half);
        const pt = clampToMap(raw.x, raw.y, size, 10);
        const haloR = 6 + pulse * 3.2;
        mapCtx.beginPath();
        mapCtx.arc(pt.x, pt.y, haloR, 0, Math.PI * 2);
        mapCtx.strokeStyle = next.airDrop ? '#d93025' : '#f2c21a';
        mapCtx.lineWidth = 1.9;
        mapCtx.stroke();

        mapCtx.beginPath();
        mapCtx.arc(pt.x, pt.y, pt.clamped ? 4.4 : 4.8, 0, Math.PI * 2);
        mapCtx.fillStyle = next.airDrop ? '#d93025' : '#f2c21a';
        mapCtx.fill();
        mapCtx.strokeStyle = '#171512';
        mapCtx.lineWidth = 1.3;
        mapCtx.stroke();
      }
    }

    // 4) Seta do jogador centralizada
    mapCtx.save();
    mapCtx.translate(half, half);
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7.2);
    mapCtx.lineTo(5.0, 5.2);
    mapCtx.lineTo(0, 2.4);
    mapCtx.lineTo(-5.0, 5.2);
    mapCtx.closePath();
    mapCtx.fillStyle = '#f7f3e8';
    mapCtx.fill();
    mapCtx.strokeStyle = '#171512';
    mapCtx.lineWidth = 1.3;
    mapCtx.stroke();
    mapCtx.restore();

    // 5) Indicador Norte
    const northRawX = half - sinH * (half - 11);
    const northRawY = half - cosH * (half - 11);
    const northPt = clampToMap(northRawX, northRawY, size, 10);
    mapCtx.beginPath();
    mapCtx.arc(northPt.x, northPt.y, 7.5, 0, Math.PI * 2);
    mapCtx.fillStyle = '#161513';
    mapCtx.fill();
    mapCtx.strokeStyle = '#f2c21a';
    mapCtx.lineWidth = 1.2;
    mapCtx.stroke();
    mapCtx.fillStyle = '#f2c21a';
    mapCtx.font = '700 9px "Segoe UI", sans-serif';
    mapCtx.textAlign = 'center';
    mapCtx.textBaseline = 'middle';
    mapCtx.fillText('N', northPt.x, northPt.y + 0.5);
  }

  function updateMarker(
    active: boolean,
    wx: number,
    wy: number,
    wz: number,
    cw: number,
    ch: number,
    node: HTMLElement,
    cache: MarkerCache,
  ) {
    const cam = camera.camera;
    let visible = false;
    let sx = 0;
    let sy = 0;

    if (active && cam && cw > 0 && ch > 0) {
      worldPt.set(wx, wy, wz);
      delta.sub2(worldPt, camPos);
      if (delta.dot(camFwd) > 0) {
        cam.worldToScreen(worldPt, screenPt, cw, ch);
        if (
          Number.isFinite(screenPt.x) &&
          Number.isFinite(screenPt.y) &&
          screenPt.x >= 0 &&
          screenPt.x <= cw &&
          screenPt.y >= 0 &&
          screenPt.y <= ch
        ) {
          visible = true;
          sx = Math.round(screenPt.x * 2) / 2;
          sy = Math.round(screenPt.y * 2) / 2;
        }
      }
    }

    if (visible !== cache.visible) {
      cache.visible = visible;
      node.hidden = !visible;
    }
    if (visible && (sx !== cache.x || sy !== cache.y)) {
      cache.x = sx;
      cache.y = sy;
      node.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`;
    }
  }

  function updateNitro(dt: number, playing: boolean): { ratio: number; active: boolean } {
    if (state.vehicle !== 'tuned') {
      nitroActiveByState.set(state, false);
      return { ratio: localNitro, active: false };
    }

    const external = readExternalNitro(state);
    const shiftHeld = playing && Boolean(app.keyboard?.isPressed(KEY_SHIFT));
    const forwardHeld = playing && (Boolean(app.keyboard?.isPressed(KEY_W)) || state.throttle > 0.1 || Math.abs(state.speed) > 4);

    if (external !== null) {
      const active = shiftHeld && external > 0.02 && forwardHeld;
      nitroActiveByState.set(state, active);
      return { ratio: external, active };
    }

    if (playing && dt > 0) {
      if (shiftHeld && forwardHeld && !nitroExhausted && localNitro > 0.01) {
        localNitro = Math.max(0, localNitro - dt * 0.34);
        if (localNitro <= 0.01) nitroExhausted = true;
      } else {
        localNitro = Math.min(1, localNitro + dt * 0.16);
        if (localNitro >= 0.25) nitroExhausted = false;
      }
    }
    const active = shiftHeld && forwardHeld && !nitroExhausted && localNitro > 0.01;
    nitroActiveByState.set(state, active);
    return { ratio: localNitro, active };
  }

  function triggerStampAndScore(gain: number) {
    objStamp.hidden = false;
    stampTimer = 1.25;
    objStamp.classList.remove('hud-obj-stamp--slam');
    void objStamp.offsetWidth;
    objStamp.classList.add('hud-obj-stamp--slam');

    if (gain > 0) {
      scorePop.textContent = `+${gain}`;
      scorePop.hidden = false;
      scorePopTimer = 1.25;
      scorePop.classList.remove('hud-score-pop--show');
      void scorePop.offsetWidth;
      scorePop.classList.add('hud-score-pop--show');
    }
  }

  function sync(dt: number) {
    const rt = getRuntime(state);
    const hudVisible = rt.mode !== 'title' && rt.mode !== 'ended' && rt.settings.showHud;
    if (hudVisible !== lastHudVisible) {
      lastHudVisible = hudVisible;
      root.hidden = !hudVisible;
    }
    const presVisible = hudVisible && rt.presentationMode;
    if (presVisible !== lastPresVisible) {
      lastPresVisible = presVisible;
      presBox.hidden = !presVisible;
    }
    if (!hudVisible) {
      nitroActiveByState.set(state, false);
      return;
    }

    if (rt.mode === 'playing' && Number.isFinite(dt) && dt > 0) {
      animPhase = (animPhase + dt) % (Math.PI * 200);
    }

    const vehicle = state.vehicle;
    const isCar = vehicle === 'car' || vehicle === 'tuned';
    const isAircraft = vehicle === 'a29' || vehicle === 'heli';
    const isCockpit = isAircraft && state.camera === 'cockpit';
    const vehicleSwitched = vehicle !== lastVehicle || isCockpit !== lastCockpit;

    if (vehicleSwitched) {
      lastVehicle = vehicle;
      lastCockpit = isCockpit;

      gaugeWrap.hidden = vehicle === 'foot' || isCockpit;
      airSub.hidden = !isAircraft || isCockpit;
      dialGear.hidden = !isCar;
      nitroWrap.hidden = vehicle !== 'tuned';
      airChips.hidden = vehicle !== 'a29';
      controlBadge.hidden = vehicle !== 'a29';
      smokeBadge.hidden = vehicle !== 'a29';
      reticlesLayer.classList.toggle('hud-reticles--cockpit', isCockpit);
      lastDialRatio = Number.NaN;
    }

    const locked = typeof document !== 'undefined' && canvas !== null && document.pointerLockElement === canvas;
    if (state.controlMode !== lastControl || locked !== lastLocked || vehicleSwitched) {
      lastControl = state.controlMode;
      lastLocked = locked;
      const isMouse = state.controlMode === 'mouse';
      controlBadge.textContent = isMouse ? 'MOUSE' : 'TECLADO';
      controlBadge.className = `hud-control ${isMouse ? 'hud-control--mouse' : 'hud-control--keyboard'}`;
      if (vehicle === 'foot' || vehicle === 'heli') {
        lockHint.textContent = 'Clique para girar a câmera';
        lockHint.hidden = locked || rt.mode !== 'playing';
      } else if (vehicle === 'a29') {
        lockHint.textContent = 'Clique na tela para mirar';
        lockHint.hidden = !isMouse || locked || rt.mode !== 'playing';
      } else {
        lockHint.hidden = true;
      }
      aimRing.classList.toggle('hud-aim-ring--unlocked', isMouse && !locked);
    }

    if (vehicle === 'a29') {
      const smokeOn = isSmokeActive(state);
      if (smokeOn !== lastSmoke) {
        lastSmoke = smokeOn;
        smokeBadge.textContent = smokeOn ? 'FUMAÇA' : 'SEM FUMAÇA';
        smokeBadge.className = `hud-smoke ${smokeOn ? 'hud-smoke--on' : 'hud-smoke--off'}`;
      }
    }

    // Relógio flip-clock, etiqueta de entrega, carimbo ENTREGUE e contagem final
    const mission = ctx.mission;
    if (mission) {
      const [h0, h1, m0, m1] = formatClockDigits(mission.clockMinutes);
      const clockKey = `${h0}${h1}${m0}${m1}`;
      if (clockKey !== lastClockKey) {
        lastClockKey = clockKey;
        d0.textContent = h0;
        d1.textContent = h1;
        d2.textContent = m0;
        d3.textContent = m1;
      }
      const urgent = mission.status === 'playing' && mission.clockMinutes >= 11 * 60;
      if (urgent !== lastClockUrgent) {
        lastClockUrgent = urgent;
        clockWrap.classList.toggle('hud-clock--urgent', urgent);
        clockTag.textContent = urgent ? 'CORRE · QUASE MEIO-DIA' : 'ATÉ O ALMOÇO';
      }

      const isFinalHour = rt.mode === 'playing' && mission.status === 'playing' && mission.clockMinutes >= 11 * 60;
      if (isFinalHour) {
        const hourProg = Math.max(0, Math.min(1, (mission.clockMinutes - 11 * 60) / 60));
        const pulse = rt.settings.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(animPhase * (4.2 + hourProg * 4.8));
        const vOp = Math.round((0.18 + hourProg * 0.42 + pulse * 0.22) * 20) / 20;
        if (vOp !== lastVignetteOpacity) {
          lastVignetteOpacity = vOp;
          urgentVignette.hidden = false;
          urgentVignette.style.opacity = vOp.toFixed(2);
        }
        const remRealSec = Math.ceil(((720 - mission.clockMinutes) / 360) * rt.effectiveDaySeconds);
        const showCd = remRealSec >= 1 && remRealSec <= 60;
        const cdVal = showCd ? remRealSec : 0;
        if (cdVal !== lastCountdownSec) {
          lastCountdownSec = cdVal;
          countdownEl.hidden = !showCd;
          if (showCd) {
            countdownEl.textContent = String(cdVal);
            countdownEl.classList.remove('hud-countdown--pop');
            void countdownEl.offsetWidth;
            countdownEl.classList.add('hud-countdown--pop');
          }
        }
      } else {
        if (lastVignetteOpacity !== 0) {
          lastVignetteOpacity = 0;
          urgentVignette.hidden = true;
        }
        if (lastCountdownSec !== 0) {
          lastCountdownSec = 0;
          countdownEl.hidden = true;
        }
      }

      const prevDel = lastDelivered;
      const deliveredIncreased = Number.isFinite(prevDel) && mission.delivered > prevDel;
      lastDelivered = mission.delivered;

      if (mission.score !== lastScore || deliveredIncreased) {
        const gain = Number.isFinite(lastScore) ? Math.max(0, mission.score - lastScore) : 0;
        lastScore = mission.score;
        scoreBadge.textContent = `${mission.score.toLocaleString('pt-BR')} pts`;
        if ((gain > 0 || deliveredIncreased) && rt.mode === 'playing') {
          triggerStampAndScore(gain);
        }
      }

      if (scorePopTimer > 0 && Number.isFinite(dt) && dt > 0) {
        scorePopTimer = Math.max(0, scorePopTimer - dt);
        if (scorePopTimer <= 0) scorePop.hidden = true;
      }
      if (stampTimer > 0 && Number.isFinite(dt) && dt > 0) {
        stampTimer = Math.max(0, stampTimer - dt);
        if (stampTimer <= 0) objStamp.hidden = true;
      }

      const totalKey = `${mission.delivered}/${mission.total}`;
      if (totalKey !== lastTotalKey) {
        lastTotalKey = totalKey;
        totalBadge.textContent = mission.total > 0 ? `${totalKey} entregas` : 'Turno ativo';
      }

      // Etiqueta de entrega GoPostal
      const { activeStage, stageDeliveries, doneInStage, next } = findNextDelivery(mission);
      let kickerText = 'Destinatário';
      let targetText = 'Aguardando despacho';
      let distText = '';
      let hintText = '';
      let orderText = mission.total > 0 ? `#${String(Math.min(mission.total, mission.delivered + 1)).padStart(2, '0')}/${mission.total}` : '#01';
      let codeText = `GP-JF-${String(Math.min(999, (mission.delivered + 1) * 17 + 100))}`;

      if (mission.deliveries.length > 0) {
        const idxInStage = Math.min(stageDeliveries.length, doneInStage + 1);
        if (next) {
          kickerText = `Entrega ${idxInStage}/${Math.max(1, stageDeliveries.length)}`;
          targetText = next.name;
          const route = getActiveRoute(state);
          const dist =
            route && route.deliveryId === next.id
              ? route.distance
              : Math.hypot(next.x - state.x, next.z - state.z);
          distText = formatDistance(dist);
          if (next.airDrop) hintText = 'Espaço · Lançar';
          else if (next.leadsToNext) hintText = 'Próx. veículo';
          codeText = `GP-${next.id.toUpperCase()}`;
        } else if (mission.carrying === null) {
          kickerText = 'Retirada';
          targetText = `Pegue o ${NEARBY_LABEL[mission.stage]}`;
          const vehCoords = findNextVehicleCoords(mission);
          if (vehCoords) distText = formatDistance(Math.hypot(vehCoords.x - state.x, vehCoords.z - state.z));
          orderText = STAGE_INDEX_LABEL[mission.stage];
        }
      }

      const objKey = `${mission.status}|${activeStage}|${kickerText}|${targetText}|${distText}|${hintText}|${orderText}|${codeText}`;
      if (objKey !== lastObjKey) {
        lastObjKey = objKey;
        objPanel.hidden = mission.status !== 'playing';
        objOrder.textContent = orderText;
        objKickerLbl.textContent = kickerText;
        objStage.textContent = STAGE_INDEX_LABEL[activeStage];
        objTarget.textContent = targetText;
        objDist.textContent = distText;
        objHint.textContent = hintText;
        objHint.hidden = !hintText;
        objCode.textContent = codeText;
      }

      // Mensagens da missão (tira redundância do "+pts" já que o carimbo e o +pts saem da etiqueta)
      const showMsg = Boolean(mission.message && mission.messageTimer > 0);
      const msgKey = showMsg ? `${mission.message}` : '';
      if (msgKey !== lastMsgKey) {
        lastMsgKey = msgKey;
        missionMsg.hidden = !showMsg;
        if (showMsg && mission.message) {
          missionMsg.textContent = mission.message.replace(/\s*\+\d+\s*(pts?)?$/i, '');
          const isWarn = /bloquead|trancad|termine as entregas|cuidado|falta|meio-dia|almo[cç]o|errado/i.test(mission.message);
          missionMsg.className = `hud-mission-msg ${isWarn ? 'hud-mission-msg--warn' : 'hud-mission-msg--ok'}`;
        }
      }
    }

    // Mostrador circular (carros + aeronaves)
    const nitroInfo = updateNitro(dt, rt.mode === 'playing');
    if (isCar) {
      const kmh = Math.round(Math.abs(state.speed) * 3.6);
      if (kmh !== lastDialSpeed) {
        lastDialSpeed = kmh;
        dialSpeed.textContent = String(kmh);
      }
      const { label, rpmRatio } = estimateCarGear(state.speed, state.throttle, vehicle === 'tuned');
      if (label !== lastDialGear) {
        lastDialGear = label;
        dialGear.textContent = label;
      }
      setDialArc(rpmRatio, rpmRatio >= 0.82);

      if (vehicle === 'tuned') {
        const nitroPct = Math.round(nitroInfo.ratio * 100);
        if (nitroPct !== lastNitroPct) {
          lastNitroPct = nitroPct;
          nitroVal.textContent = `${nitroPct}%`;
          nitroFill.style.transform = `scaleX(${(nitroPct / 100).toFixed(3)})`;
        }
        if (nitroInfo.active !== lastNitroHot) {
          lastNitroHot = nitroInfo.active;
          nitroWrap.classList.toggle('hud-nitro-wrap--active', nitroInfo.active);
        }
      }
    } else if (isAircraft && !isCockpit) {
      const speedKmh = Math.round(Math.abs(state.speed) * 3.6);
      if (speedKmh !== lastDialSpeed) {
        lastDialSpeed = speedKmh;
        dialSpeed.textContent = String(speedKmh);
      }
      const altM = Math.round(state.altitude);
      if (altM !== lastAltM) {
        lastAltM = altM;
        altVal.textContent = `${altM} m`;
      }
      const thrRatio = Math.max(0, Math.min(1, state.throttle));
      const throttlePct = Math.round(thrRatio * 100);
      if (throttlePct !== lastThrottlePct) {
        lastThrottlePct = throttlePct;
        throttleVal.textContent = `${throttlePct}%`;
      }
      setDialArc(thrRatio, state.stall);
    }

    // Aviso de veículo próximo com keycap física E
    const nearbyKind = state.nearbyVehicleKind;
    const nearbyLocked = nearbyKind ? isStageLocked(nearbyKind, mission) : false;
    const nearbyKey =
      rt.mode === 'playing' && state.nearbyVehicleId && nearbyKind
        ? `${state.nearbyVehicleId}:${nearbyKind}:${nearbyLocked ? 'lock' : 'ok'}`
        : '';
    if (nearbyKey !== lastNearbyKey) {
      lastNearbyKey = nearbyKey;
      if (!nearbyKey || !nearbyKind) {
        nearbyPrompt.hidden = true;
      } else if (nearbyLocked) {
        nearbyPrompt.textContent = `Bloqueado — conclua a etapa atual para liberar o ${NEARBY_LABEL[nearbyKind]}`;
        nearbyPrompt.className = 'hud-nearby hud-nearby--locked';
        nearbyPrompt.hidden = false;
      } else {
        nearbyPrompt.textContent = '';
        nearbyPrompt.append(el('kbd', 'gp-keycap', 'E'), document.createTextNode(`Entrar no ${NEARBY_LABEL[nearbyKind]}`));
        nearbyPrompt.className = 'hud-nearby';
        nearbyPrompt.hidden = false;
      }
    }

    // Miras de voo (apenas A-29 no modo mouse)
    const showReticles = rt.mode === 'playing' && vehicle === 'a29' && state.controlMode === 'mouse' && !state.crashed;
    const cw = canvas?.clientWidth || root.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 0);
    const ch = canvas?.clientHeight || root.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 0);
    if (showReticles) {
      camera.camera?.onAppPrerender?.();
      camPos.copy(camera.getPosition());
      camRot.copy(camera.getRotation());
      camRot.transformVector(Vec3.FORWARD, camFwd);
      planeRot.copy(plane.root.getRotation());
      planeRot.transformVector(Vec3.FORWARD, noseDir);
    }

    updateMarker(
      showReticles,
      state.x + state.aimX * PROJECTION_DIST,
      state.y + state.aimY * PROJECTION_DIST,
      state.z + state.aimZ * PROJECTION_DIST,
      cw,
      ch,
      aimRing,
      aimCache,
    );
    updateMarker(
      showReticles,
      state.x + noseDir.x * PROJECTION_DIST,
      state.y + noseDir.y * PROJECTION_DIST,
      state.z + noseDir.z * PROJECTION_DIST,
      cw,
      ch,
      noseCross,
      noseCache,
    );

    const alert: AlertState = state.crashed ? 'crashed' : isAircraft && state.stall ? 'stall' : 'none';
    if (alert !== lastAlert) {
      lastAlert = alert;
      if (alert === 'none') {
        alertBox.hidden = true;
        alertBox.className = 'hud-alert';
        alertBox.textContent = '';
      } else if (alert === 'crashed') {
        alertBox.hidden = false;
        alertBox.className = 'hud-alert hud-alert--crashed';
        alertBox.textContent = 'BATEU — REINICIANDO';
      } else {
        alertBox.hidden = false;
        alertBox.className = 'hud-alert hud-alert--stall';
        alertBox.textContent = 'ESTOL';
      }
    }

    // Redesenha o minimapa a cada N quadros (mantém fluidez e economiza CPU)
    if (minimapFrame % 12 === 0) {
      scanSceneVehicles(app.root, blips);
    }
    if (minimapFrame % MINIMAP_REDRAW_INTERVAL === 0 || vehicleSwitched) {
      drawMinimap();
    }
    minimapFrame++;
  }

  sync(0);

  return {
    update(dt: number) {
      sync(dt);
    },
    destroy() {
      nitroActiveByState.delete(state);
      root.remove();
    },
  };
}
