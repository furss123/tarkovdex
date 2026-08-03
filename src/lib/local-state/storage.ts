/**
 * The only module in this layer that touches `window.localStorage`. Every
 * function takes a `StorageLike` rather than reaching for `window` itself, so
 * tests can inject an in-memory stub (including one that throws, to simulate
 * quota/private-mode failures) without a DOM — the same reason
 * `data-observations.ts`'s recorder takes a plain path string instead of
 * reading environment state directly.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StorageErrorCode =
  | 'unavailable'
  | 'quota-exceeded'
  | 'stringify-failed'
  | 'unknown';

export type StorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: StorageErrorCode };

/** `typeof window === 'undefined'` covers SSR. The try/catch covers the rarer
 * case some browsers throw on the `localStorage` getter itself (e.g. Safari
 * private mode, or storage blocked by a policy) — reaching for `window` alone
 * would not catch that. */
export function getStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function classifyWriteError(error: unknown): StorageErrorCode {
  if (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  ) {
    return 'quota-exceeded';
  }
  if (error instanceof DOMException && error.name === 'SecurityError') return 'unavailable';
  return 'unknown';
}

export function readRaw(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeRaw(storage: StorageLike, key: string, value: string): StorageResult<void> {
  try {
    storage.setItem(key, value);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, code: classifyWriteError(error) };
  }
}

/** Best-effort. A tab that cannot even remove a key has no worse outcome
 * available than leaving it — this never surfaces to the UI. */
export function removeRaw(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // best effort
  }
}

export function writeJson<T>(storage: StorageLike, key: string, value: T): StorageResult<void> {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ok: false, code: 'stringify-failed' };
  }
  return writeRaw(storage, key, serialized);
}
