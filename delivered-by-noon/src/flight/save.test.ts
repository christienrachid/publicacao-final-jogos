import { describe, expect, it } from 'vitest';
import { createMissionState } from './types';
import { applySave, describeSave, parseSave, snapshotMission } from './save';

function mission() {
  const m = createMissionState();
  m.status = 'playing';
  m.deliveries = [
    { id: 'car-1', stage: 'car', delivered: true },
    { id: 'car-2', stage: 'car', delivered: false },
    { id: 'tuned-1', stage: 'tuned', delivered: false },
  ] as never;
  m.delivered = 1;
  m.total = 3;
  m.score = 150;
  m.clockMinutes = 7 * 60 + 5;
  return m;
}

describe('save do turno', () => {
  it('ida e volta preserva entregas, relógio, pontos e etapa', () => {
    const raw = JSON.stringify(snapshotMission(mission(), 1));
    const save = parseSave(raw)!;
    expect(save).not.toBeNull();
    const fresh = mission();
    fresh.deliveries.forEach((d) => (d.delivered = false));
    fresh.delivered = 0; fresh.score = 0; fresh.clockMinutes = 360;
    applySave(fresh, save);
    expect(fresh.delivered).toBe(1);
    expect(fresh.score).toBe(150);
    expect(fresh.clockMinutes).toBe(425);
    expect(fresh.nextDeliveryId).toBe('car-2');
    expect(describeSave(save)).toBe('1/3 entregas · 07:05 · 150 pts');
  });
  it('rejeita save corrompido', () => {
    expect(parseSave('{"version":1,"stage":"barco"}')).toBeNull();
    expect(parseSave('não é json')).toBeNull();
  });
});
