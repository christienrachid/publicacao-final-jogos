import { STAGE_ORDER as STAGES, type MissionState, type Stage } from './types';

/** Save do turno em andamento (um slot): o menu oferece "Continuar" ou "Novo jogo". */
export const SAVE_STORAGE_KEY = 'delivered-by-noon:save:v1';

export interface SaveData {
  version: 1;
  savedAt: number;
  stage: Stage;
  clockMinutes: number;
  score: number;
  delivered: number;
  total: number;
  deliveredIds: string[];
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function snapshotMission(mission: MissionState, now = Date.now()): SaveData {
  const deliveredIds: string[] = [];
  for (let i = 0; i < mission.deliveries.length; i++) {
    if (mission.deliveries[i].delivered) deliveredIds.push(mission.deliveries[i].id);
  }
  return {
    version: 1,
    savedAt: now,
    stage: mission.stage,
    clockMinutes: mission.clockMinutes,
    score: mission.score,
    delivered: mission.delivered,
    total: mission.total,
    deliveredIds,
  };
}

export function parseSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<SaveData>;
    if (d?.version !== 1 || !STAGES.includes(d.stage as Stage)) return null;
    if (!Number.isFinite(d.clockMinutes) || !Number.isFinite(d.score) || !Array.isArray(d.deliveredIds)) return null;
    return {
      version: 1,
      savedAt: Number(d.savedAt) || 0,
      stage: d.stage as Stage,
      clockMinutes: Number(d.clockMinutes),
      score: Number(d.score),
      delivered: Number(d.delivered) || d.deliveredIds.length,
      total: Number(d.total) || 0,
      deliveredIds: d.deliveredIds.filter((id): id is string => typeof id === 'string'),
    };
  } catch {
    return null;
  }
}

export function loadSave(): SaveData | null {
  try {
    return parseSave(storage()?.getItem(SAVE_STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

/** Grava só turnos em andamento com alguma entrega feita (nada a salvar no início). */
export function writeSave(mission: MissionState): void {
  if (mission.status !== 'playing' || mission.delivered <= 0) return;
  try {
    storage()?.setItem(SAVE_STORAGE_KEY, JSON.stringify(snapshotMission(mission)));
  } catch {
    // armazenamento cheio ou bloqueado: segue sem save
  }
}

export function clearSave(): void {
  try {
    storage()?.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // ignora
  }
}

/** Aplica o save numa missão recém-iniciada (startMission já criou as entregas). */
export function applySave(mission: MissionState, save: SaveData): void {
  const ids = new Set(save.deliveredIds);
  let count = 0;
  for (let i = 0; i < mission.deliveries.length; i++) {
    const d = mission.deliveries[i];
    d.delivered = ids.has(d.id);
    if (d.delivered) count++;
  }
  mission.stage = save.stage;
  mission.delivered = count;
  mission.score = save.score;
  mission.clockMinutes = save.clockMinutes;
  mission.carrying = save.stage;
  mission.nextDeliveryId = mission.deliveries.find((d) => !d.delivered && d.stage === save.stage)?.id ?? null;
}

export function describeSave(save: SaveData): string {
  const h = Math.floor(save.clockMinutes / 60) % 24;
  const m = Math.floor(save.clockMinutes % 60);
  const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return `${save.delivered}/${save.total || 16} entregas · ${clock} · ${save.score} pts`;
}
