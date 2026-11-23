import { describe, it, expect } from 'vitest';
import { rng, valueNoise, fbm, clamp01, smoothstep } from './noise';

describe('rng', () => {
  it('mesma semente gera a mesma sequência', () => {
    const gen1 = rng(42);
    const gen2 = rng(42);
    const seq1 = [gen1(), gen1(), gen1(), gen1(), gen1()];
    const seq2 = [gen2(), gen2(), gen2(), gen2(), gen2()];
    expect(seq1).toEqual(seq2);
  });

  it('sementes diferentes geram sequências diferentes', () => {
    const gen1 = rng(1);
    const gen2 = rng(2);
    const seq1 = [gen1(), gen1(), gen1()];
    const seq2 = [gen2(), gen2(), gen2()];
    expect(seq1).not.toEqual(seq2);
  });

  it('valores em [0, 1)', () => {
    const gen = rng(123);
    for (let i = 0; i < 100; i++) {
      const v = gen();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('valueNoise', () => {
  it('resultados em [0, 1] numa grade de 200 pontos', () => {
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        const v = valueNoise(x * 0.1, y * 0.1, 42);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('determinístico: mesma entrada produz mesmo resultado', () => {
    const v1 = valueNoise(1.5, 2.5, 7);
    const v2 = valueNoise(1.5, 2.5, 7);
    expect(v1).toBe(v2);
  });
});

describe('fbm', () => {
  it('resultados em [0, 1] numa grade de 200 pontos', () => {
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        const v = fbm(x * 0.1, y * 0.1, 5, 42);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('determinístico: mesma entrada produz mesmo resultado', () => {
    const v1 = fbm(3.14, 2.71, 4, 99);
    const v2 = fbm(3.14, 2.71, 4, 99);
    expect(v1).toBe(v2);
  });
});

describe('clamp01', () => {
  it('abaixo de 0 retorna 0', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(-10)).toBe(0);
  });

  it('acima de 1 retorna 1', () => {
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(100)).toBe(1);
  });

  it('no meio retorna o próprio valor', () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.25)).toBe(0.25);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(0.75)).toBe(0.75);
    expect(clamp01(1)).toBe(1);
  });
});

describe('smoothstep', () => {
  it('abaixo do intervalo retorna 0', () => {
    expect(smoothstep(0, 1, -0.5)).toBe(0);
    expect(smoothstep(0, 1, 0)).toBe(0);
  });

  it('acima do intervalo retorna 1', () => {
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });

  it('no meio interpola suavemente', () => {
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 10, 5)).toBe(0.5);
  });

  it('intervalo invertido (a > b) funciona', () => {
    expect(smoothstep(1, 0, 0.5)).toBe(0.5);
  });
});