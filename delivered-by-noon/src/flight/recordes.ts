export const RECORDS_STORAGE_KEY = 'delivered-by-noon:recordes:v1';
export const MAX_RECORDS = 5;
export const RECORD_MIN_MINUTES = 6 * 60; // 06:00
export const RECORD_MAX_MINUTES = 12 * 60; // 12:00

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RecordEntry {
  id: string;
  initials: string;
  /** Horário do jogo em minutos (360..720 = 06:00..12:00): quanto mais cedo, melhor. */
  finishMinutes: number;
  score: number;
  delivered: number;
  total: number;
  /** Data real em formato ISO 8601. */
  dateIso: string;
}

export interface RecordInput {
  initials: string;
  finishMinutes: number;
  score: number;
  delivered: number;
  total: number;
  dateIso?: string;
  id?: string;
}

export interface SaveRecordResult {
  records: RecordEntry[];
  entry: RecordEntry | null;
  /** Posição 1..5 quando o resultado entra no placar, ou null se ficou fora. */
  rank: number | null;
  saved: boolean;
  storageAvailable: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function resolveStorage(explicit?: StorageLike | null): StorageLike | null {
  if (explicit !== undefined) return explicit;
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function sanitizeInitials(raw: string): string {
  const normalized = String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3);
  return normalized.length > 0 ? normalized : 'GOP';
}

export function formatRecordClock(minutes: number): string {
  const clamped = Math.max(
    RECORD_MIN_MINUTES,
    Math.min(RECORD_MAX_MINUTES, Math.floor(Number.isFinite(minutes) ? minutes : RECORD_MIN_MINUTES)),
  );
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function formatRecordDate(dateIso: string): string {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return '--/--';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

/**
 * Ordenação oficial do placar:
 * 1) Horário de término mais cedo primeiro (menor `finishMinutes`);
 * 2) Em caso de empate no horário, maior pontuação primeiro (`score` decrescente);
 * 3) Desempate estável por entregas (maior) e data (mais antiga primeiro).
 */
export function compareRecords(a: RecordEntry, b: RecordEntry): number {
  if (a.finishMinutes !== b.finishMinutes) return a.finishMinutes - b.finishMinutes;
  if (a.score !== b.score) return b.score - a.score;
  if (a.delivered !== b.delivered) return b.delivered - a.delivered;
  return a.dateIso.localeCompare(b.dateIso);
}

function sanitizeEntry(raw: unknown, fallbackIndex: number): RecordEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<RecordEntry>;
  const finishMinutes =
    typeof obj.finishMinutes === 'number' && Number.isFinite(obj.finishMinutes)
      ? clamp(obj.finishMinutes, RECORD_MIN_MINUTES, RECORD_MAX_MINUTES)
      : null;
  const score =
    typeof obj.score === 'number' && Number.isFinite(obj.score) ? Math.max(0, Math.round(obj.score)) : null;
  if (finishMinutes === null || score === null) return null;

  const delivered =
    typeof obj.delivered === 'number' && Number.isFinite(obj.delivered) ? Math.max(0, Math.round(obj.delivered)) : 0;
  const total =
    typeof obj.total === 'number' && Number.isFinite(obj.total)
      ? Math.max(delivered, Math.round(obj.total))
      : delivered;
  const dateIso =
    typeof obj.dateIso === 'string' && !Number.isNaN(Date.parse(obj.dateIso))
      ? obj.dateIso
      : new Date(0).toISOString();
  const id = typeof obj.id === 'string' && obj.id.length > 0 ? obj.id : `rec-${fallbackIndex}-${finishMinutes}-${score}`;

  return {
    id,
    initials: sanitizeInitials(typeof obj.initials === 'string' ? obj.initials : ''),
    finishMinutes,
    score,
    delivered,
    total,
    dateIso,
  };
}

export function sortAndTrimRecords(entries: readonly RecordEntry[], limit = MAX_RECORDS): RecordEntry[] {
  return [...entries].sort(compareRecords).slice(0, Math.max(0, limit));
}

export function isRecordStorageAvailable(explicitStorage?: StorageLike | null): boolean {
  const storage = resolveStorage(explicitStorage);
  if (!storage) return false;
  try {
    const probeKey = `${RECORDS_STORAGE_KEY}:probe`;
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

export function loadRecords(explicitStorage?: StorageLike | null): RecordEntry[] {
  const storage = resolveStorage(explicitStorage);
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: RecordEntry[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const entry = sanitizeEntry(parsed[i], i);
      if (entry) valid.push(entry);
    }
    return sortAndTrimRecords(valid, MAX_RECORDS);
  } catch {
    return [];
  }
}

export function getBestRecord(explicitStorage?: StorageLike | null): RecordEntry | null {
  const list = loadRecords(explicitStorage);
  return list.length > 0 ? list[0] : null;
}

export function wouldMakeTopRecords(
  candidate: Pick<RecordInput, 'finishMinutes' | 'score' | 'delivered'>,
  existing: readonly RecordEntry[],
  limit = MAX_RECORDS,
): boolean {
  if (limit <= 0) return false;
  const sorted = sortAndTrimRecords(existing, limit);
  if (sorted.length < limit) return true;
  const probe: RecordEntry = {
    id: '__probe__',
    initials: 'GOP',
    finishMinutes: clamp(
      Number.isFinite(candidate.finishMinutes) ? candidate.finishMinutes : RECORD_MAX_MINUTES,
      RECORD_MIN_MINUTES,
      RECORD_MAX_MINUTES,
    ),
    score: Math.max(0, Math.round(Number.isFinite(candidate.score) ? candidate.score : 0)),
    delivered: Math.max(0, Math.round(Number.isFinite(candidate.delivered) ? candidate.delivered : 0)),
    total: Math.max(0, Math.round(Number.isFinite(candidate.delivered) ? candidate.delivered : 0)),
    dateIso: '9999-12-31T23:59:59.999Z',
  };
  return compareRecords(probe, sorted[sorted.length - 1]) < 0;
}

export function saveRecord(input: RecordInput, explicitStorage?: StorageLike | null): SaveRecordResult {
  const storage = resolveStorage(explicitStorage);
  if (!storage) {
    return { records: [], entry: null, rank: null, saved: false, storageAvailable: false };
  }

  const existing = loadRecords(storage);
  const nowIso =
    typeof input.dateIso === 'string' && !Number.isNaN(Date.parse(input.dateIso))
      ? input.dateIso
      : new Date().toISOString();
  const entry: RecordEntry = {
    id: input.id ?? `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    initials: sanitizeInitials(input.initials),
    finishMinutes: clamp(
      Number.isFinite(input.finishMinutes) ? input.finishMinutes : RECORD_MAX_MINUTES,
      RECORD_MIN_MINUTES,
      RECORD_MAX_MINUTES,
    ),
    score: Math.max(0, Math.round(Number.isFinite(input.score) ? input.score : 0)),
    delivered: Math.max(0, Math.round(Number.isFinite(input.delivered) ? input.delivered : 0)),
    total: Math.max(
      Math.max(0, Math.round(Number.isFinite(input.delivered) ? input.delivered : 0)),
      Math.round(Number.isFinite(input.total) ? input.total : 0),
    ),
    dateIso: nowIso,
  };

  const next = sortAndTrimRecords([...existing, entry], MAX_RECORDS);
  const idx = next.findIndex((item) => item.id === entry.id);

  try {
    storage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(next));
    return {
      records: next,
      entry: idx >= 0 ? entry : null,
      rank: idx >= 0 ? idx + 1 : null,
      saved: true,
      storageAvailable: true,
    };
  } catch {
    return {
      records: existing,
      entry: null,
      rank: null,
      saved: false,
      storageAvailable: false,
    };
  }
}

export function clearRecords(explicitStorage?: StorageLike | null): boolean {
  const storage = resolveStorage(explicitStorage);
  if (!storage) return false;
  try {
    storage.removeItem(RECORDS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
