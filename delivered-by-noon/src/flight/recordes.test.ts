import { describe, expect, it } from 'vitest';
import {
  clearRecords,
  formatRecordClock,
  getBestRecord,
  isRecordStorageAvailable,
  loadRecords,
  MAX_RECORDS,
  RECORDS_STORAGE_KEY,
  sanitizeInitials,
  saveRecord,
  type StorageLike,
  wouldMakeTopRecords,
} from './recordes';

function createMemoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem(key: string) {
      return data.has(key) ? (data.get(key) ?? null) : null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
  };
}

function createFailingStorage(): StorageLike {
  return {
    getItem() {
      throw new Error('SecurityError: storage blocked');
    },
    setItem() {
      throw new Error('QuotaExceededError: storage blocked');
    },
    removeItem() {
      throw new Error('SecurityError: storage blocked');
    },
  };
}

describe('recordes (Melhores entregadores)', () => {
  it('ordena pelo horário de término mais cedo (06:00–12:00) e desempata pela maior pontuação', () => {
    const storage = createMemoryStorage();
    expect(RECORDS_STORAGE_KEY).toBe('delivered-by-noon:recordes:v1');

    saveRecord(
      { initials: 'jvc', finishMinutes: 640, score: 2600, delivered: 16, total: 16, dateIso: '2026-11-22T11:00:00Z' },
      storage,
    );
    saveRecord(
      { initials: 'GMR', finishMinutes: 580, score: 2200, delivered: 16, total: 16, dateIso: '2026-11-22T11:10:00Z' },
      storage,
    );
    saveRecord(
      { initials: 'rlh', finishMinutes: 580, score: 2950, delivered: 16, total: 16, dateIso: '2026-11-22T11:20:00Z' },
      storage,
    );
    saveRecord(
      { initials: 'lt', finishMinutes: 505, score: 1900, delivered: 16, total: 16, dateIso: '2026-11-22T11:30:00Z' },
      storage,
    );

    const list = loadRecords(storage);
    expect(list.map((r) => [r.initials, r.finishMinutes, r.score])).toEqual([
      ['LT', 505, 1900],
      ['RLH', 580, 2950],
      ['GMR', 580, 2200],
      ['JVC', 640, 2600],
    ]);
    expect(getBestRecord(storage)?.initials).toBe('LT');
    expect(formatRecordClock(505)).toBe('08:25');
    expect(formatRecordClock(360)).toBe('06:00');
    expect(formatRecordClock(720)).toBe('12:00');
  });

  it('mantém no máximo 5 registros e descarta os piores resultados', () => {
    const storage = createMemoryStorage();
    const runs = [
      { initials: 'AAA', finishMinutes: 700, score: 2000 },
      { initials: 'BBB', finishMinutes: 660, score: 2100 },
      { initials: 'CCC', finishMinutes: 620, score: 2200 },
      { initials: 'DDD', finishMinutes: 580, score: 2300 },
      { initials: 'EEE', finishMinutes: 520, score: 2400 },
      { initials: 'FFF', finishMinutes: 550, score: 2500 },
      { initials: 'ZZZ', finishMinutes: 715, score: 9999 },
    ];

    let lastRes = null;
    for (const run of runs) {
      lastRes = saveRecord({ ...run, delivered: 16, total: 16 }, storage);
    }

    const list = loadRecords(storage);
    expect(list).toHaveLength(MAX_RECORDS);
    expect(list.map((r) => r.initials)).toEqual(['EEE', 'FFF', 'DDD', 'CCC', 'BBB']);
    expect(lastRes?.rank).toBeNull();
    expect(wouldMakeTopRecords({ finishMinutes: 659, score: 1000, delivered: 16 }, list)).toBe(true);
    expect(wouldMakeTopRecords({ finishMinutes: 660, score: 2500, delivered: 16 }, list)).toBe(true);
    expect(wouldMakeTopRecords({ finishMinutes: 660, score: 1800, delivered: 16 }, list)).toBe(false);
    expect(wouldMakeTopRecords({ finishMinutes: 685, score: 9999, delivered: 16 }, list)).toBe(false);

    expect(clearRecords(storage)).toBe(true);
    expect(loadRecords(storage)).toEqual([]);
  });

  it('tolera armazenamento indisponível ou com erro sem lançar exceções', () => {
    const broken = createFailingStorage();

    expect(isRecordStorageAvailable(broken)).toBe(false);
    expect(isRecordStorageAvailable(null)).toBe(false);
    expect(loadRecords(broken)).toEqual([]);
    expect(getBestRecord(broken)).toBeNull();

    const saveBroken = saveRecord({ initials: 'abc', finishMinutes: 800, score: 3000, delivered: 20, total: 20 }, broken);
    expect(saveBroken.saved).toBe(false);
    expect(saveBroken.storageAvailable).toBe(false);
    expect(saveBroken.entry).toBeNull();
    expect(saveBroken.rank).toBeNull();

    const saveNull = saveRecord({ initials: 'abc', finishMinutes: 800, score: 3000, delivered: 20, total: 20 }, null);
    expect(saveNull.saved).toBe(false);
    expect(saveNull.storageAvailable).toBe(false);

    expect(clearRecords(broken)).toBe(false);
    expect(clearRecords(null)).toBe(false);
    expect(sanitizeInitials('  ãb!c9 ')).toBe('ABC');
    expect(sanitizeInitials('   ')).toBe('GOP');
  });
});
