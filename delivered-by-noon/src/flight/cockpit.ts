import { isSmokeActive } from './smoke';
import type { FlightContext, FlightModule } from './types';
import { getRuntime } from './ui/settings';

const DEG_TO_RAD = Math.PI / 180;

const C_PANEL_BG = '#0f272b';
const C_PANEL_LINE = '#1d444a';
const C_DIAL_FACE = '#0a191c';
const C_DIAL_RING = '#274f56';
const C_DIAL_BEZEL = '#183338';
const C_TEXT = '#e7f2f2';
const C_MUTED = '#7ea6ab';
const C_AMBER = '#ff9e4a';
const C_TEAL = '#3dd6bd';
const C_CORAL = '#eb5e4b';

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}

function drawDialFrame(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  title: string,
  unit: string,
) {
  // Aro externo chanfrado
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.fillStyle = C_DIAL_BEZEL;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = C_DIAL_RING;
  ctx.stroke();

  // Parafusos decorativos nos cantos do alojamento
  const boltOffset = r * 0.88;
  ctx.fillStyle = '#204248';
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * boltOffset, cy + Math.sin(a) * boltOffset, Math.max(1.5, r * 0.03), 0, Math.PI * 2);
    ctx.fill();
  }

  // Mostrador interno
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
  ctx.fillStyle = C_DIAL_FACE;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#142f34';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C_MUTED;
  ctx.font = `600 ${Math.max(8, r * 0.14)}px system-ui, sans-serif`;
  ctx.fillText(title, cx, cy - r * 0.34);

  if (unit) {
    ctx.font = `500 ${Math.max(7, r * 0.11)}px system-ui, sans-serif`;
    ctx.fillText(unit, cx, cy + r * 0.25);
  }
}

function drawNeedle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  length: number,
  tail: number,
  width: number,
  color: string,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-tail, -width * 0.55);
  ctx.lineTo(length, 0);
  ctx.lineTo(-tail, width * 0.55);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawCenterCap(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(3.5, r * 0.085), 0, Math.PI * 2);
  ctx.fillStyle = '#294c52';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#608990';
  ctx.stroke();
}

function drawReadoutBox(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  text: string,
  color = C_TEXT,
) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.fillStyle = '#061114';
  ctx.strokeStyle = '#244b52';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.max(9, h * 0.66)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  ctx.fillText(text, cx, cy + 0.5);
}

function drawAirspeed(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, speedMs: number) {
  drawDialFrame(ctx, cx, cy, r, 'VEL', 'm/s');
  const maxSpeed = 180;
  const speed = clamp(speedMs, 0, maxSpeed);
  const start = 0.75 * Math.PI;
  const sweep = 1.5 * Math.PI;
  const toAngle = (v: number) => start + (v / maxSpeed) * sweep;

  // Faixas coloridas A-29: estol (< 40 m/s), cruzeiro (40..164 m/s), acima da máxima (> 164 m/s)
  const arcR = r * 0.82;
  ctx.lineWidth = Math.max(2.5, r * 0.055);
  const arcs: Array<[number, number, string]> = [
    [0, 40, C_CORAL],
    [40, 164, C_TEAL],
    [164, maxSpeed, C_AMBER],
  ];
  for (const [a, b, col] of arcs) {
    ctx.beginPath();
    ctx.arc(cx, cy, arcR, toAngle(a), toAngle(b));
    ctx.strokeStyle = col;
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.max(8, r * 0.135)}px system-ui, sans-serif`;
  for (let v = 0; v <= maxSpeed; v += 5) {
    const a = toAngle(v);
    const major = v % 20 === 0;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const r0 = r * (major ? 0.68 : 0.76);
    const r1 = r * 0.85;
    ctx.beginPath();
    ctx.moveTo(cx + cos * r0, cy + sin * r0);
    ctx.lineTo(cx + cos * r1, cy + sin * r1);
    ctx.lineWidth = major ? 1.8 : 1;
    ctx.strokeStyle = major ? C_TEXT : C_MUTED;
    ctx.stroke();

    if (major) {
      const lr = r * 0.54;
      ctx.fillStyle = v === 160 ? C_AMBER : C_TEXT;
      ctx.fillText(String(v), cx + cos * lr, cy + sin * lr);
    }
  }

  // Marcas explícitas de estol (40 m/s) e velocidade máxima do A-29 (164 m/s)
  for (const [markVal, markCol] of [
    [40, C_CORAL],
    [164, C_CORAL],
  ] as const) {
    const a = toAngle(markVal);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(cx + cos * r * 0.64, cy + sin * r * 0.64);
    ctx.lineTo(cx + cos * r * 0.88, cy + sin * r * 0.88);
    ctx.lineWidth = Math.max(2.4, r * 0.05);
    ctx.strokeStyle = markCol;
    ctx.stroke();
  }

  drawReadoutBox(ctx, cx, cy + r * 0.48, r * 0.74, r * 0.25, `${Math.round(speedMs)}`);
  drawNeedle(ctx, cx, cy, toAngle(speed), r * 0.74, r * 0.18, Math.max(2.5, r * 0.055), C_AMBER);
  drawCenterCap(ctx, cx, cy, r);
}

function drawHorizon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  pitchDeg: number,
  rollDeg: number,
) {
  drawDialFrame(ctx, cx, cy, r, '', '');
  const innerR = r * 0.88;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.clip();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-rollDeg * DEG_TO_RAD);

  const pxPerDeg = innerR / 44;
  const pitchShift = clamp(pitchDeg, -90, 90) * pxPerDeg;
  ctx.translate(0, pitchShift);

  // Céu crepuscular e solo verde-azulado cobrindo todo o giro de -90°..+90°
  const skyGrad = ctx.createLinearGradient(0, -90 * pxPerDeg, 0, 0);
  skyGrad.addColorStop(0, '#231a3a');
  skyGrad.addColorStop(0.6, '#6f486c');
  skyGrad.addColorStop(1, '#e8935c');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-innerR * 3, -innerR * 5, innerR * 6, innerR * 5);

  const groundGrad = ctx.createLinearGradient(0, 0, 0, 90 * pxPerDeg);
  groundGrad.addColorStop(0, '#1e4549');
  groundGrad.addColorStop(1, '#09181b');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(-innerR * 3, 0, innerR * 6, innerR * 5);

  // Linha do horizonte
  ctx.beginPath();
  ctx.moveTo(-innerR * 2.5, 0);
  ctx.lineTo(innerR * 2.5, 0);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff0db';
  ctx.stroke();

  // Escada de arfagem completa (-80°..+80°; linhas tracejadas no mergulho)
  ctx.font = `600 ${Math.max(7, r * 0.105)}px system-ui, sans-serif`;
  ctx.fillStyle = '#f8ebe0';
  ctx.textBaseline = 'middle';
  for (let deg = -80; deg <= 80; deg += 10) {
    if (deg === 0) continue;
    const y = -deg * pxPerDeg;
    const major = deg % 20 === 0;
    const half = r * (major ? 0.24 : 0.13);
    ctx.beginPath();
    if (deg < 0) ctx.setLineDash([4, 3]);
    else ctx.setLineDash([]);
    ctx.moveTo(-half, y);
    ctx.lineTo(half, y);
    ctx.lineWidth = major ? 1.5 : 1.1;
    ctx.strokeStyle = 'rgba(255, 244, 232, 0.85)';
    ctx.stroke();
    ctx.setLineDash([]);
    if (major) {
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.abs(deg)), -half - 4, y);
      ctx.textAlign = 'left';
      ctx.fillText(String(Math.abs(deg)), half + 4, y);
    }
  }

  // Marcadores de zênite (+90°) e nadir (-90°) para loops
  for (const pole of [-90, 90]) {
    const py = -pole * pxPerDeg;
    ctx.beginPath();
    ctx.arc(0, py, Math.max(3, r * 0.045), 0, Math.PI * 2);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = pole > 0 ? '#fff0db' : C_CORAL;
    ctx.stroke();
  }
  ctx.restore();

  // Escala de rolagem completa (-180°..+180° incluindo voo de dorso)
  const bankR = innerR * 0.88;
  for (const deg of [-135, -90, -60, -45, -30, -15, 0, 15, 30, 45, 60, 90, 135, 180]) {
    const a = -Math.PI / 2 + deg * DEG_TO_RAD;
    const len = deg === 0 || deg === 180 || Math.abs(deg) === 90 ? 7 : deg % 30 === 0 ? 5.5 : 3.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (bankR - len), cy + Math.sin(a) * (bankR - len));
    ctx.lineTo(cx + Math.cos(a) * bankR, cy + Math.sin(a) * bankR);
    ctx.lineWidth = deg === 0 || deg === 180 ? 2 : 1.25;
    ctx.strokeStyle = deg === 180 ? C_AMBER : 'rgba(231, 242, 242, 0.75)';
    ctx.stroke();
  }

  // Triângulo móvel do ângulo de rolagem (-180°..+180°)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-rollDeg * DEG_TO_RAD);
  ctx.beginPath();
  ctx.moveTo(0, -bankR + 2);
  ctx.lineTo(-4.5, -bankR + 9);
  ctx.lineTo(4.5, -bankR + 9);
  ctx.closePath();
  ctx.fillStyle = C_AMBER;
  ctx.fill();
  ctx.restore();

  ctx.restore();

  // Símbolo fixo da aeronave no centro
  ctx.strokeStyle = C_AMBER;
  ctx.lineWidth = Math.max(2, r * 0.045);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.34, cy);
  ctx.lineTo(cx - r * 0.13, cy);
  ctx.lineTo(cx, cy + r * 0.09);
  ctx.lineTo(cx + r * 0.13, cy);
  ctx.lineTo(cx + r * 0.34, cy);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, r * 0.038), 0, Math.PI * 2);
  ctx.fillStyle = '#fff5e8';
  ctx.fill();
}

function drawAltimeter(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, altitudeM: number) {
  drawDialFrame(ctx, cx, cy, r, 'ALT', 'm ×100');

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.max(8, r * 0.15)}px system-ui, sans-serif`;

  for (let i = 0; i < 50; i++) {
    const a = -Math.PI / 2 + (i / 50) * Math.PI * 2;
    const major = i % 5 === 0;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const r0 = r * (major ? 0.71 : 0.78);
    const r1 = r * 0.86;
    ctx.beginPath();
    ctx.moveTo(cx + cos * r0, cy + sin * r0);
    ctx.lineTo(cx + cos * r1, cy + sin * r1);
    ctx.lineWidth = major ? 1.8 : 1;
    ctx.strokeStyle = major ? C_TEXT : C_MUTED;
    ctx.stroke();

    if (major) {
      const lr = r * 0.56;
      ctx.fillStyle = C_TEXT;
      ctx.fillText(String(i / 5), cx + cos * lr, cy + sin * lr);
    }
  }

  drawReadoutBox(ctx, cx, cy + r * 0.44, r * 0.76, r * 0.25, `${Math.round(altitudeM)}m`);

  // Ponteiro de milhares (curto) + ponteiro de centenas (longo, 1 volta = 1000 m)
  const angle1k = -Math.PI / 2 + (altitudeM / 10000) * Math.PI * 2;
  const angle100 = -Math.PI / 2 + (altitudeM / 1000) * Math.PI * 2;
  drawNeedle(ctx, cx, cy, angle1k, r * 0.48, r * 0.14, Math.max(3.5, r * 0.08), C_TEAL);
  drawNeedle(ctx, cx, cy, angle100, r * 0.77, r * 0.18, Math.max(2.2, r * 0.05), '#f5faf9');
  drawCenterCap(ctx, cx, cy, r);
}

function drawCompass(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, headingDeg: number) {
  drawDialFrame(ctx, cx, cy, r, '', '');

  // Rosa dos ventos giratória
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-headingDeg * DEG_TO_RAD);

  const cardinals: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let deg = 0; deg < 360; deg += 10) {
    const a = -Math.PI / 2 + deg * DEG_TO_RAD;
    const major = deg % 30 === 0;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const r0 = r * (major ? 0.7 : 0.77);
    const r1 = r * 0.86;
    ctx.beginPath();
    ctx.moveTo(cos * r0, sin * r0);
    ctx.lineTo(cos * r1, sin * r1);
    ctx.lineWidth = major ? 1.8 : 1;
    ctx.strokeStyle = deg === 0 ? C_AMBER : major ? C_TEXT : C_MUTED;
    ctx.stroke();

    if (major) {
      const label = cardinals[deg] ?? String(deg / 10).padStart(2, '0');
      const lr = r * 0.54;
      ctx.save();
      ctx.translate(cos * lr, sin * lr);
      ctx.rotate(a + Math.PI / 2);
      ctx.font = `${cardinals[deg] ? 700 : 600} ${Math.max(8, r * (cardinals[deg] ? 0.17 : 0.13))}px system-ui, sans-serif`;
      ctx.fillStyle = deg === 0 ? C_AMBER : cardinals[deg] ? C_TEAL : C_TEXT;
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();

  // Triângulo de referência fixo no topo
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.86);
  ctx.lineTo(cx - 4.5, cy - r * 0.96);
  ctx.lineTo(cx + 4.5, cy - r * 0.96);
  ctx.closePath();
  ctx.fillStyle = C_AMBER;
  ctx.fill();

  // Miniatura da aeronave no centro
  ctx.strokeStyle = 'rgba(231, 242, 242, 0.55)';
  ctx.lineWidth = Math.max(1.5, r * 0.03);
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.22);
  ctx.lineTo(cx, cy + r * 0.16);
  ctx.moveTo(cx - r * 0.18, cy - r * 0.03);
  ctx.lineTo(cx + r * 0.18, cy - r * 0.03);
  ctx.moveTo(cx - r * 0.08, cy + r * 0.12);
  ctx.lineTo(cx + r * 0.08, cy + r * 0.12);
  ctx.stroke();

  const hdgText = `${String(Math.round(headingDeg) % 360).padStart(3, '0')}°`;
  drawReadoutBox(ctx, cx, cy + r * 0.34, r * 0.56, r * 0.23, hdgText, C_AMBER);
}

function drawVsi(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, vsMs: number) {
  drawDialFrame(ctx, cx, cy, r, 'VARIO', 'm/s');
  const maxVs = 150;
  const clamped = clamp(vsMs, -maxVs, maxVs);
  const maxSweep = 0.78 * Math.PI;
  const toAngle = (v: number) => Math.PI + (v / maxVs) * maxSweep;

  // Arcos sutis de subida / descida
  ctx.lineWidth = Math.max(2, r * 0.04);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.83, Math.PI, toAngle(maxVs));
  ctx.strokeStyle = 'rgba(61, 214, 189, 0.55)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.83, toAngle(-maxVs), Math.PI);
  ctx.strokeStyle = 'rgba(235, 94, 75, 0.55)';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.max(8, r * 0.125)}px system-ui, sans-serif`;

  for (let v = -maxVs; v <= maxVs; v += 10) {
    const a = toAngle(v);
    const major = v % 30 === 0;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const r0 = r * (major ? 0.69 : 0.76);
    const r1 = r * 0.85;
    ctx.beginPath();
    ctx.moveTo(cx + cos * r0, cy + sin * r0);
    ctx.lineTo(cx + cos * r1, cy + sin * r1);
    ctx.lineWidth = major ? 1.7 : 1;
    ctx.strokeStyle = v === 0 ? C_AMBER : major ? C_TEXT : C_MUTED;
    ctx.stroke();

    if (major && Math.abs(v) < maxVs) {
      const lr = r * 0.53;
      ctx.fillStyle = v === 0 ? C_AMBER : C_TEXT;
      ctx.fillText(String(Math.abs(v)), cx + cos * lr, cy + sin * lr);
    }
  }

  const sign = vsMs >= 0.5 ? '+' : '';
  drawReadoutBox(ctx, cx + r * 0.25, cy, r * 0.54, r * 0.24, `${sign}${Math.round(vsMs)}`);
  drawNeedle(ctx, cx, cy, toAngle(clamped), r * 0.74, r * 0.17, Math.max(2.3, r * 0.05), '#f5faf9');
  drawCenterCap(ctx, cx, cy, r);
}

function drawThrottle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, throttle: number) {
  const t = clamp(throttle, 0, 1);
  const w = r * 1.12;
  const h = r * 1.94;
  const x = cx - w / 2;
  const y = cy - h / 2;

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fillStyle = C_DIAL_FACE;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = C_DIAL_RING;
  ctx.stroke();

  ctx.fillStyle = C_MUTED;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.max(8, r * 0.14)}px system-ui, sans-serif`;
  ctx.fillText('ACEL', cx, y + r * 0.18);

  const trackTop = y + r * 0.34;
  const trackBottom = y + h - r * 0.44;
  const trackH = trackBottom - trackTop;
  const slotX = cx + r * 0.08;

  // Barra luminosa ao lado do trilho
  const barX = cx - r * 0.28;
  const barW = Math.max(5, r * 0.11);
  ctx.fillStyle = '#071316';
  ctx.beginPath();
  ctx.roundRect(barX, trackTop, barW, trackH, 3);
  ctx.fill();

  const fillH = trackH * t;
  if (fillH > 0.5) {
    const grad = ctx.createLinearGradient(0, trackBottom, 0, trackTop);
    grad.addColorStop(0, C_TEAL);
    grad.addColorStop(0.7, C_AMBER);
    grad.addColorStop(1, C_CORAL);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(barX, trackBottom - fillH, barW, fillH, 3);
    ctx.fill();
  }

  // Marcações de potência
  for (let i = 0; i <= 4; i++) {
    const ty = trackBottom - (i / 4) * trackH;
    ctx.beginPath();
    ctx.moveTo(slotX - r * 0.16, ty);
    ctx.lineTo(slotX + r * 0.24, ty);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = i === 4 ? C_AMBER : '#2e5860';
    ctx.stroke();
  }

  // Rasgo mecânico da alavanca
  ctx.fillStyle = '#040b0d';
  ctx.beginPath();
  ctx.roundRect(slotX - 3, trackTop - 3, 6, trackH + 6, 3);
  ctx.fill();

  // Manete em T da alavanca do acelerador
  const leverY = trackBottom - t * trackH;
  const knobW = r * 0.56;
  const knobH = Math.max(12, r * 0.22);
  ctx.fillStyle = '#284a50';
  ctx.strokeStyle = C_AMBER;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(slotX - knobW / 2, leverY - knobH / 2, knobW, knobH, 4);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(slotX - knobW * 0.3, leverY);
  ctx.lineTo(slotX + knobW * 0.3, leverY);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#f5faf9';
  ctx.stroke();

  drawReadoutBox(ctx, cx, y + h - r * 0.21, w * 0.72, r * 0.25, `${Math.round(t * 100)}%`);
}

export function createCockpit({ state }: FlightContext, uiRoot?: HTMLElement | null): FlightModule {
  const ui = uiRoot ?? document.getElementById('ui');
  if (!ui) return { update() {} };

  const root = document.createElement('div');
  root.className = 'cockpit-root';

  // Moldura da janela: colunas laterais e visor superior escuros
  const frame = document.createElement('div');
  frame.className = 'cockpit-frame';

  const topBrow = document.createElement('div');
  topBrow.className = 'cockpit-brow';
  const leftPillar = document.createElement('div');
  leftPillar.className = 'cockpit-pillar cockpit-pillar--left';
  const rightPillar = document.createElement('div');
  rightPillar.className = 'cockpit-pillar cockpit-pillar--right';
  frame.append(topBrow, leftPillar, rightPillar);

  // Painel inferior (~35% da altura, verde-azulado escuro) com canvas 2D
  const panel = document.createElement('div');
  panel.className = 'cockpit-panel';
  const canvas = document.createElement('canvas');
  canvas.className = 'cockpit-canvas';
  panel.append(canvas);

  root.append(frame, panel);
  ui.append(root);

  const ctx2d = canvas.getContext('2d');
  let lastVisible: boolean | null = null;
  let lastW = 0;
  let lastH = 0;
  let lastDpr = 0;

  function renderInstruments() {
    if (!ctx2d) return;
    const w = panel.clientWidth;
    const h = panel.clientHeight;
    if (w <= 0 || h <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (w !== lastW || h !== lastH || dpr !== lastDpr) {
      lastW = w;
      lastH = h;
      lastDpr = dpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, w, h);

    // Reserva faixa inferior para o rodapé de atalhos do HUD
    const footerReserve = 34;
    const usableH = Math.max(120, h - footerReserve);
    const cy = 8 + (usableH - 8) * 0.5;
    const r = Math.max(20, Math.min(usableH * 0.42, (w - 64) / 13.8));
    const horizonR = r * 1.05;

    // Fundo sutil de placa de instrumentos
    ctx2d.fillStyle = C_PANEL_BG;
    ctx2d.fillRect(0, 0, w, h);
    ctx2d.strokeStyle = C_PANEL_LINE;
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(18, 8);
    ctx2d.lineTo(w - 18, 8);
    ctx2d.stroke();

    const gaugesW = 4 * (2 * r) + 2 * horizonR + r * 1.12;
    const gap = Math.max(8, Math.min(30, (w - 32 - gaugesW) / 5));
    const totalW = gaugesW + 5 * gap;
    let x = (w - totalW) * 0.5 + r;

    drawAirspeed(ctx2d, x, cy, r, state.speed);
    x += r + gap + horizonR;

    drawHorizon(ctx2d, x, cy, horizonR, state.pitch, state.roll);
    x += horizonR + gap + r;

    drawAltimeter(ctx2d, x, cy, r, state.altitude);
    x += 2 * r + gap;

    drawCompass(ctx2d, x, cy, r, state.heading);
    x += 2 * r + gap;

    drawVsi(ctx2d, x, cy, r, state.verticalSpeed);
    x += r + gap + r * 0.56;

    drawThrottle(ctx2d, x, cy, r, state.throttle);

    // Indicador luminoso discreto da fumaça acrobática (somente no A-29)
    const smokeOn = state.vehicle === 'a29' && isSmokeActive(state);
    const pillW = 66;
    const pillH = 18;
    const pillX = w - pillW - 18;
    const pillY = 14;
    if (state.vehicle === 'a29' && pillX > x + r * 0.65) {
      ctx2d.fillStyle = smokeOn ? 'rgba(236, 246, 255, 0.16)' : '#071316';
      ctx2d.strokeStyle = smokeOn ? '#e8f5ff' : '#244b52';
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.roundRect(pillX, pillY, pillW, pillH, 4);
      ctx2d.fill();
      ctx2d.stroke();

      ctx2d.beginPath();
      ctx2d.arc(pillX + 11, pillY + pillH / 2, 3.2, 0, Math.PI * 2);
      ctx2d.fillStyle = smokeOn ? '#ffffff' : '#2f4e54';
      ctx2d.fill();

      ctx2d.fillStyle = smokeOn ? '#f4fbff' : C_MUTED;
      ctx2d.textAlign = 'left';
      ctx2d.textBaseline = 'middle';
      ctx2d.font = '700 10px system-ui, sans-serif';
      ctx2d.fillText('FUM [F]', pillX + 19, pillY + pillH / 2 + 0.5);
    }
  }

  function sync() {
    const isAircraft = state.vehicle === 'a29' || state.vehicle === 'heli';
    const visible = getRuntime(state).mode !== 'title' && isAircraft && state.camera === 'cockpit';
    if (visible !== lastVisible) {
      lastVisible = visible;
      root.hidden = !visible;
    }
    if (visible) renderInstruments();
  }

  sync();

  return {
    update() {
      sync();
    },
    destroy() {
      root.remove();
    },
  };
}
