// Простой in-memory кеш для данных страниц.
// Данные живут пока открыта вкладка. TTL = 60 секунд.
const TTL = 60_000;

interface CacheEntry {
  data: unknown;
  ts: number;
}

const store: Record<string, CacheEntry> = {};

export function getCached<T>(key: string): T | null {
  const entry = store[key];
  if (!entry || Date.now() - entry.ts > TTL) return null;
  return entry.data as T;
}

export function setCached(key: string, data: unknown): void {
  store[key] = { data, ts: Date.now() };
}

export function invalidateCache(key: string): void {
  delete store[key];
}
