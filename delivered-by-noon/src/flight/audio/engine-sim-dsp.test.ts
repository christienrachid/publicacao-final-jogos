import { describe, expect, it } from 'vitest';
import {
  bankAngles,
  buildCycle,
  CarDrivetrainTelemetry,
  CarEngineVoice,
  combustionSpec,
  crankRipple,
  cycleToCoefficients,
  decorrelateMufflerDelays,
  ENGINE_PROFILES,
  firingAngles,
  mufflerPeakCoincidence,
  pipeDelay,
  toPressureGradient,
} from './engine-sim-dsp';

function createMockAudioContext(): AudioContext {
  const mkParam = (v = 0): AudioParam => {
    const param = {
      value: v,
      setTargetAtTime(target: number) {
        if (!Number.isFinite(target)) throw new Error(`Non-finite AudioParam target: ${target}`);
        param.value = target;
        return param;
      },
      setValueAtTime(target: number) {
        if (!Number.isFinite(target)) throw new Error(`Non-finite AudioParam value: ${target}`);
        param.value = target;
        return param;
      },
      linearRampToValueAtTime(target: number) {
        if (!Number.isFinite(target)) throw new Error(`Non-finite ramp value: ${target}`);
        param.value = target;
        return param;
      },
      exponentialRampToValueAtTime(target: number) {
        if (!Number.isFinite(target) || target <= 0) throw new Error(`Invalid exp ramp value: ${target}`);
        param.value = target;
        return param;
      },
      cancelScheduledValues() {
        return param;
      },
    };
    return param as unknown as AudioParam;
  };

  const mkNode = (extra: Record<string, unknown> = {}) => ({
    connect() {
      return this;
    },
    disconnect() {},
    ...extra,
  });

  return {
    sampleRate: 48000,
    currentTime: 1.0,
    createGain: () => mkNode({ gain: mkParam(1) }),
    createDelay: () => mkNode({ delayTime: mkParam(0.01) }),
    createBiquadFilter: () => mkNode({ type: 'lowpass', frequency: mkParam(1000), Q: mkParam(1), gain: mkParam(0) }),
    createWaveShaper: () => mkNode({ curve: null, oversample: 'none' }),
    createDynamicsCompressor: () =>
      mkNode({
        threshold: mkParam(-2),
        knee: mkParam(5),
        ratio: mkParam(12),
        attack: mkParam(0.005),
        release: mkParam(0.15),
      }),
    createOscillator: () =>
      mkNode({
        type: 'sine',
        frequency: mkParam(100),
        detune: mkParam(0),
        setPeriodicWave() {},
        start() {},
        stop() {},
      }),
    createBufferSource: () =>
      mkNode({
        buffer: null,
        loop: false,
        start() {},
        stop() {},
      }),
    createBuffer: (_ch: number, len: number) => ({
      length: len,
      getChannelData: () => new Float32Array(len),
    }),
    createPeriodicWave: (real: Float32Array, imag: Float32Array) => ({ real, imag }),
  } as unknown as AudioContext;
}

describe('Engine Sim DSP port (MIT)', () => {
  it('deriva ângulos de ignição corretos para I4 (uniforme) e V8 cross-plane (bancos assimétricos)', () => {
    const i4 = bankAngles(ENGINE_PROFILES.i4, 0);
    expect(i4).toEqual([0, 180, 360, 540]);

    const v8BankA = bankAngles(ENGINE_PROFILES.v8cross, 0);
    const v8BankB = bankAngles(ENGINE_PROFILES.v8cross, 1);
    expect(v8BankA).toEqual([0, 270, 540, 630]);
    expect(v8BankB).toEqual([90, 180, 360, 450]);
    expect(firingAngles(ENGINE_PROFILES.v8cross).size).toBe(8);
  });

  it('gera coeficientes Fourier sem DC, finitos e calibração válida para o AudioWorklet', () => {
    for (const id of ['i4', 'v8cross'] as const) {
      const profile = ENGINE_PROFILES[id];
      const grad = toPressureGradient(buildCycle(profile, bankAngles(profile, 0), 0.8));
      const coeffs = cycleToCoefficients(grad);
      expect(coeffs.real[0]).toBe(0);
      expect(coeffs.imag[0]).toBe(0);

      let energy = 0;
      for (let k = 1; k < coeffs.real.length; k++) {
        expect(Number.isFinite(coeffs.real[k])).toBe(true);
        expect(Number.isFinite(coeffs.imag[k])).toBe(true);
        energy += coeffs.real[k] ** 2 + coeffs.imag[k] ** 2;
      }
      expect(energy).toBeGreaterThan(0);

      const spec = combustionSpec(profile);
      expect(spec.outputs).toBe(profile.banks.length + 1);
      expect(spec.events.length).toBe(profile.cylinders * 2);
      expect(spec.gains.length).toBe(spec.outputs);
      for (const row of spec.gains) {
        expect(row).toHaveLength(5);
        for (const g of row) expect(Number.isFinite(g) && g > 0).toBe(true);
      }
    }

    // Crank ripple é maior em marcha lenta e cai com ω² em alta rotação
    const idleRipple = crankRipple(ENGINE_PROFILES.v8cross, 750, 0.8);
    const highRipple = crankRipple(ENGINE_PROFILES.v8cross, 6500, 0.8);
    expect(idleRipple).toBeGreaterThan(highRipple * 5);
  });

  it('descorrelaciona câmaras do abafador sem aumentar coincidência de picos', () => {
    const raw = ENGINE_PROFILES.v8cross.exhaust.muffler.map((L) => pipeDelay(L, ENGINE_PROFILES.v8cross.gasTempFactor));
    const before = mufflerPeakCoincidence(raw);
    const after = mufflerPeakCoincidence(decorrelateMufflerDelays(raw, 0.06));
    expect(after).toBeLessThanOrEqual(before + 1e-12);
  });

  it('telemetria troca marchas e sobe RPM sem estalos, backfire, cortes secos ou realocação de params', () => {
    const hatch = new CarDrivetrainTelemetry('i4');
    const firstRef = hatch.params;
    for (let i = 0; i < 120; i++) {
      const speed = (i / 120) * 44;
      const p = hatch.step(i * 0.016, 0.016, speed, 1, false, 0);
      expect(p).toBe(firstRef);
      expect(Number.isFinite(p.rpm)).toBe(true);
      expect(p.evPop).toBe(0);
      expect(p.evCut).toBe(0);
      expect(p.limiterCut).toBe(0);
    }
    expect(hatch.gear).toBeGreaterThanOrEqual(4);

    const tuned = new CarDrivetrainTelemetry('v8cross');
    let maxLoadStepOnLift = 0;
    let prevLoad = tuned.params.load;
    let sawBov = false;

    for (let i = 0; i < 180; i++) {
      const speed = i < 140 ? Math.min(66, 20 + i * 0.4) : Math.max(8, 66 - (i - 140) * 1.4);
      const nitro = i >= 40 && i < 110;
      const throttle = i < 130 ? 1 : 0;
      const p = tuned.step(i * 0.016, 0.016, speed, throttle, nitro, 0);
      expect(p.evPop).toBe(0);
      expect(p.evCut).toBe(0);
      expect(p.limiterCut).toBe(0);
      if (i >= 130 && i <= 140) {
        maxLoadStepOnLift = Math.max(maxLoadStepOnLift, Math.abs(p.load - prevLoad));
      }
      prevLoad = p.load;
      if (p.evBov > 0.2) sawBov = true;
    }

    expect(tuned.gear).toBeLessThan(6);
    expect(maxLoadStepOnLift).toBeLessThan(0.35);
    expect(sawBov).toBe(true);
  });

  it('instancia, atualiza e descarta CarEngineVoice sem lançar erros ou parâmetros inválidos', () => {
    const ctx = createMockAudioContext();
    const bus = ctx.createGain();
    const voice = new CarEngineVoice(ctx, 'v8cross', bus);
    const telemetry = new CarDrivetrainTelemetry('v8cross');

    for (let i = 0; i < 30; i++) {
      const p = telemetry.step(1 + i * 0.016, 0.016, 25 + i * 1.3, 1, i > 10, i > 20 ? 1 : 0);
      voice.update(p, 0.4);
    }
    // Fade-out suave ao sair do veículo
    voice.update(telemetry.params, 0);
    voice.dispose();
  });
});
