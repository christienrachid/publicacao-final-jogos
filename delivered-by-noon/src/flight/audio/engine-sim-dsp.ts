/**
 * Port TypeScript do núcleo de síntese de motor do Engine Sim (Yigit Salih Emecen, 2026).
 * SPDX-License-Identifier: MIT — licença preservada em `LICENSE-engine-sim.txt`.
 * Fonte: https://github.com/YigitSalihEmecen/Engine_Sim (commit c3ff6103).
 *
 * Adaptações para Delivered by Noon (PlayCanvas):
 * - AudioWorklet carregado via Blob URL inline (compatível com bundle único do PlayCanvas Editor),
 *   com fallback automático para wavetables PeriodicWave de largura de banda limitada.
 * - Telemetria RPM/marcha/carga/corte-de-giro/nitro derivada de `FlightState` sem alterar `car.ts`.
 * - Zero alocação por quadro em `update()`.
 */

export interface EnginePulseSpec {
  attack: number;
  decay: number;
  hardness: number;
  jitter: number;
  ccv?: number;
  jitterDeg?: number;
}

export interface EngineExhaustSpec {
  bank: number;
  bankB?: number;
  collector: number;
  reflection: number;
  damping: number;
  muffler: readonly number[];
}

export interface EngineIntakeSpec {
  helmholtz: number;
  q: number;
  level: number;
}

export interface EngineProfile {
  readonly id: EngineProfileId;
  readonly label: string;
  readonly cylinders: number;
  readonly firingOrder: readonly number[];
  readonly banks: readonly (readonly number[])[];
  readonly pinOffsets?: Readonly<Record<number, number>>;
  readonly idleRpm: number;
  readonly redlineRpm: number;
  readonly peakTorque: number;
  readonly engineInertia: number;
  readonly gasTempFactor: number;
  readonly pulse: EnginePulseSpec;
  readonly exhaust: EngineExhaustSpec;
  readonly intake: EngineIntakeSpec;
  readonly voice: number;
}

export type EngineProfileId = 'i4' | 'v8cross';

export const SPEED_OF_SOUND = 343;
export const TABLE_SIZE = 4096;
export const MAX_HARMONICS = 512;
const RADIATION_KNEE_ORDER = 24;
const RENDER_QUANTUM = 128;
const QUANTUM_HEADROOM = 1.02;
const MAX_FEEDBACK = 0.92;
const F_MIN = 10;
const F_MAX = 20000;
const TC = 0.025;
const TC_GAIN = 0.045;
const TC_DELAY = 0.09;
const LOOKAHEAD = 0.004;

export const ENGINE_PROFILES: Readonly<Record<EngineProfileId, EngineProfile>> = {
  i4: {
    id: 'i4',
    label: 'Inline-4 2.0 (Hatch)',
    cylinders: 4,
    firingOrder: [1, 3, 4, 2],
    banks: [[1, 2, 3, 4]],
    idleRpm: 800,
    redlineRpm: 7200,
    peakTorque: 240,
    engineInertia: 0.19,
    gasTempFactor: 1.28,
    pulse: { attack: 38, decay: 6.2, hardness: 0.66, jitter: 1.1 },
    exhaust: {
      bank: 1.3,
      collector: 1.05,
      reflection: 0.52,
      damping: 0.44,
      muffler: [0.3, 0.19, 0.12],
    },
    intake: { helmholtz: 118, q: 6.0, level: 0.32 },
    voice: 0.96,
  },
  v8cross: {
    id: 'v8cross',
    label: 'V8 cross-plane 5.0 (Esportivo)',
    cylinders: 8,
    firingOrder: [1, 8, 7, 3, 6, 5, 4, 2],
    banks: [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ],
    idleRpm: 720,
    redlineRpm: 7400,
    peakTorque: 560,
    engineInertia: 0.34,
    gasTempFactor: 1.28,
    pulse: { attack: 28, decay: 4.5, hardness: 0.62, jitter: 2.5 },
    exhaust: {
      bank: 1.72,
      collector: 1.32,
      reflection: 0.63,
      damping: 0.33,
      muffler: [0.4, 0.26, 0.17],
    },
    intake: { helmholtz: 82, q: 5.2, level: 0.34 },
    voice: 1.12,
  },
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function fin(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function hzOf(v: number, fallback: number, fMax = F_MAX): number {
  return clamp(fin(v, fallback), F_MIN, fMax);
}

function setT(param: AudioParam | null | undefined, value: number, now: number, tc = TC): void {
  if (!param) return;
  const v = fin(value, 0);
  const t = Math.max(0, fin(now, 0));
  param.setTargetAtTime(v, t, tc > 0 ? tc : TC);
}

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Geometria de ignição e tubos (profiles.js)
// ---------------------------------------------------------------------------

export function firingAngles(profile: EngineProfile): Map<number, number> {
  const n = profile.cylinders;
  const interval = 720 / n;
  const map = new Map<number, number>();
  for (let i = 0; i < profile.firingOrder.length; i++) {
    const cyl = profile.firingOrder[i];
    const trim = profile.pinOffsets?.[cyl] ?? 0;
    map.set(cyl, (i * interval + trim + 720) % 720);
  }
  return map;
}

export function bankAngles(profile: EngineProfile, bankIndex: number): number[] {
  const all = firingAngles(profile);
  return profile.banks[bankIndex].map((c) => all.get(c) ?? 0).sort((a, b) => a - b);
}

export function pipeFrequency(lengthMetres: number, gasTempFactor = 1): number {
  return (SPEED_OF_SOUND * gasTempFactor) / (4 * Math.max(0.05, lengthMetres));
}

export function pipeDelay(lengthMetres: number, gasTempFactor = 1): number {
  return (2 * Math.max(0.05, lengthMetres)) / (SPEED_OF_SOUND * gasTempFactor);
}

// ---------------------------------------------------------------------------
// Geração de wavetables e especificação do AudioWorklet (pulse.js)
// ---------------------------------------------------------------------------

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

function pulseAt(d: number, a: number, b: number): number {
  if (d < 0 || d > 1) return 0;
  return (1 - Math.exp(-a * d)) * Math.exp(-b * d);
}

export function buildCycle(
  profile: EngineProfile,
  angles: readonly number[],
  hard: number,
  phaseShift = 0,
): Float64Array {
  const P = profile.pulse;
  const h = clamp(fin(P.hardness, 0.65), 0, 1.5) / 0.65;
  const a = P.attack * (0.55 + 0.85 * h * hard);
  const b = P.decay * (1.25 - 0.35 * h * hard);

  const cycle = new Float64Array(TABLE_SIZE);
  const rnd = seeded(profile.cylinders * 2654435761 + Math.round(P.attack * 97));
  const jitter = (P.jitter || 0) / 100;

  for (let ai = 0; ai < angles.length; ai++) {
    const angle = angles[ai];
    const ampTrim = 1 + (rnd() * 2 - 1) * jitter * 2.5;
    const angTrim = (rnd() * 2 - 1) * jitter * 6;
    const decayTrim = 1 + (rnd() * 2 - 1) * jitter * 1.5;
    const u0 = ((((angle + phaseShift + angTrim) % 720) + 720) % 720) / 720;

    for (let i = 0; i < TABLE_SIZE; i++) {
      let d = i / TABLE_SIZE - u0;
      if (d < 0) d += 1;
      cycle[i] += ampTrim * pulseAt(d, a, b * decayTrim);
    }
  }
  return cycle;
}

export function toPressureGradient(cycle: Float64Array): Float64Array {
  const n = cycle.length;
  const out = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const v = cycle[(i + 1) % n] - cycle[i];
    out[i] = v;
    mean += v;
  }
  mean /= n;
  for (let i = 0; i < n; i++) out[i] -= mean;
  return out;
}

export function cycleToCoefficients(
  cycle: Float64Array,
  maxHarmonics = MAX_HARMONICS,
  kneeOrder = RADIATION_KNEE_ORDER,
): { real: Float32Array; imag: Float32Array } {
  const n = cycle.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(cycle);
  fft(re, im);

  const L = Math.min(maxHarmonics, n / 2);
  const real = new Float32Array(L);
  const imag = new Float32Array(L);
  const kKnee = kneeOrder > 0 ? 2 * kneeOrder : 0;
  for (let k = 1; k < L; k++) {
    const shelf = kKnee ? 1 / (1 + k / kKnee) : 1;
    real[k] = ((2 * re[k]) / n) * shelf;
    imag[k] = ((-2 * im[k]) / n) * shelf;
  }
  real[0] = 0;
  imag[0] = 0;
  return { real, imag };
}

function normaliseCoeffs(
  coeffs: { real: Float32Array; imag: Float32Array },
  targetRms = 0.25,
): { real: Float32Array; imag: Float32Array } {
  let power = 0;
  for (let k = 1; k < coeffs.real.length; k++) {
    power += 0.5 * (coeffs.real[k] * coeffs.real[k] + coeffs.imag[k] * coeffs.imag[k]);
  }
  const rms = Math.sqrt(power) || 1;
  const g = targetRms / rms;
  for (let k = 0; k < coeffs.real.length; k++) {
    coeffs.real[k] *= g;
    coeffs.imag[k] *= g;
  }
  return coeffs;
}

export function crankRipple(profile: EngineProfile, rpm: number, load: number): number {
  const J = Math.max(0.02, profile.engineInertia || 0.25);
  const n = Math.max(1, profile.cylinders || 4);
  const w = Math.max(40, (rpm * Math.PI) / 30);
  const T = (profile.peakTorque || 300) * (0.12 + 0.88 * clamp(load, 0, 1));
  const r = (0.3 * T * ((4 * Math.PI) / n)) / (J * w * w);
  return clamp(r, 0, 0.12);
}

export interface CombustionEventSpec {
  out: number;
  angle: number;
  ampTrim: number;
  decayTrim: number;
}

export interface CombustionSpec {
  events: CombustionEventSpec[];
  outputs: number;
  attack: number;
  decay: number;
  hardness: number;
  ccv: number;
  jitterDeg: number;
  gains: number[][];
  seed: number;
}

export function combustionSpec(profile: EngineProfile): CombustionSpec {
  const P = profile.pulse;
  const jit = (P.jitter || 0) / 100;
  const rnd = seeded(profile.cylinders * 2654435761 + Math.round(P.attack * 97) + 7);
  const events: CombustionEventSpec[] = [];
  const nBanks = profile.banks.length;
  const intakeAngles: Array<{ angle: number; ampTrim: number; decayTrim: number }> = [];

  for (let b = 0; b < nBanks; b++) {
    const angles = bankAngles(profile, b);
    for (let i = 0; i < angles.length; i++) {
      const angle = angles[i];
      const ampTrim = 1 + (rnd() * 2 - 1) * jit * 2.5;
      const angTrim = (rnd() * 2 - 1) * jit * 6;
      const decayTrim = 1 + (rnd() * 2 - 1) * jit * 1.5;
      const u = ((((angle + angTrim) % 720) + 720) % 720) / 720;
      events.push({ out: b, angle: u, ampTrim, decayTrim });
      intakeAngles.push({ angle: angle + angTrim + 360, ampTrim, decayTrim });
    }
  }
  for (let i = 0; i < intakeAngles.length; i++) {
    const c = intakeAngles[i];
    events.push({
      out: nBanks,
      angle: (((c.angle % 720) + 720) % 720) / 720,
      ampTrim: c.ampTrim,
      decayTrim: c.decayTrim,
    });
  }

  const hardness = clamp(fin(P.hardness, 0.65), 0, 1.5) / 0.65;
  const N = TABLE_SIZE;
  const KNEE = 2 * RADIATION_KNEE_ORDER;
  const k = 1 - Math.exp((-2 * Math.PI * KNEE) / N);
  const gains: number[][] = [];
  const cyc = new Float64Array(N);

  for (let o = 0; o <= nBanks; o++) {
    const row: number[] = [];
    for (let L = 0; L <= 4; L++) {
      const load = L / 4;
      const h = hardness * load;
      const a = P.attack * (0.55 + 0.85 * h);
      const b0 = P.decay * (1.25 - 0.35 * h);
      cyc.fill(0);
      for (let ei = 0; ei < events.length; ei++) {
        const e = events[ei];
        if (e.out !== o) continue;
        for (let i = 0; i < N; i++) {
          let d = i / N - e.angle;
          if (d < 0) d += 1;
          cyc[i] += e.ampTrim * pulseAt(d, a, b0 * e.decayTrim);
        }
      }
      let lp = 0;
      let ss = 0;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < N; i++) {
          const g = (cyc[i] - cyc[(i + N - 1) % N]) * N;
          lp += k * (g - lp);
          if (pass) ss += lp * lp;
        }
      }
      const rms = Math.sqrt(ss / N) || 1;
      row.push(0.25 / rms);
    }
    gains.push(row);
  }

  return {
    events: events.sort((x, y) => x.angle - y.angle),
    outputs: nBanks + 1,
    attack: P.attack,
    decay: P.decay,
    hardness,
    ccv: typeof P.ccv === 'number' ? P.ccv : 0.012 + 0.012 * (P.jitter || 1),
    jitterDeg: typeof P.jitterDeg === 'number' ? P.jitterDeg : 0.4 + 0.5 * (P.jitter || 1),
    gains,
    seed: (profile.cylinders * 40503 + Math.round(P.attack * 131)) >>> 0,
  };
}

interface EngineWaves {
  banks: Array<{ soft: PeriodicWave; hard: PeriodicWave }>;
  intake: { soft: PeriodicWave; hard: PeriodicWave };
}

function buildEngineWaves(ctx: AudioContext, profile: EngineProfile): EngineWaves {
  const opts: PeriodicWaveConstraints = { disableNormalization: true };
  const make = (angles: readonly number[], hard: number, phase: number): PeriodicWave => {
    const c = normaliseCoeffs(cycleToCoefficients(toPressureGradient(buildCycle(profile, angles, hard, phase))));
    return ctx.createPeriodicWave(c.real, c.imag, opts);
  };
  const banks = profile.banks.map((_, i) => {
    const angles = bankAngles(profile, i);
    return { soft: make(angles, 0, 0), hard: make(angles, 1, 0) };
  });
  const allAngles = profile.banks.flat().map((_, i) => (i * 720) / profile.cylinders);
  const intake = { soft: make(allAngles, 0, 360), hard: make(allAngles, 1, 360) };
  return { banks, intake };
}

// ---------------------------------------------------------------------------
// AudioWorklet inline (combustion-worklet.js) — compatível com bundle único
// ---------------------------------------------------------------------------

const COMBUSTION_WORKLET_SOURCE = `
const KNEE_HALF_ORDERS = 48;
const ONSET_S = 60e-6;

class CombustionProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'f0', defaultValue: 10, minValue: 0, maxValue: 4000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'amp', defaultValue: 0, minValue: 0, maxValue: 8, automationRate: 'k-rate' },
      { name: 'rough', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'ripple', defaultValue: 0, minValue: 0, maxValue: 0.2, automationRate: 'k-rate' },
      { name: 'low', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor(options) {
    super();
    const o = options.processorOptions;
    this.events = o.events;
    this.nOut = o.outputs;
    this.attack = o.attack;
    this.decay = o.decay;
    this.hardness = o.hardness;
    this.ccv = o.ccv;
    this.jitterCycles = o.jitterDeg / 720;
    this.gains = o.gains;
    this.abs = 0;
    this.pulses = [];
    this.pool = [];
    this.prevP = new Float64Array(this.nOut);
    this.lp = new Float64Array(this.nOut);
    this.acc = new Float64Array(this.nOut);
    this.cycleOf = new Float64Array(this.events.length);
    this.nextAt = Float64Array.from(this.events, (e) => e.angle);
    this.seed = (o.seed >>> 0) || 1;
    this.v = 0;
    this.nFire = this.events.filter((e) => e.out < this.nOut - 1).length;
    this.alive = true;
    this.port.onmessage = (m) => { if (m.data === 'stop') this.alive = false; };
  }
  rand() {
    let s = this.seed;
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    this.seed = s;
    return s / 4294967296;
  }
  gauss() {
    return (this.rand() + this.rand() + this.rand() + this.rand() - 2) * 1.732;
  }
  _schedule(k, load, rough, low) {
    const e = this.events[k];
    const spread = this.jitterCycles * (0.6 + 1.4 * (1 - load)) * (1 + 2 * rough) * (1 + 0.8 * low);
    this.cycleOf[k] += 1;
    this.nextAt[k] = this.cycleOf[k] + e.angle + Math.max(-0.02, Math.min(0.02, this.gauss() * spread));
  }
  _fire(e, load, rough, low, ripple) {
    const cov = this.ccv * (0.7 + 2.3 * (1 - load) * (1 - load)) * (1 + 2.5 * rough) * (1 + low);
    const trim = 1 + (e.ampTrim - 1) * (1 + 1.5 * low);
    const A = trim * Math.max(0.25, 1 + this.gauss() * cov);
    const h = this.hardness * load;
    const a = this.attack * (0.55 + 0.85 * h);
    const b = this.decay * (1.25 - 0.35 * h) * e.decayTrim * (1 + 0.5 * cov * this.gauss());
    const p = this.pool.pop() || { out: 0, A: 0, a: 0, b: 0, t: 0, ts: 0 };
    p.out = e.out; p.A = A; p.a = a; p.b = b; p.t = 0; p.ts = 0;
    this.pulses.push(p);
    if (e.out < this.nOut - 1) this.v += ripple * A;
  }
  process(inputs, outputs, params) {
    const out = outputs;
    const n = out[0][0].length;
    const f0 = params.f0[0];
    const load = Math.min(1, Math.max(0, params.load[0]));
    const amp = params.amp[0];
    const rough = params.rough[0];
    const ripple = params.ripple ? params.ripple[0] : 0;
    const low = params.low ? params.low[0] : 0;
    if (amp <= 1e-4) {
      for (let o = 0; o < this.nOut; o++) out[o][0].fill(0);
      return this.alive;
    }
    const drag = ripple * this.nFire;
    const sr = sampleRate;
    const dph = f0 / sr;
    const dts = 1 / sr;
    const ev = this.events, nEv = ev.length;
    const gi = load * 4, g0 = Math.min(3, Math.floor(gi)), gf = gi - g0;
    const fc = Math.min(KNEE_HALF_ORDERS * f0, 0.45 * sr);
    const lpk = 1 - Math.exp(-2 * Math.PI * fc / sr);
    const acc = this.acc;
    for (let i = 0; i < n; i++) {
      const dphv = dph * (1 + this.v);
      const invv = dphv > 1e-9 ? 1 / dphv : 0;
      this.v -= (drag + 6 * this.v) * dph;
      if (this.v > 0.2) this.v = 0.2; else if (this.v < -0.2) this.v = -0.2;
      this.abs += dphv;
      const abs = this.abs;
      for (let k = 0; k < nEv; k++) {
        if (abs >= this.nextAt[k]) {
          this._fire(ev[k], load, rough, low, ripple);
          const past = Math.min(1, abs - this.nextAt[k]);
          const last = this.pulses[this.pulses.length - 1];
          last.t = past; last.ts = f0 > 0 ? past / f0 : 0;
          this._schedule(k, load, rough, low);
          while (this.nextAt[k] < abs) this._schedule(k, load, rough, low);
        }
      }
      acc.fill(0);
      for (let j = this.pulses.length - 1; j >= 0; j--) {
        const p = this.pulses[j];
        if (p.t > 1 || p.b * p.t > 9) {
          this.pulses[j] = this.pulses[this.pulses.length - 1];
          this.pulses.pop();
          this.pool.push(p);
          continue;
        }
        const on = 1 - Math.exp(-(p.ts * p.ts) / (ONSET_S * ONSET_S));
        acc[p.out] += p.A * on * (1 - Math.exp(-p.a * p.t)) * Math.exp(-p.b * p.t);
        p.t += dphv; p.ts += dts;
      }
      for (let o = 0; o < this.nOut; o++) {
        const grad = (acc[o] - this.prevP[o]) * invv;
        this.prevP[o] = acc[o];
        this.lp[o] += lpk * (grad - this.lp[o]);
        const G = this.gains[o];
        const gain = G[g0] + (G[g0 + 1] - G[g0]) * gf;
        out[o][0][i] = this.lp[o] * gain * amp;
      }
    }
    return this.alive;
  }
}
registerProcessor('engine-combustion', CombustionProcessor);
`;

const WORKLET_READY = new WeakSet<AudioContext>();
const WORKLET_LOADING = new WeakMap<AudioContext, Promise<boolean>>();

export function preloadCombustionWorklet(ctx: AudioContext): Promise<boolean> {
  if (WORKLET_READY.has(ctx)) return Promise.resolve(true);
  if (
    !ctx.audioWorklet ||
    typeof AudioWorkletNode === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return Promise.resolve(false);
  }
  const existing = WORKLET_LOADING.get(ctx);
  if (existing) return existing;

  const url = URL.createObjectURL(new Blob([COMBUSTION_WORKLET_SOURCE], { type: 'application/javascript' }));
  const task = ctx.audioWorklet
    .addModule(url)
    .then(() => {
      WORKLET_READY.add(ctx);
      URL.revokeObjectURL(url);
      return true;
    })
    .catch(() => {
      URL.revokeObjectURL(url);
      return false;
    });
  WORKLET_LOADING.set(ctx, task);
  return task;
}

// ---------------------------------------------------------------------------
// Ruído compartilhado e curvas waveshaper (layers.js / resonators.js)
// ---------------------------------------------------------------------------

const NOISE_CACHE = new WeakMap<AudioContext, { white?: AudioBuffer; pink?: AudioBuffer }>();

function sharedNoise(ctx: AudioContext, kind: 'white' | 'pink'): AudioBuffer {
  let per = NOISE_CACHE.get(ctx);
  if (!per) {
    per = {};
    NOISE_CACHE.set(ctx, per);
  }
  const hit = per[kind];
  if (hit) return hit;

  const sr = fin(ctx.sampleRate, 48000);
  const len = Math.max(1024, Math.floor(sr * 2.0));
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const rnd = seeded(kind === 'pink' ? 0x9e3779b9 : 0x85ebca6b);

  if (kind === 'pink') {
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
  }

  const fade = Math.min(2048, len >> 2);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    d[i] = d[i] * t + d[len - fade + i] * (1 - t);
  }
  per[kind] = buf;
  return buf;
}

const SHOCK_HEAD = 6;
let cachedShockCurve: Float32Array<ArrayBuffer> | null = null;
let cachedSubCurve: Float32Array<ArrayBuffer> | null = null;

function getShockCurve(kp = 3.2, kn = 2.0): Float32Array<ArrayBuffer> {
  if (cachedShockCurve && kp === 3.2 && kn === 2.0) return cachedShockCurve;
  const n = 2048;
  const cp = (1 / Math.max(0.2, kp / 3.2)) * 1.05;
  const cn = (1 / Math.max(0.2, kn / 3.2)) * 0.85;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = SHOCK_HEAD * ((i / (n - 1)) * 2 - 1);
    c[i] = x >= 0 ? cp * Math.tanh(x / cp) : cn * Math.tanh(x / cn);
  }
  if (kp === 3.2 && kn === 2.0) cachedShockCurve = c;
  return c;
}

function getSubCurve(): Float32Array<ArrayBuffer> {
  if (cachedSubCurve) return cachedSubCurve;
  const n = 1024;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(1.8 * x) * 0.92 + 0.08 * Math.tanh(2.6 * x * x * Math.sign(x));
  }
  cachedSubCurve = c;
  return c;
}

// ---------------------------------------------------------------------------
// Ressonadores físicos (resonators.js): Waveguide, Muffler, Intake, Nonlinearity
// ---------------------------------------------------------------------------

function lowpassPhase(f: number, fc: number, Q: number, sr: number): number {
  const w = (2 * Math.PI * clamp(fc, 1, 0.49 * sr)) / sr;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const al = sw / (2 * Math.max(1e-4, Q));
  const a0 = 1 + al;
  const b0 = (1 - cw) / 2 / a0;
  const b1 = (1 - cw) / a0;
  const b2 = b0;
  const a1 = (-2 * cw) / a0;
  const a2 = (1 - al) / a0;
  const t = (2 * Math.PI * clamp(f, 0.01, 0.49 * sr)) / sr;
  const c1 = Math.cos(t);
  const s1 = Math.sin(t);
  const c2 = Math.cos(2 * t);
  const s2 = Math.sin(2 * t);
  const nr = b0 + b1 * c1 + b2 * c2;
  const ni = -(b1 * s1 + b2 * s2);
  const dr = 1 + a1 * c1 + a2 * c2;
  const di = -(a1 * s1 + a2 * s2);
  const ph = Math.atan2(ni, nr) - Math.atan2(di, dr);
  return Number.isFinite(ph) ? ph : 0;
}

function tunedLoopDelay(f: number, fc: number, Q: number, sr: number): number {
  const w = 2 * Math.PI * f;
  if (!(w > 0)) return 0;
  const phi = lowpassPhase(f, fc, Q, sr);
  const d = (Math.PI + phi) / w;
  return d > 0 && Number.isFinite(d) ? d : 1 / (2 * f);
}

export function mufflerPeakCoincidence(delays: readonly number[], kMax = 6, tolHz = 45): number {
  let cost = 0;
  for (let i = 0; i < delays.length; i++) {
    for (let j = i + 1; j < delays.length; j++) {
      for (let a = 1; a <= kMax; a++) {
        for (let b = 1; b <= kMax; b++) {
          const fa = a / delays[i];
          const fb = b / delays[j];
          if (fa > 8000 || fb > 8000) continue;
          const d = (fa - fb) / tolHz;
          cost += Math.exp(-d * d) / (a * b);
        }
      }
    }
  }
  return cost;
}

export function decorrelateMufflerDelays(delays: readonly number[], spread = 0.06): number[] {
  const out = delays.slice();
  const STEPS = 41;
  for (let i = 1; i < out.length; i++) {
    let best = out[i];
    let bestCost = Infinity;
    for (let s = 0; s < STEPS; s++) {
      const k = 1 + spread * ((2 * s) / (STEPS - 1) - 1);
      const trial = out.slice(0, i + 1);
      trial[i] = delays[i] * k;
      const c = mufflerPeakCoincidence(trial);
      if (c < bestCost - 1e-12) {
        bestCost = c;
        best = delays[i] * k;
      }
    }
    out[i] = best;
  }
  return out;
}

export interface EngineFrameParams {
  now: number;
  dt: number;
  rpm: number;
  rpmNorm: number;
  f0: number;
  load: number;
  throttle: number;
  overrun: number;
  boost: number;
  valve: number;
  rough: number;
  limiterCut: number;
  evPop: number;
  evCut: number;
  evBov: number;
  cabinPos: number;
}

class Waveguide {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly nominalDelay: number;
  readonly frequency: number;
  readonly mode: 'delay' | 'bandpass';
  readonly thermalSpan = 0.05;
  readonly thermalBias = 0.35;

  private readonly fMax: number;
  private readonly minLoopDelay: number;
  private readonly maxDelayTime: number = 0.02;
  private readonly lpBase: number;
  private readonly reflection: number;
  private readonly delay: DelayNode | null = null;
  private readonly loopLP: BiquadFilterNode | null = null;
  private readonly fb: GainNode | null = null;
  private readonly modes: Array<{ bp: BiquadFilterNode; g: GainNode; order: number }> = [];
  private readonly nodes: AudioNode[] = [];

  constructor(ctx: AudioContext, length: number, gasTemp: number, reflection: number, damping: number) {
    const sr = fin(ctx.sampleRate, 48000);
    this.fMax = Math.min(F_MAX, 0.49 * sr);
    this.minLoopDelay = RENDER_QUANTUM / sr;
    this.reflection = clamp(reflection, 0, MAX_FEEDBACK);
    this.nominalDelay = pipeDelay(length, gasTemp);
    this.frequency = pipeFrequency(length, gasTemp);
    this.lpBase = clamp(this.frequency * (1.8 / clamp(damping, 0.05, 2)), 150, 12000);

    const maxHeatScale = 1 + this.thermalSpan * (1 - this.thermalBias);
    const tunedDelay = tunedLoopDelay(
      clamp(this.frequency, F_MIN, this.fMax),
      clamp(this.lpBase, 20, 0.49 * sr),
      0.5,
      sr,
    );
    const shortestDelay = tunedLoopDelay(
      clamp(this.frequency * maxHeatScale, F_MIN, this.fMax),
      clamp(this.lpBase * maxHeatScale * 1.35, 20, 0.49 * sr),
      0.5,
      sr,
    );
    this.mode = shortestDelay >= this.minLoopDelay * QUANTUM_HEADROOM ? 'delay' : 'bandpass';

    const keep = <T extends AudioNode>(n: T): T => {
      this.nodes.push(n);
      return n;
    };

    this.input = keep(ctx.createGain());
    this.output = keep(ctx.createGain());
    const dryGain = keep(ctx.createGain());
    dryGain.gain.value = 0.3;
    const wetGain = keep(ctx.createGain());
    wetGain.gain.value = 0.9;
    this.input.connect(dryGain);
    dryGain.connect(this.output);
    wetGain.connect(this.output);

    if (this.mode === 'delay') {
      const maxT = Math.max(0.01, (this.nominalDelay / (1 - this.thermalSpan)) * 1.25);
      this.maxDelayTime = maxT;
      const sum = keep(ctx.createGain());
      this.delay = keep(ctx.createDelay(maxT));
      this.delay.delayTime.value = clamp(tunedDelay, this.minLoopDelay, maxT);
      this.loopLP = keep(ctx.createBiquadFilter());
      this.loopLP.type = 'lowpass';
      this.loopLP.frequency.value = hzOf(this.lpBase, 500, this.fMax);
      this.loopLP.Q.value = 0.5;
      this.fb = keep(ctx.createGain());
      this.fb.gain.value = -this.fbMag(0);

      this.input.connect(sum);
      sum.connect(this.delay);
      this.delay.connect(this.loopLP);
      this.loopLP.connect(this.fb);
      this.fb.connect(sum);
      this.loopLP.connect(wetGain);
    } else {
      const a = this.fbMag(0);
      const q = clamp(Math.PI / (2 * Math.max(0.02, 1 - a)), 0.7, 24);
      const weights: number[] = [];
      let wSum = 0;
      for (let k = 0; k < 3; k++) {
        const f = this.frequency * (2 * k + 1);
        if (f > this.fMax * 0.95) break;
        const wall = 1 / Math.sqrt(1 + (f / this.lpBase) ** 2);
        const wk = Math.pow(1 / (2 * k + 1), 0.7) * wall;
        weights.push(wk);
        wSum += wk;
      }
      if (!weights.length) {
        weights.push(1);
        wSum = 1;
      }
      const peak = 0.6 / Math.max(0.08, 1 - a);
      for (let k = 0; k < weights.length; k++) {
        const bp = keep(ctx.createBiquadFilter());
        bp.type = 'bandpass';
        bp.frequency.value = hzOf(this.frequency * (2 * k + 1), 200, this.fMax);
        bp.Q.value = q;
        const g = keep(ctx.createGain());
        g.gain.value = (weights[k] / wSum) * peak;
        this.input.connect(bp);
        bp.connect(g);
        g.connect(wetGain);
        this.modes.push({ bp, g, order: 2 * k + 1 });
      }
    }
  }

  private fbMag(load: number): number {
    return clamp(this.reflection * (0.92 + 0.08 * clamp(load, 0, 1)), 0, MAX_FEEDBACK);
  }

  update(p: EngineFrameParams): void {
    const heat = clamp(0.6 * p.load + 0.4 * p.rpmNorm, 0, 1);
    const scale = 1 + this.thermalSpan * (heat - this.thermalBias);
    if (this.mode === 'delay' && this.delay && this.loopLP && this.fb) {
      setT(this.delay.delayTime, clamp(this.nominalDelay / scale, this.minLoopDelay, this.maxDelayTime), p.now, TC_DELAY);
      setT(this.loopLP.frequency, hzOf(this.lpBase * scale * (1 + 0.35 * p.load), 500, this.fMax), p.now, TC);
      setT(this.fb.gain, -this.fbMag(p.load), p.now, TC);
    } else {
      for (let i = 0; i < this.modes.length; i++) {
        const m = this.modes[i];
        setT(m.bp.frequency, hzOf(this.frequency * m.order * scale, 200, this.fMax), p.now, TC_DELAY);
      }
    }
  }

  dispose(): void {
    for (let i = 0; i < this.nodes.length; i++) {
      try {
        this.nodes[i].disconnect();
      } catch {
        // noop
      }
    }
  }
}

class ExhaustSystem {
  readonly inputs: GainNode[] = [];
  readonly output: GainNode;

  private readonly banks: Waveguide[] = [];
  private readonly transits: Array<{ d: DelayNode; t: number; maxT: number }> = [];
  private readonly collector: Waveguide;
  private readonly mufflerStages: Array<{ delay: DelayNode; branch: GainNode; T: number; maxT: number; taper: number }> = [];
  private readonly packing: BiquadFilterNode;
  private readonly packingBase: number;
  private readonly branchGain: number;
  private readonly drive: GainNode;
  private readonly makeup: GainNode;
  private readonly maxDrive = 4.5;
  private readonly fMax: number;
  private readonly nodes: AudioNode[] = [];

  constructor(ctx: AudioContext, profile: EngineProfile) {
    const sr = fin(ctx.sampleRate, 48000);
    this.fMax = Math.min(F_MAX, 0.49 * sr);
    const ex = profile.exhaust;
    const gTemp = clamp(profile.gasTempFactor, 0.5, 2.5);
    const keep = <T extends AudioNode>(n: T): T => {
      this.nodes.push(n);
      return n;
    };

    const collectorSum = keep(ctx.createGain());
    collectorSum.gain.value = 1 / Math.sqrt(profile.banks.length);

    for (let i = 0; i < profile.banks.length; i++) {
      const len = i === 1 && typeof ex.bankB === 'number' ? ex.bankB : ex.bank;
      const wg = new Waveguide(ctx, len, gTemp, ex.reflection, ex.damping);
      this.banks.push(wg);
      this.inputs.push(wg.input);

      const t = wg.nominalDelay / 2;
      const maxT = Math.max(0.005, t * 2);
      const d = keep(ctx.createDelay(maxT));
      d.delayTime.value = clamp(t, 0, maxT);
      wg.output.connect(d);
      d.connect(collectorSum);
      this.transits.push({ d, t, maxT });
    }

    this.collector = new Waveguide(
      ctx,
      ex.collector,
      gTemp,
      clamp(ex.reflection * 0.7, 0, MAX_FEEDBACK),
      clamp(ex.damping * 1.5, 0.05, 2),
    );
    collectorSum.connect(this.collector.input);

    // Muffler (feedforward expansion chambers)
    const baseDelays = ex.muffler.map((L) => pipeDelay(clamp(L, 0.02, 3), gTemp));
    const delays = decorrelateMufflerDelays(baseDelays, 0.06);
    this.branchGain = clamp(0.55 + 0.3 * clamp(ex.reflection, 0, 1), 0.05, 0.9);
    const maxChamber = Math.max(...ex.muffler);
    this.packingBase = clamp(pipeFrequency(maxChamber, gTemp) * 7, 500, 11000);

    let chain: AudioNode = this.collector.output;
    let peakProd = 1;
    for (let i = 0; i < delays.length; i++) {
      const T = delays[i];
      const sum = keep(ctx.createGain());
      const thru = keep(ctx.createGain());
      const maxT = Math.max(0.005, (T / 0.975) * 1.5);
      const d = keep(ctx.createDelay(maxT));
      d.delayTime.value = clamp(T, 0, maxT);
      const taper = Math.pow(0.92, i);
      const bg = keep(ctx.createGain());
      bg.gain.value = this.branchGain * taper;
      peakProd *= 1 + bg.gain.value;

      chain.connect(thru);
      thru.connect(sum);
      chain.connect(d);
      d.connect(bg);
      bg.connect(sum);
      this.mufflerStages.push({ delay: d, branch: bg, T, maxT, taper });
      chain = sum;
    }

    this.packing = keep(ctx.createBiquadFilter());
    this.packing.type = 'lowpass';
    this.packing.frequency.value = hzOf(this.packingBase, 2000, this.fMax);
    this.packing.Q.value = 0.6;
    const muffTrim = keep(ctx.createGain());
    muffTrim.gain.value = 1 / Math.max(1, peakProd * 0.72);
    chain.connect(this.packing);
    this.packing.connect(muffTrim);

    // Shock-front asymmetric nonlinearity
    this.drive = keep(ctx.createGain());
    this.drive.gain.value = 1.0;
    const span = keep(ctx.createGain());
    span.gain.value = 1 / SHOCK_HEAD;
    const shaper = keep(ctx.createWaveShaper());
    shaper.curve = getShockCurve();
    shaper.oversample = '4x';
    const dcBlock = keep(ctx.createBiquadFilter());
    dcBlock.type = 'highpass';
    dcBlock.frequency.value = 22;
    dcBlock.Q.value = 0.7;
    this.makeup = keep(ctx.createGain());
    this.makeup.gain.value = 1.0;
    this.output = keep(ctx.createGain());

    muffTrim.connect(this.drive);
    this.drive.connect(span);
    span.connect(shaper);
    shaper.connect(dcBlock);
    dcBlock.connect(this.makeup);
    this.makeup.connect(this.output);
  }

  update(p: EngineFrameParams): void {
    const heat = clamp(0.6 * p.load + 0.4 * p.rpmNorm, 0, 1);
    const scale = 1 + 0.05 * (heat - 0.35);
    const muffScale = 1 + 0.025 * (heat - 0.35);

    for (let i = 0; i < this.banks.length; i++) {
      this.banks[i].update(p);
      const tr = this.transits[i];
      setT(tr.d.delayTime, clamp(tr.t / scale, 0, tr.maxT), p.now, TC_DELAY);
    }
    this.collector.update(p);

    for (let i = 0; i < this.mufflerStages.length; i++) {
      const s = this.mufflerStages[i];
      setT(s.delay.delayTime, clamp(s.T / muffScale, 0, s.maxT), p.now, TC_DELAY);
      setT(
        s.branch.gain,
        clamp(this.branchGain * s.taper * (1 - 0.12 * p.load) * (1 - 0.65 * p.valve), 0, 0.95),
        p.now,
        TC,
      );
    }
    setT(
      this.packing.frequency,
      hzOf(this.packingBase * (1 + 0.3 * p.load) * (1 + 1.1 * p.valve) * muffScale, 2000, this.fMax),
      p.now,
      TC,
    );

    const amp = clamp(Math.pow(p.load, 1.5) * (0.55 + 0.45 * p.rpmNorm) + 0.55 * p.boost * p.load, 0, 1.4);
    const od = 0.25 * p.overrun * (0.3 + 0.7 * p.rpmNorm) + 0.22 * p.valve * (0.4 + 0.6 * p.load);
    const d = clamp(1.0 + (this.maxDrive - 1.0) * clamp(amp + od, 0, 1), 0.1, this.maxDrive);
    setT(this.drive.gain, d, p.now, TC);
    setT(this.makeup.gain, clamp(1 / Math.pow(Math.max(0.05, d), 0.7), 0.05, 4), p.now, TC);
  }

  dispose(): void {
    for (let i = 0; i < this.banks.length; i++) this.banks[i].dispose();
    this.collector.dispose();
    for (let i = 0; i < this.nodes.length; i++) {
      try {
        this.nodes[i].disconnect();
      } catch {
        // noop
      }
    }
  }
}

class IntakeResonator {
  readonly input: GainNode;
  readonly output: GainNode;

  private readonly f0: number;
  private readonly q0: number;
  private readonly fMax: number;
  private readonly helm: BiquadFilterNode;
  private readonly helmGain: GainNode;
  private readonly directGain: GainNode;
  private readonly noiseSrc: AudioBufferSourceNode;
  private readonly noiseBP: BiquadFilterNode;
  private readonly noiseGain: GainNode;
  private readonly noiseToHelm: GainNode;
  private readonly nodes: AudioNode[] = [];
  private started = false;

  constructor(ctx: AudioContext, profile: EngineProfile) {
    const sr = fin(ctx.sampleRate, 48000);
    this.fMax = Math.min(F_MAX, 0.49 * sr);
    this.f0 = clamp(profile.intake.helmholtz, F_MIN, 2000);
    this.q0 = clamp(profile.intake.q, 0.3, 30);

    const keep = <T extends AudioNode>(n: T): T => {
      this.nodes.push(n);
      return n;
    };

    this.input = keep(ctx.createGain());
    this.output = keep(ctx.createGain());
    this.output.gain.value = clamp(profile.intake.level, 0, 4);

    this.helm = keep(ctx.createBiquadFilter());
    this.helm.type = 'bandpass';
    this.helm.frequency.value = hzOf(this.f0, 110, this.fMax);
    this.helm.Q.value = this.q0;
    this.helmGain = keep(ctx.createGain());
    this.helmGain.gain.value = 0;
    this.input.connect(this.helm);
    this.helm.connect(this.helmGain);
    this.helmGain.connect(this.output);

    const directLP = keep(ctx.createBiquadFilter());
    directLP.type = 'lowpass';
    directLP.frequency.value = hzOf(this.f0 * 4, 440, this.fMax);
    directLP.Q.value = 0.7;
    this.directGain = keep(ctx.createGain());
    this.directGain.gain.value = 0;
    this.input.connect(directLP);
    directLP.connect(this.directGain);
    this.directGain.connect(this.output);

    this.noiseSrc = keep(ctx.createBufferSource());
    this.noiseSrc.buffer = sharedNoise(ctx, 'pink');
    this.noiseSrc.loop = true;
    const noiseHP = keep(ctx.createBiquadFilter());
    noiseHP.type = 'highpass';
    noiseHP.frequency.value = hzOf(this.f0 * 0.8, 80, this.fMax);
    this.noiseBP = keep(ctx.createBiquadFilter());
    this.noiseBP.type = 'bandpass';
    this.noiseBP.frequency.value = hzOf(this.f0 * 3, 330, this.fMax);
    this.noiseBP.Q.value = 0.9;
    this.noiseGain = keep(ctx.createGain());
    this.noiseGain.gain.value = 0;
    this.noiseToHelm = keep(ctx.createGain());
    this.noiseToHelm.gain.value = 0;

    this.noiseSrc.connect(noiseHP);
    noiseHP.connect(this.noiseBP);
    this.noiseBP.connect(this.noiseGain);
    this.noiseGain.connect(this.output);
    noiseHP.connect(this.noiseToHelm);
    this.noiseToHelm.connect(this.helm);
  }

  start(when: number): void {
    if (this.started) return;
    this.started = true;
    try {
      this.noiseSrc.start(when, 0.41);
    } catch {
      // noop
    }
  }

  update(p: EngineFrameParams): void {
    const excite = Math.pow(Math.max(p.load, 1e-3), 0.7);
    const flow = clamp(p.throttle * (0.25 + 0.75 * p.rpmNorm), 0, 1);
    const coast = clamp(p.overrun * (0.15 + 0.85 * p.rpmNorm), 0, 1);

    setT(this.helm.Q, clamp(this.q0 * (0.55 + 0.45 * p.throttle), 0.3, 30), p.now, 0.05);
    setT(this.helmGain.gain, clamp((0.12 + 0.88 * excite) * (0.35 + 0.65 * p.rpmNorm), 0, 4), p.now, TC);
    setT(this.directGain.gain, clamp(0.3 * (0.2 + 0.8 * excite), 0, 4), p.now, TC);
    setT(this.noiseBP.frequency, hzOf(this.f0 * (3 + 9 * flow) * (1 + 0.6 * coast), 400, this.fMax), p.now, TC);
    setT(this.noiseBP.Q, clamp(0.9 + 0.7 * flow, 0.3, 6), p.now, 0.05);
    setT(this.noiseGain.gain, clamp(0.42 * Math.pow(flow, 1.2) + 0.16 * coast, 0, 4), p.now, TC);
    setT(this.noiseToHelm.gain, clamp(0.2 * flow + 0.05 * coast, 0, 2), p.now, TC);
  }

  dispose(): void {
    try {
      if (this.started) this.noiseSrc.stop();
    } catch {
      // noop
    }
    for (let i = 0; i < this.nodes.length; i++) {
      try {
        this.nodes[i].disconnect();
      } catch {
        // noop
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Camadas de caráter + banco de estouros de escapamento (character.js / layers.js)
// ---------------------------------------------------------------------------

class ExhaustNoiseLayer {
  readonly output: GainNode;
  private readonly pulseOrder: number;
  private readonly src: AudioBufferSourceNode;
  private readonly hp: BiquadFilterNode;
  private readonly peak: BiquadFilterNode;
  private readonly body: BiquadFilterNode;
  private readonly level: GainNode;
  private readonly pulse: OscillatorNode;
  private readonly pulseDepth: GainNode;
  private readonly nodes: AudioNode[] = [];
  private started = false;

  constructor(ctx: AudioContext, profile: EngineProfile) {
    this.pulseOrder = Math.max(0.5, profile.cylinders / 2 / Math.max(1, profile.banks.length));
    const keep = <T extends AudioNode>(n: T): T => {
      this.nodes.push(n);
      return n;
    };

    this.src = keep(ctx.createBufferSource());
    this.src.buffer = sharedNoise(ctx, 'white');
    this.src.loop = true;

    this.hp = keep(ctx.createBiquadFilter());
    this.hp.type = 'highpass';
    this.hp.frequency.value = 55;

    this.peak = keep(ctx.createBiquadFilter());
    this.peak.type = 'peaking';
    this.peak.frequency.value = 140;
    this.peak.Q.value = 1.4;
    this.peak.gain.value = 7;

    this.body = keep(ctx.createBiquadFilter());
    this.body.type = 'lowpass';
    this.body.frequency.value = 900;
    this.body.Q.value = 0.9;

    this.level = keep(ctx.createGain());
    this.level.gain.value = 0;

    this.pulse = keep(ctx.createOscillator());
    this.pulse.type = 'sawtooth';
    this.pulse.frequency.value = 40;
    this.pulseDepth = keep(ctx.createGain());
    this.pulseDepth.gain.value = 0;

    this.output = keep(ctx.createGain());

    this.src.connect(this.hp);
    this.hp.connect(this.peak);
    this.peak.connect(this.body);
    this.body.connect(this.level);
    this.level.connect(this.output);
    this.pulse.connect(this.pulseDepth);
    this.pulseDepth.connect(this.level.gain);
  }

  start(when: number): void {
    if (this.started) return;
    this.started = true;
    try {
      this.src.start(when, 0.73);
      this.pulse.start(when);
    } catch {
      // noop
    }
  }

  update(p: EngineFrameParams): void {
    const fire = clamp(p.f0 * this.pulseOrder * 2, 10, 6000);
    const flow = 0.3 + 0.7 * p.load;
    const lvl = 0.28 * flow * (0.25 + 0.75 * p.rpmNorm) * (1 + 0.35 * p.overrun);
    setT(this.level.gain, lvl, p.now, TC);
    setT(this.pulse.frequency, fire, p.now, TC);
    setT(this.pulseDepth.gain, Math.min(lvl * 0.85, lvl * (1.1 - 0.7 * p.rpmNorm)), p.now, TC);
    setT(this.peak.frequency, clamp(fire, 30, 2000), p.now, TC);
    setT(this.body.frequency, clamp(450 + 2600 * p.load + 1800 * p.rpmNorm, 120, 9000), p.now, TC);
    setT(this.hp.frequency, clamp(40 + 30 * p.rpmNorm, 20, 400), p.now, TC);
  }

  dispose(): void {
    if (this.started) {
      try {
        this.src.stop();
      } catch {
        // noop
      }
      try {
        this.pulse.stop();
      } catch {
        // noop
      }
    }
    for (let i = 0; i < this.nodes.length; i++) {
      try {
        this.nodes[i].disconnect();
      } catch {
        // noop
      }
    }
  }
}

class SubBassLayer {
  readonly output: GainNode;
  private readonly order: number;
  private readonly osc: OscillatorNode;
  private readonly tone: BiquadFilterNode;
  private readonly level: GainNode;
  private readonly nodes: AudioNode[] = [];
  private started = false;

  constructor(ctx: AudioContext, profile: EngineProfile) {
    let order = Math.max(0.5, profile.cylinders / 4);
    const fMid = (profile.idleRpm + profile.redlineRpm) / 2 / 120;
    while (order * fMid < 38 && order < 8) order *= 2;
    while (order * fMid > 85 && order > 0.5) order /= 2;
    this.order = order;

    const keep = <T extends AudioNode>(n: T): T => {
      this.nodes.push(n);
      return n;
    };
    this.osc = keep(ctx.createOscillator());
    this.osc.type = 'sine';
    this.osc.frequency.value = 40;
    const shaper = keep(ctx.createWaveShaper());
    shaper.curve = getSubCurve();
    shaper.oversample = '2x';
    this.tone = keep(ctx.createBiquadFilter());
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 220;
    this.tone.Q.value = 0.7;
    this.level = keep(ctx.createGain());
    this.level.gain.value = 0;
    this.output = keep(ctx.createGain());
    this.output.gain.value = 0.3;

    this.osc.connect(shaper);
    shaper.connect(this.tone);
    this.tone.connect(this.level);
    this.level.connect(this.output);
  }

  start(when: number): void {
    if (this.started) return;
    this.started = true;
    try {
      this.osc.start(when);
    } catch {
      // noop
    }
  }

  update(p: EngineFrameParams): void {
    setT(this.osc.frequency, clamp(p.f0 * this.order, 12, 400), p.now, TC);
    const lvl =
      0.34 *
      (0.18 + 0.82 * Math.pow(p.load, 0.75)) *
      (1 - 0.45 * p.rpmNorm) *
      (1 - 0.6 * p.overrun) *
      (1 + 0.25 * p.boost);
    setT(this.level.gain, lvl, p.now, TC);
    setT(this.tone.frequency, clamp(150 + 260 * p.load, 80, 800), p.now, TC);
  }

  dispose(): void {
    if (this.started) {
      try {
        this.osc.stop();
      } catch {
        // noop
      }
    }
    for (let i = 0; i < this.nodes.length; i++) {
      try {
        this.nodes[i].disconnect();
      } catch {
        // noop
      }
    }
  }
}

interface PopVoice {
  src: AudioBufferSourceNode;
  bpA: BiquadFilterNode;
  bpB: BiquadFilterNode;
  mixB: GainNode;
  gain: GainNode;
  busyUntil: number;
}

class ExhaustPopBank {
  readonly combustionOutput: GainNode;
  private readonly voices: PopVoice[] = [];
  private readonly nodes: AudioNode[] = [];
  private readonly rnd: () => number;
  private readonly sizeF: number;
  private readonly sizeA: number;
  private readonly burstCount: number;
  private readonly cyl: number;
  private readonly idleRpm: number;
  private cursor = 0;
  private nextOverrunPop = 0;
  private started = false;
  private readonly ctx: AudioContext;

  constructor(ctx: AudioContext, profile: EngineProfile, poolSize = 8) {
    this.ctx = ctx;
    this.rnd = seeded(0x2545f491 ^ (profile.cylinders * 131));
    this.cyl = profile.cylinders;
    this.idleRpm = profile.idleRpm;
    this.sizeF = Math.pow(6 / this.cyl, 0.35);
    this.sizeA = Math.pow(this.cyl / 6, 0.3);
    this.burstCount = clamp(1 + Math.round(this.cyl / 5), 1, 3);

    const keep = <T extends AudioNode>(n: T): T => {
      this.nodes.push(n);
      return n;
    };

    this.combustionOutput = keep(ctx.createGain());
    this.combustionOutput.gain.value = 9.0;

    for (let i = 0; i < poolSize; i++) {
      const src = keep(ctx.createBufferSource());
      src.buffer = sharedNoise(ctx, 'white');
      src.loop = true;

      const bpA = keep(ctx.createBiquadFilter());
      bpA.type = 'bandpass';
      bpA.frequency.value = 112;
      bpA.Q.value = 1.6;

      const bpB = keep(ctx.createBiquadFilter());
      bpB.type = 'bandpass';
      bpB.frequency.value = 680;
      bpB.Q.value = 2.0;

      const mixB = keep(ctx.createGain());
      mixB.gain.value = 0.58;

      const gain = keep(ctx.createGain());
      gain.gain.value = 0;

      src.connect(bpA);
      src.connect(bpB);
      bpA.connect(gain);
      bpB.connect(mixB);
      mixB.connect(gain);
      gain.connect(this.combustionOutput);

      this.voices.push({ src, bpA, bpB, mixB, gain, busyUntil: -1 });
    }
  }

  start(when: number): void {
    if (this.started) return;
    this.started = true;
    for (let i = 0; i < this.voices.length; i++) {
      try {
        this.voices[i].src.start(when, (i * 0.217) % 1.85);
      } catch {
        // noop
      }
    }
  }

  trigger(kind: 'bang' | 'crackle', time: number, amp: number, fScale: number, decScale: number): void {
    const now = fin(this.ctx.currentTime, 0);
    const t = Math.max(fin(time, now), now + LOOKAHEAD);
    const isBang = kind === 'bang';
    const fA = isBang ? 112 : 700;
    const qA = isBang ? 1.6 : 3.0;
    const fB = isBang ? 680 : 1850;
    const qB = isBang ? 2.0 : 3.6;
    const mixBVal = isBang ? 0.58 : 0.62;
    const atk = isBang ? 0.005 : 0.003;
    const baseDec = isBang ? 0.19 : 0.055;
    const lvl = isBang ? 1.0 : 0.5;

    const peak = clamp(amp * lvl, 0.0008, 3.2);
    const fs = clamp(fScale, 0.2, 5);
    const dec = clamp(baseDec * clamp(decScale, 0.2, 4), 0.004, 1.2);
    const end = t + atk + dec + 0.002;

    const n = this.voices.length;
    let idx = -1;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % n;
      if (this.voices[i].busyUntil <= t) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      let best = 0;
      for (let i = 1; i < n; i++) {
        if (this.voices[i].busyUntil < this.voices[best].busyUntil) best = i;
      }
      idx = best;
    }
    this.cursor = (idx + 1) % n;
    const v = this.voices[idx];

    v.bpA.frequency.cancelScheduledValues(t);
    v.bpA.frequency.setValueAtTime(hzOf(fA * fs, 112), t);
    v.bpA.Q.setValueAtTime(qA, t);
    v.bpB.frequency.cancelScheduledValues(t);
    v.bpB.frequency.setValueAtTime(hzOf(fB * fs, 680), t);
    v.bpB.Q.setValueAtTime(qB, t);
    v.mixB.gain.cancelScheduledValues(t);
    v.mixB.gain.setValueAtTime(mixBVal, t);

    const g = v.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0004, t);
    g.linearRampToValueAtTime(peak, t + atk);
    g.exponentialRampToValueAtTime(0.0004, t + atk + dec);
    g.setValueAtTime(0, end);
    v.busyUntil = end;
  }

  update(p: EngineFrameParams, allowOverrunCrackle: boolean): void {
    const now = p.now;
    let budget = 8;

    // Corte de giro / troca de marcha
    if (p.evCut > 0 && budget > 0) {
      const count = Math.min(budget, this.burstCount);
      let t = now + LOOKAHEAD + this.rnd() * 0.008;
      for (let i = 0; i < count; i++) {
        const fall = Math.pow(0.72, i) * (0.55 + 0.65 * this.rnd());
        const amp = clamp(0.65 * p.evCut * this.sizeA * fall * (0.55 + 0.65 * p.rpmNorm), 0.001, 1.4);
        this.trigger(i === 0 ? 'bang' : this.rnd() < 0.45 ? 'bang' : 'crackle', t, amp, this.sizeF * (0.75 + 0.55 * this.rnd()), 0.7 + 0.7 * this.rnd());
        t += 0.014 + this.rnd() * 0.044;
        budget--;
      }
    }

    // Estouro deliberado (nitro, lift-off em alta rotação)
    if (p.evPop > 0 && budget > 0) {
      const count = Math.min(budget, p.evPop > 0.75 ? 2 : 1);
      let t = now + LOOKAHEAD + this.rnd() * 0.006;
      for (let i = 0; i < count; i++) {
        const fall = Math.pow(0.82, i) * (0.7 + 0.55 * this.rnd());
        const amp = clamp(1.45 * p.evPop * this.sizeA * fall * (0.6 + 0.55 * p.rpmNorm), 0.001, 1.9);
        this.trigger(i === 0 ? 'bang' : 'crackle', t, amp, this.sizeF * (0.65 + 0.6 * this.rnd()), 0.75 + 0.75 * this.rnd());
        t += 0.042 + this.rnd() * 0.085;
        budget--;
      }
    }

    // Estalos sutis de overrun no escapamento quente (tunado)
    if (!allowOverrunCrackle || p.overrun < 0.35 || p.rpm < this.idleRpm * 2.2) {
      this.nextOverrunPop = now;
      return;
    }
    if (this.nextOverrunPop < now) this.nextOverrunPop = now + 0.03 + this.rnd() * 0.06;
    const horizon = now + 0.1;
    while (this.nextOverrunPop < horizon && budget > 0) {
      const t = Math.max(this.nextOverrunPop, now + LOOKAHEAD);
      const amp = clamp(0.32 * p.overrun * this.sizeA * (0.35 + 1.2 * this.rnd() * this.rnd()) * (0.45 + 0.55 * p.rpmNorm), 0.001, 1.0);
      this.trigger(this.rnd() < 0.35 ? 'bang' : 'crackle', t, amp, this.sizeF * (0.72 + 0.8 * this.rnd()), 0.65 + 0.75 * this.rnd());
      this.nextOverrunPop = t + 0.09 + 0.35 * this.rnd() * this.rnd();
      budget--;
    }
    if (this.nextOverrunPop < now) this.nextOverrunPop = now;
  }

  dispose(): void {
    if (this.started) {
      for (let i = 0; i < this.voices.length; i++) {
        try {
          this.voices[i].src.stop();
        } catch {
          // noop
        }
      }
    }
    for (let i = 0; i < this.nodes.length; i++) {
      try {
        this.nodes[i].disconnect();
      } catch {
        // noop
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Voz completa de motor de carro (Engine Sim) + Telemetria de marchas/RPM
// ---------------------------------------------------------------------------

interface WaveOscPair {
  softOsc: OscillatorNode;
  softGain: GainNode;
  hardOsc: OscillatorNode;
  hardGain: GainNode;
}

export class CarEngineVoice {
  readonly output: GainNode;
  readonly profile: EngineProfile;

  private readonly ctx: AudioContext;
  private readonly exhaust: ExhaustSystem;
  private readonly intake: IntakeResonator;
  private readonly exhaustNoise: ExhaustNoiseLayer;
  private readonly sub: SubBassLayer;
  private readonly pops: ExhaustPopBank;
  private readonly cabinLP: BiquadFilterNode;
  private readonly cabinBoom: BiquadFilterNode;
  private readonly cabinTrim: GainNode;
  private readonly bovBP: BiquadFilterNode;
  private readonly bovGain: GainNode;
  private readonly bovNoise: AudioBufferSourceNode;
  private readonly masterGain: GainNode;
  private readonly bankGates: GainNode[] = [];
  private readonly wavePairs: WaveOscPair[] = [];
  private readonly nodes: AudioNode[] = [];

  private workletNode: AudioWorkletNode | null = null;
  private workletRequested = false;
  private started = false;
  private disposed = false;
  private bark = 0;
  private prevLoad = 0;
  private lastBov = -10;
  private readonly isTuned: boolean;

  constructor(ctx: AudioContext, profileId: EngineProfileId, destination: AudioNode) {
    this.ctx = ctx;
    this.profile = ENGINE_PROFILES[profileId];
    this.isTuned = profileId === 'v8cross';

    const keep = <T extends AudioNode>(n: T): T => {
      this.nodes.push(n);
      return n;
    };

    const mixBus = keep(ctx.createGain());
    mixBus.gain.value = 0.85;

    // Estágio de timbre do Engine Sim (guarda infrassônica, corpo, presença, limite suave)
    const infra = keep(ctx.createBiquadFilter());
    infra.type = 'highpass';
    infra.frequency.value = 36;
    infra.Q.value = 0.7;

    const rumbleShelf = keep(ctx.createBiquadFilter());
    rumbleShelf.type = 'lowshelf';
    rumbleShelf.frequency.value = 145;
    rumbleShelf.gain.value = this.isTuned ? 3.2 : 1.8;

    const bodyBump = keep(ctx.createBiquadFilter());
    bodyBump.type = 'peaking';
    bodyBump.frequency.value = 78;
    bodyBump.Q.value = 1.0;
    bodyBump.gain.value = this.isTuned ? 2.4 : 1.2;

    const presence = keep(ctx.createBiquadFilter());
    presence.type = 'peaking';
    presence.frequency.value = 3000;
    presence.Q.value = 0.85;
    presence.gain.value = -1.5;

    const airCut = keep(ctx.createBiquadFilter());
    airCut.type = 'highshelf';
    airCut.frequency.value = 2900;
    airCut.gain.value = -2.0;

    // CabinFilter (exterior ↔ interior contínuo)
    this.cabinBoom = keep(ctx.createBiquadFilter());
    this.cabinBoom.type = 'peaking';
    this.cabinBoom.frequency.value = 62;
    this.cabinBoom.Q.value = 3.0;
    this.cabinBoom.gain.value = 0;

    this.cabinLP = keep(ctx.createBiquadFilter());
    this.cabinLP.type = 'lowpass';
    this.cabinLP.frequency.value = 16000;
    this.cabinLP.Q.value = 0.6;

    this.cabinTrim = keep(ctx.createGain());
    this.cabinTrim.gain.value = 1;

    const limiter = keep(ctx.createDynamicsCompressor());
    limiter.threshold.value = -2.5;
    limiter.knee.value = 5;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.14;

    this.masterGain = keep(ctx.createGain());
    this.masterGain.gain.value = 0.0001;
    this.output = this.masterGain;

    mixBus.connect(infra);
    infra.connect(rumbleShelf);
    rumbleShelf.connect(bodyBump);
    bodyBump.connect(presence);
    presence.connect(airCut);
    airCut.connect(this.cabinBoom);
    this.cabinBoom.connect(this.cabinLP);
    this.cabinLP.connect(this.cabinTrim);
    this.cabinTrim.connect(limiter);
    limiter.connect(this.masterGain);
    this.masterGain.connect(destination);

    // Ressonadores físicos
    this.exhaust = new ExhaustSystem(ctx, this.profile);
    this.exhaust.output.connect(mixBus);

    this.intake = new IntakeResonator(ctx, this.profile);
    this.intake.output.connect(mixBus);

    this.exhaustNoise = new ExhaustNoiseLayer(ctx, this.profile);
    for (let i = 0; i < this.exhaust.inputs.length; i++) {
      this.exhaustNoise.output.connect(this.exhaust.inputs[i]);
    }

    this.sub = new SubBassLayer(ctx, this.profile);
    this.sub.output.connect(mixBus);

    // Banco de estouros desativado (motor contínuo sem estalos/pipocos/backfire no escapamento)
    this.pops = new ExhaustPopBank(ctx, this.profile, 1);
    const popSend = keep(ctx.createGain());
    popSend.gain.value = 0;
    const popDirect = keep(ctx.createGain());
    popDirect.gain.value = 0;
    this.pops.combustionOutput.connect(popSend);
    for (let i = 0; i < this.exhaust.inputs.length; i++) {
      popSend.connect(this.exhaust.inputs[i]);
    }
    this.pops.combustionOutput.connect(popDirect);
    popDirect.connect(mixBus);

    // Blow-off valve ("chiu") ao aliviar acelerador/nitro com boost (tunado)
    this.bovNoise = keep(ctx.createBufferSource());
    this.bovNoise.buffer = sharedNoise(ctx, 'white');
    this.bovNoise.loop = true;
    this.bovBP = keep(ctx.createBiquadFilter());
    this.bovBP.type = 'bandpass';
    this.bovBP.frequency.value = 2400;
    this.bovBP.Q.value = 6.5;
    this.bovGain = keep(ctx.createGain());
    this.bovGain.gain.value = 0;
    this.bovNoise.connect(this.bovBP);
    this.bovBP.connect(this.bovGain);
    this.bovGain.connect(mixBus);

    // Portões de banco + osciladores PeriodicWave (fallback imediato e síncrono)
    const waves = buildEngineWaves(ctx, this.profile);
    for (let i = 0; i < waves.banks.length; i++) {
      const gate = keep(ctx.createGain());
      gate.gain.value = 1;
      gate.connect(this.exhaust.inputs[i]);
      this.bankGates.push(gate);
      this.wavePairs.push(this.makeWavePair(waves.banks[i].soft, waves.banks[i].hard, gate));
    }
    this.wavePairs.push(this.makeWavePair(waves.intake.soft, waves.intake.hard, this.intake.input));
  }

  private makeWavePair(soft: PeriodicWave, hard: PeriodicWave, dest: AudioNode): WaveOscPair {
    const softOsc = this.ctx.createOscillator();
    softOsc.setPeriodicWave(soft);
    softOsc.detune.value = -3;
    const softGain = this.ctx.createGain();
    softGain.gain.value = 0;
    softOsc.connect(softGain);
    softGain.connect(dest);

    const hardOsc = this.ctx.createOscillator();
    hardOsc.setPeriodicWave(hard);
    hardOsc.detune.value = 3;
    const hardGain = this.ctx.createGain();
    hardGain.gain.value = 0;
    hardOsc.connect(hardGain);
    hardGain.connect(dest);

    this.nodes.push(softOsc, softGain, hardOsc, hardGain);
    return { softOsc, softGain, hardOsc, hardGain };
  }

  private upgradeToWorklet(): void {
    if (this.disposed || this.workletNode || !WORKLET_READY.has(this.ctx) || typeof AudioWorkletNode === 'undefined') {
      return;
    }
    try {
      const spec = combustionSpec(this.profile);
      const node = new AudioWorkletNode(this.ctx, 'engine-combustion', {
        numberOfInputs: 0,
        numberOfOutputs: spec.outputs,
        outputChannelCount: new Array(spec.outputs).fill(1),
        processorOptions: spec,
      });
      for (let i = 0; i < this.bankGates.length; i++) {
        node.connect(this.bankGates[i], i);
      }
      node.connect(this.intake.input, this.bankGates.length);
      this.workletNode = node;

      // Silencia os pares PeriodicWave suavemente ao trocar para o AudioWorklet evento-a-evento
      const now = fin(this.ctx.currentTime, 0);
      for (let i = 0; i < this.wavePairs.length; i++) {
        this.wavePairs[i].softGain.gain.setTargetAtTime(0, now, 0.03);
        this.wavePairs[i].hardGain.gain.setTargetAtTime(0, now, 0.03);
      }
    } catch {
      // Mantém wavetables PeriodicWave
    }
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    const t = fin(this.ctx.currentTime, 0) + 0.015;
    for (let i = 0; i < this.wavePairs.length; i++) {
      try {
        this.wavePairs[i].softOsc.start(t);
        this.wavePairs[i].hardOsc.start(t);
      } catch {
        // noop
      }
    }
    this.intake.start(t);
    this.exhaustNoise.start(t);
    this.sub.start(t);
    this.pops.start(t);
    try {
      this.bovNoise.start(t, 1.13);
    } catch {
      // noop
    }

    if (!this.workletRequested) {
      this.workletRequested = true;
      preloadCombustionWorklet(this.ctx).then((ok) => {
        if (ok && !this.disposed) this.upgradeToWorklet();
      });
    }
  }

  private fireBov(now: number, strength: number): void {
    if (!this.isTuned || now - this.lastBov < 0.36) return;
    this.lastBov = now;
    const t = now + LOOKAHEAD;
    const amp = clamp(0.18 * strength, 0.02, 0.24);
    const dur = 0.18 + 0.14 * clamp(strength, 0, 1);

    this.bovBP.frequency.cancelScheduledValues(t);
    this.bovBP.frequency.setTargetAtTime(2400 + 800 * strength, t, 0.015);
    this.bovBP.frequency.setTargetAtTime(680, t + 0.03, dur * 0.38);

    this.bovGain.gain.cancelScheduledValues(t);
    this.bovGain.gain.setTargetAtTime(amp, t, 0.022);
    this.bovGain.gain.setTargetAtTime(0.0001, t + 0.055, dur * 0.32);
  }

  update(p: EngineFrameParams, activeLevel: number): void {
    if (this.disposed) return;
    if (!this.started) this.start();

    const now = p.now;
    const level = clamp(activeLevel, 0, 1);
    setT(this.masterGain.gain, level > 0.001 ? level : 0.0001, now, level > 0.001 ? 0.06 : 0.08);

    if (level <= 0.001) {
      if (this.workletNode) {
        const ampParam = this.workletNode.parameters.get('amp');
        setT(ampParam, 0, now, 0.05);
      }
      return;
    }

    if (p.dt > 0) {
      const rise = (p.load - this.prevLoad) / p.dt;
      this.bark = Math.max(this.bark * Math.exp(-p.dt / 0.18), clamp(rise / 14, 0, 0.6));
    }
    this.prevLoad = p.load;

    const f0 = clamp(p.f0, 4, 400);
    const x = clamp(p.load + 0.18 * this.bark, 0, 1);
    // Sem cortes secos de ignição: ganho contínuo com rampa curta nas trocas de marcha
    const ampl =
      (1 + 0.16 * this.bark) *
      (0.34 + 0.66 * Math.pow(x, 0.7)) *
      (0.45 + 0.55 * p.rpmNorm) *
      (1 - 0.34 * p.overrun) *
      (1 + 0.2 * p.boost) *
      this.profile.voice;

    if (this.workletNode) {
      const P = this.workletNode.parameters;
      setT(P.get('f0'), f0, now, TC);
      setT(P.get('load'), x, now, TC_GAIN);
      setT(P.get('amp'), ampl, now, TC_GAIN);
      setT(P.get('rough'), p.rough, now, 0.06);
      setT(P.get('ripple'), crankRipple(this.profile, p.rpm, x), now, TC);
      setT(P.get('low'), 1 - p.rpmNorm, now, TC);
    } else {
      const gSoft = Math.cos((x * Math.PI) / 2) * ampl;
      const gHard = Math.sin((x * Math.PI) / 2) * ampl;
      for (let i = 0; i < this.wavePairs.length; i++) {
        const pair = this.wavePairs[i];
        setT(pair.softOsc.frequency, f0, now, TC);
        setT(pair.hardOsc.frequency, f0, now, TC);
        setT(pair.softGain.gain, gSoft, now, TC_GAIN);
        setT(pair.hardGain.gain, gHard, now, TC_GAIN);
      }
    }

    // Perspectiva exterior (0) ↔ cabine (1)
    const cab = clamp(p.cabinPos, 0, 1);
    const lpHz = 16000 * Math.pow(1150 / 16000, cab);
    setT(this.cabinLP.frequency, lpHz, now, 0.06);
    setT(this.cabinBoom.gain, 5.5 * cab, now, 0.06);
    setT(this.cabinTrim.gain, Math.pow(10, (-4.0 * cab) / 20), now, 0.06);

    this.exhaust.update(p);
    this.intake.update(p);
    this.exhaustNoise.update(p);
    this.sub.update(p);

    if (p.evBov > 0.2) {
      this.fireBov(now, p.evBov);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage('stop');
        this.workletNode.disconnect();
      } catch {
        // noop
      }
      this.workletNode = null;
    }
    if (this.started) {
      for (let i = 0; i < this.wavePairs.length; i++) {
        try {
          this.wavePairs[i].softOsc.stop();
        } catch {
          // noop
        }
        try {
          this.wavePairs[i].hardOsc.stop();
        } catch {
          // noop
        }
      }
      try {
        this.bovNoise.stop();
      } catch {
        // noop
      }
    }
    this.exhaust.dispose();
    this.intake.dispose();
    this.exhaustNoise.dispose();
    this.sub.dispose();
    this.pops.dispose();
    for (let i = 0; i < this.nodes.length; i++) {
      try {
        this.nodes[i].disconnect();
      } catch {
        // noop
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Telemetria virtual de marchas, RPM, carga, corte de giro e nitro
// (lê apenas velocidade/acelerador/nitro, sem tocar na física de car.ts)
// ---------------------------------------------------------------------------

const HATCH_GEAR_MAX_SPEED = [11.5, 19.5, 28.5, 37.5, 46.5] as const;
const TUNED_GEAR_MAX_SPEED = [14.0, 23.0, 33.0, 44.0, 55.0, 66.5] as const;

export class CarDrivetrainTelemetry {
  gear = 1;
  rpm: number;
  boost = 0;
  private shiftCooldown = 0;
  private shiftBlend = 0;
  private smoothLoad = 0.1;
  private smoothOverrun = 0;
  private prevThrottle = 0;
  private prevNitro = false;
  private prevBoost = 0;
  private readonly profile: EngineProfile;
  private readonly gearTopSpeeds: readonly number[];
  private readonly isTuned: boolean;

  /** Objeto reutilizado todo quadro — zero alocação. */
  readonly params: EngineFrameParams = {
    now: 0,
    dt: 0,
    rpm: 800,
    rpmNorm: 0,
    f0: 6.7,
    load: 0.1,
    throttle: 0,
    overrun: 0,
    boost: 0,
    valve: 0,
    rough: 0,
    limiterCut: 0,
    evPop: 0,
    evCut: 0,
    evBov: 0,
    cabinPos: 0,
  };

  constructor(profileId: EngineProfileId) {
    this.profile = ENGINE_PROFILES[profileId];
    this.isTuned = profileId === 'v8cross';
    this.gearTopSpeeds = this.isTuned ? TUNED_GEAR_MAX_SPEED : HATCH_GEAR_MAX_SPEED;
    this.rpm = this.profile.idleRpm;
    this.params.rpm = this.rpm;
    this.params.f0 = this.rpm / 120;
  }

  reset(): void {
    this.gear = 1;
    this.rpm = this.profile.idleRpm;
    this.boost = 0;
    this.shiftCooldown = 0;
    this.shiftBlend = 0;
    this.smoothLoad = 0.1;
    this.smoothOverrun = 0;
    this.prevThrottle = 0;
    this.prevNitro = false;
    this.prevBoost = 0;
  }

  step(
    now: number,
    dt: number,
    speedMs: number,
    throttleIn: number,
    nitroActive: boolean,
    cabinPos: number,
  ): EngineFrameParams {
    const safeDt = clamp(fin(dt, 0.016), 0.001, 0.1);
    const speed = Math.max(0, fin(speedMs, 0));
    const throttle = clamp(fin(throttleIn, 0), 0, 1);
    const idle = this.profile.idleRpm;
    const redline = this.profile.redlineRpm;
    const span = redline - idle;

    let evBov = 0;

    if (this.shiftCooldown > 0) this.shiftCooldown = Math.max(0, this.shiftCooldown - safeDt);
    this.shiftBlend *= Math.exp(-safeDt / 0.065);
    if (this.shiftBlend < 0.002) this.shiftBlend = 0;

    // Seleção de marcha com histerese (rampa curta de carga, sem corte seco de ignição nem estalo)
    const maxGear = this.gearTopSpeeds.length;
    const gearTop = this.gearTopSpeeds[this.gear - 1];
    const upshiftSpeed = gearTop * (nitroActive ? 0.96 : 0.91);
    const downshiftSpeed = this.gear > 1 ? this.gearTopSpeeds[this.gear - 2] * 0.72 : -1;

    if (this.shiftCooldown <= 0) {
      if (this.gear < maxGear && speed > upshiftSpeed && throttle > 0.15) {
        this.gear++;
        this.shiftCooldown = 0.24;
        this.shiftBlend = 1;
        if (this.isTuned && this.boost > 0.4) evBov = Math.max(evBov, this.boost * 0.55);
      } else if (this.gear > 1 && speed < downshiftSpeed) {
        this.gear--;
        this.shiftCooldown = 0.22;
      }
    }

    // RPM alvo pela relação da marcha atual + giro livre na arrancada (sem corte serrilhado no redline)
    const curTop = this.gearTopSpeeds[this.gear - 1];
    const prevTop = this.gear > 1 ? this.gearTopSpeeds[this.gear - 2] * 0.56 : 0;
    const wheelNorm = clamp((speed - prevTop * 0.45) / Math.max(4, curTop - prevTop * 0.45), 0, 1.0);
    const launchSlip = speed < 5 ? throttle * (1 - speed / 5) * (this.isTuned ? 0.38 : 0.28) : 0;
    const nitroLift = this.isTuned && nitroActive ? 0.1 : 0;
    const targetRpm = clamp(idle + span * (wheelNorm * 0.96 + launchSlip + nitroLift), idle, redline);

    const tau = targetRpm > this.rpm ? (this.isTuned ? 0.075 : 0.085) : 0.13;
    this.rpm += (targetRpm - this.rpm) * (1 - Math.exp(-safeDt / tau));
    const rpmNorm = clamp((this.rpm - idle) / span, 0, 1);

    // Pressão de turbo / nitro suave no tunado
    const boostTarget = this.isTuned
      ? clamp((nitroActive ? 1.0 : throttle * (0.25 + 0.75 * rpmNorm)) * (1 - 0.35 * this.shiftBlend), 0, 1)
      : 0;
    const boostTau = boostTarget > this.boost ? 0.18 : 0.32;
    this.boost += (boostTarget - this.boost) * (1 - Math.exp(-safeDt / boostTau));

    // Sopro suave de válvula BOV ao aliviar nitro/acelerador com boost (sem estouro/backfire)
    if (this.isTuned && !nitroActive && this.prevNitro && rpmNorm > 0.35) {
      evBov = Math.max(evBov, 0.7);
    }
    const lifted = this.prevThrottle > 0.55 && throttle < 0.12;
    if (this.isTuned && lifted && rpmNorm > 0.46 && this.prevBoost > 0.35) {
      evBov = Math.max(evBov, clamp(this.prevBoost * 0.75, 0.25, 0.8));
    }

    // Rampas curtas de carga e overrun evitam cliques ao soltar o acelerador ou trocar de marcha
    const overrunTarget = throttle < 0.08 && speed > 4 ? clamp((rpmNorm - 0.15) / 0.65, 0, 1) : 0;
    const rampAlpha = 1 - Math.exp(-safeDt / 0.05);
    this.smoothOverrun += (overrunTarget - this.smoothOverrun) * rampAlpha;

    const rawLoad =
      clamp(throttle * (0.35 + 0.65 * (0.4 + 0.6 * rpmNorm)) + (nitroActive ? 0.28 : 0), 0.08, 1) *
      (1 - 0.55 * this.smoothOverrun) *
      (1 - 0.22 * this.shiftBlend);
    this.smoothLoad += (rawLoad - this.smoothLoad) * rampAlpha;

    this.prevThrottle = throttle;
    this.prevNitro = nitroActive;
    this.prevBoost = this.boost;

    const out = this.params;
    out.now = now;
    out.dt = safeDt;
    out.rpm = this.rpm;
    out.rpmNorm = rpmNorm;
    out.f0 = this.rpm / 120;
    out.load = clamp(this.smoothLoad, 0, 1);
    out.throttle = throttle;
    out.overrun = clamp(this.smoothOverrun, 0, 1);
    out.boost = this.boost;
    out.valve = this.isTuned ? clamp(0.45 + 0.55 * (nitroActive ? 1 : throttle), 0, 1) : 0.12;
    out.rough = 0.02;
    out.limiterCut = 0;
    out.evPop = 0;
    out.evCut = 0;
    out.evBov = evBov;
    out.cabinPos = clamp(cabinPos, 0, 1);
    return out;
  }
}
