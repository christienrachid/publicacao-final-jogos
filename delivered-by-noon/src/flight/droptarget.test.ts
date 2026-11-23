import { describe, expect, it } from 'vitest';
import { predictDropImpact } from './droptarget';

describe('alvo da encomenda', () => {
  it('prevê a queda com a mesma balística da entrega (100 m, 50 m/s para o norte)', () => {
    const out = { x: 0, y: 0, z: 0, t: 0 };
    const ok = predictDropImpact({ x: 0, y: 100, z: 0, heading: 0, speed: 50, verticalSpeed: 0 }, () => 0, out);
    expect(ok).toBe(true);
    const t = Math.sqrt((2 * (100 - 0.8 - 0.45)) / 9.81);
    expect(out.t).toBeCloseTo(t, 0);
    expect(out.x).toBeCloseTo(0, 3);
    expect(out.z).toBeCloseTo(-50 * t, -1); // heading 0 = -Z
  });
});
