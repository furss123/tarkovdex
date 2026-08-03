import assert from 'node:assert/strict';
import test from 'node:test';
import { createFakeStorage, createThrowingStorage, withFakeWindow, withoutWindow } from './helpers/fake-browser';
import {
  LEGACY_GAME_MODE_KEY,
  STORAGE_KEY,
  CORRUPT_BACKUP_KEY,
  createDefaultState,
} from '../src/lib/local-state/schema';
import {
  applyExternalStorageChange,
  getLocalStateServerSnapshot,
  getLocalStateSnapshot,
  hydrateLocalState,
  importLocalState,
  isStorageAvailable,
  resetLocalState,
  resetLocalStateStoreForTests,
  setGameMode,
  subscribeLocalState,
  updatePreferences,
} from '../src/lib/local-state/store';
import { exportLocalState, serializeExport } from '../src/lib/local-state/export-import';

test.beforeEach(() => {
  resetLocalStateStoreForTests();
});

// ---------------------------------------------------------------------------
// storage.ts primitives
// ---------------------------------------------------------------------------

test('getStorage/readRaw/writeRaw round-trip through a fake Storage', async () => {
  const { getStorage, readRaw, writeRaw } = await import('../src/lib/local-state/storage');
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    const storage = getStorage();
    assert.ok(storage);
    const result = writeRaw(storage!, 'k', 'v');
    assert.deepEqual(result, { ok: true, value: undefined });
    assert.equal(readRaw(storage!, 'k'), 'v');
  });
});

test('getStorage returns null outside the browser', async () => {
  const { getStorage } = await import('../src/lib/local-state/storage');
  await withoutWindow(() => {
    assert.equal(getStorage(), null);
  });
});

test('writeRaw classifies a quota error', async () => {
  const { getStorage, writeRaw } = await import('../src/lib/local-state/storage');
  await withFakeWindow(createThrowingStorage(), () => {
    const storage = getStorage()!;
    const result = writeRaw(storage, STORAGE_KEY, '{}');
    assert.deepEqual(result, { ok: false, code: 'quota-exceeded' });
  });
});

test('writeRaw classifies a SecurityError as unavailable', async () => {
  const { getStorage, writeRaw } = await import('../src/lib/local-state/storage');
  await withFakeWindow(
    createThrowingStorage(new DOMException('blocked', 'SecurityError')),
    () => {
      const storage = getStorage()!;
      const result = writeRaw(storage, STORAGE_KEY, '{}');
      assert.deepEqual(result, { ok: false, code: 'unavailable' });
    },
  );
});

test('removeRaw never throws even when the underlying storage throws', async () => {
  const { removeRaw } = await import('../src/lib/local-state/storage');
  const throwing = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {
      throw new Error('boom');
    },
  };
  assert.doesNotThrow(() => removeRaw(throwing, 'k'));
});

// ---------------------------------------------------------------------------
// SSR / hydration safety
// ---------------------------------------------------------------------------

test('getServerSnapshot is fixed and equals the pre-hydration snapshot', () => {
  assert.deepEqual(getLocalStateServerSnapshot(), getLocalStateSnapshot());
  assert.equal(getLocalStateSnapshot().preferences.gameMode, 'regular');
});

test('hydrateLocalState with no storage available leaves the server snapshot in place', async () => {
  await withoutWindow(() => {
    hydrateLocalState();
    assert.deepEqual(getLocalStateSnapshot(), getLocalStateServerSnapshot());
  });
});

test('hydrateLocalState only runs once even if called repeatedly (Strict Mode double-invoke)', async () => {
  const fake = createFakeStorage({ [LEGACY_GAME_MODE_KEY]: 'pve' });
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'pve');
    // A second call must not re-read the (now-removed) legacy key, re-run
    // recovery, or otherwise touch the document again.
    const storedAfterFirst = fake.data.get(STORAGE_KEY);
    hydrateLocalState();
    hydrateLocalState();
    assert.equal(fake.data.get(STORAGE_KEY), storedAfterFirst);
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'pve');
  });
});

// ---------------------------------------------------------------------------
// hydration + legacy adoption, end to end through the real orchestrator
// ---------------------------------------------------------------------------

test('hydration with nothing stored starts from PvP defaults', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'regular');
    const stored = JSON.parse(fake.data.get(STORAGE_KEY)!);
    assert.equal(stored.preferences.gameMode, 'regular');
  });
});

test('hydration adopts the legacy key and then removes it', async () => {
  const fake = createFakeStorage({ [LEGACY_GAME_MODE_KEY]: 'pve' });
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'pve');
    assert.equal(fake.data.has(LEGACY_GAME_MODE_KEY), false, 'legacy key removed after verified write');
    const stored = JSON.parse(fake.data.get(STORAGE_KEY)!);
    assert.equal(stored.preferences.gameMode, 'pve');
  });
});

test('a real v1 document already present is not overwritten by a stray legacy key', async () => {
  const fake = createFakeStorage({
    [STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      preferences: { gameMode: 'pve' },
      metadata: { createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
    }),
    [LEGACY_GAME_MODE_KEY]: 'regular',
  });
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'pve');
  });
});

test('a corrupt stored document is backed up and recovers to defaults', async () => {
  const fake = createFakeStorage({ [STORAGE_KEY]: '{not json' });
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'regular');
    assert.equal(fake.data.get(CORRUPT_BACKUP_KEY), '{not json');
  });
});

test('a newer schemaVersion document on disk is left completely untouched', async () => {
  const futureDoc = JSON.stringify({
    schemaVersion: 99,
    preferences: { gameMode: 'pve' },
    metadata: { createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
  });
  const fake = createFakeStorage({ [STORAGE_KEY]: futureDoc });
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'regular', 'runs on defaults this session');
    assert.equal(fake.data.get(STORAGE_KEY), futureDoc, 'disk copy is byte-for-byte untouched');
  });
});

test('if persisting the migrated document fails, the legacy key is kept, not deleted', async () => {
  // setItem always throws, so the "verify write, then delete legacy" step
  // must never be reached.
  const backing = new Map<string, string>([[LEGACY_GAME_MODE_KEY, 'pve']]);
  const storage = {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: () => {
      throw new DOMException('quota', 'QuotaExceededError');
    },
    removeItem: (key: string) => backing.delete(key),
  };
  await withFakeWindow(storage, () => {
    hydrateLocalState();
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'pve', 'still adopted in memory');
    assert.equal(backing.has(LEGACY_GAME_MODE_KEY), true, 'not deleted — the new write never landed');
  });
});

// ---------------------------------------------------------------------------
// subscription
// ---------------------------------------------------------------------------

test('subscribers are notified on a write and not notified after unsubscribing', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    let calls = 0;
    const unsubscribe = subscribeLocalState(() => {
      calls += 1;
    });
    setGameMode('pve');
    assert.equal(calls, 1);
    unsubscribe();
    setGameMode('regular');
    assert.equal(calls, 1, 'no further notifications after unsubscribe');
  });
});

test('multiple subscribers are all notified', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    let a = 0;
    let b = 0;
    subscribeLocalState(() => {
      a += 1;
    });
    subscribeLocalState(() => {
      b += 1;
    });
    setGameMode('pve');
    assert.equal(a, 1);
    assert.equal(b, 1);
  });
});

// ---------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------

test('setGameMode updates memory and persists, bumping updatedAt', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    const before = getLocalStateSnapshot().metadata.updatedAt;
    const outcome = setGameMode('pve');
    assert.deepEqual(outcome, { ok: true, value: undefined });
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'pve');
    const stored = JSON.parse(fake.data.get(STORAGE_KEY)!);
    assert.equal(stored.preferences.gameMode, 'pve');
    assert.ok(getLocalStateSnapshot().metadata.updatedAt >= before);
  });
});

test('a write still updates in-memory state even when persistence fails', async () => {
  const fake = createThrowingStorage();
  await withFakeWindow(fake, () => {
    const outcome = updatePreferences((prefs) => ({ ...prefs, gameMode: 'pve' }));
    assert.equal(outcome.ok, false);
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'pve', 'this tab still reflects the choice');
  });
});

test('updatePreferences without any browser storage returns unavailable but still updates memory', async () => {
  await withoutWindow(() => {
    const outcome = updatePreferences((prefs) => ({ ...prefs, gameMode: 'pve' }));
    assert.deepEqual(outcome, { ok: false, code: 'unavailable' });
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'pve');
  });
});

test('resetLocalState returns to PvP defaults and persists', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    setGameMode('pve');
    const outcome = resetLocalState();
    assert.deepEqual(outcome, { ok: true, value: undefined });
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'regular');
    const stored = JSON.parse(fake.data.get(STORAGE_KEY)!);
    assert.equal(stored.preferences.gameMode, 'regular');
  });
});

test('isStorageAvailable reflects whether the browser exposes storage', async () => {
  await withoutWindow(() => {
    assert.equal(isStorageAvailable(), false);
  });
  await withFakeWindow(createFakeStorage(), () => {
    assert.equal(isStorageAvailable(), true);
  });
});

// ---------------------------------------------------------------------------
// import through the store (write + apply)
// ---------------------------------------------------------------------------

test('importLocalState replaces the current document on success', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    const file = exportLocalState(
      {
        ...createDefaultState('2020-01-01T00:00:00.000Z'),
        preferences: { gameMode: 'pve', beginnerMode: false },
      },
      '2026-08-03T00:00:00.000Z',
    );
    const outcome = importLocalState(serializeExport(file));
    assert.deepEqual(outcome, { ok: true });
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'pve');
  });
});

test('importLocalState leaves state completely unchanged on invalid input', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    setGameMode('pve');
    const before = getLocalStateSnapshot();
    const outcome = importLocalState('{not json');
    assert.equal(outcome.ok, false);
    assert.deepEqual(getLocalStateSnapshot(), before);
  });
});

test('importLocalState leaves state unchanged if the write itself fails', async () => {
  const throwing = createThrowingStorage();
  await withFakeWindow(throwing, () => {
    const before = getLocalStateSnapshot();
    const file = exportLocalState(
      {
        ...createDefaultState('2020-01-01T00:00:00.000Z'),
        preferences: { gameMode: 'pve', beginnerMode: false },
      },
      '2026-08-03T00:00:00.000Z',
    );
    const outcome = importLocalState(serializeExport(file));
    assert.equal(outcome.ok, false);
    assert.deepEqual(
      getLocalStateSnapshot(),
      before,
      'unlike setGameMode, a failed import must not diverge memory from disk',
    );
  });
});

// ---------------------------------------------------------------------------
// cross-tab sync
// ---------------------------------------------------------------------------

test('a valid external write from another tab is adopted', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    const external = {
      ...createDefaultState('2020-01-01T00:00:00.000Z'),
      preferences: { gameMode: 'pve', beginnerMode: false },
    };
    applyExternalStorageChange({ key: STORAGE_KEY, newValue: JSON.stringify(external) });
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'pve');
  });
});

test('an external write with a different key is ignored', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    const before = getLocalStateSnapshot();
    applyExternalStorageChange({ key: 'some-other-app-key', newValue: '{"anything":true}' });
    assert.deepEqual(getLocalStateSnapshot(), before);
  });
});

test('an external write with corrupted JSON is ignored, not recovered', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    setGameMode('pve');
    const before = getLocalStateSnapshot();
    applyExternalStorageChange({ key: STORAGE_KEY, newValue: '{not json' });
    assert.deepEqual(getLocalStateSnapshot(), before, 'corrupted external writes never patch this tab\'s state');
  });
});

test('an external write that is valid JSON but an invalid document is ignored outright', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    setGameMode('pve');
    const before = getLocalStateSnapshot();
    applyExternalStorageChange({
      key: STORAGE_KEY,
      newValue: JSON.stringify({ schemaVersion: 1, preferences: { gameMode: 'nonsense' } }),
    });
    assert.deepEqual(
      getLocalStateSnapshot(),
      before,
      'strict validation, not the lenient recovery used on initial load',
    );
  });
});

test('an external key removal resets this tab to defaults', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    setGameMode('pve');
    applyExternalStorageChange({ key: STORAGE_KEY, newValue: null });
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'regular');
  });
});

test('notifying the same valid value again does not throw and stays consistent', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    const doc = getLocalStateSnapshot();
    applyExternalStorageChange({ key: STORAGE_KEY, newValue: JSON.stringify(doc) });
    assert.deepEqual(getLocalStateSnapshot(), doc);
  });
});
