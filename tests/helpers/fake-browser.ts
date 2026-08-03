import type { StorageLike } from '../../src/lib/local-state/storage';

/** Plain in-memory `Storage`-shaped stub — no DOM needed. */
export function createFakeStorage(initial: Record<string, string> = {}): StorageLike & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

/** A storage stub whose `setItem` always throws, to simulate quota-exceeded
 * or a browser blocking writes (private mode). */
export function createThrowingStorage(
  error: unknown = new DOMException('quota', 'QuotaExceededError'),
): StorageLike {
  return {
    getItem: () => null,
    setItem: () => {
      throw error;
    },
    removeItem: () => {},
  };
}

/**
 * `src/lib/local-state/storage.ts` resolves the bare identifier `window` at
 * call time, not at module load — the same technique Phase 1's
 * `tests/tarkov-fetch-observation.test.ts` uses for `fetch`. Setting
 * `globalThis.window` makes every module in this process see it as the
 * global `window`, which is what lets `getStorage()`'s `typeof window`
 * check and `window.addEventListener` resolve without a real DOM.
 */
export async function withFakeWindow<T>(
  storage: StorageLike,
  run: (events: {
    dispatchStorageEvent: (event: { key: string | null; newValue: string | null }) => void;
  }) => Promise<T> | T,
): Promise<T> {
  const listeners: Array<(event: { key: string | null; newValue: string | null }) => void> = [];
  const fakeWindow = {
    localStorage: storage,
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      if (type === 'storage') listeners.push(listener as (event: { key: string | null; newValue: string | null }) => void);
    },
    removeEventListener: () => {},
  };

  const previous = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = fakeWindow;

  try {
    return await run({
      dispatchStorageEvent: (event) => {
        for (const listener of listeners) listener(event);
      },
    });
  } finally {
    (globalThis as { window?: unknown }).window = previous;
  }
}

export async function withoutWindow<T>(run: () => Promise<T> | T): Promise<T> {
  const previous = (globalThis as { window?: unknown }).window;
  delete (globalThis as { window?: unknown }).window;
  try {
    return await run();
  } finally {
    (globalThis as { window?: unknown }).window = previous;
  }
}
