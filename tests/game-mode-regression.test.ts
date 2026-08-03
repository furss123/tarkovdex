import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFakeStorage, withFakeWindow } from './helpers/fake-browser';
import { STORAGE_KEY, LEGACY_GAME_MODE_KEY } from '../src/lib/local-state/schema';
import {
  getLocalStateSnapshot,
  hydrateLocalState,
  resetLocalStateStoreForTests,
  setGameMode,
} from '../src/lib/local-state/store';

/**
 * `GameModeContext.tsx`'s public contract (`useGameMode()` returning
 * `{ gameMode, setGameMode }`) must survive the Phase 2 storage migration
 * unchanged — it has ~11 call sites across the app and none of them were
 * touched. The store-level behavior it now delegates to is exercised end to
 * end here; the consumer-shape assertions below are a source-text check
 * (like `tests/mode-isolation.test.ts`), not a render test — this repo has
 * no DOM test runner, see that file's own header for the same caveat.
 */

const CONSUMERS = [
  'src/components/combat/AmmoChart.tsx',
  'src/components/combat/ArmorExplorer.tsx',
  'src/components/economy/EconomyExplorer.tsx',
  'src/components/home/BossSpawnBoard.tsx',
  'src/components/home/CraftProfitBoard.tsx',
  'src/components/home/TraderRestockBoard.tsx',
  'src/components/items/ItemsExplorer.tsx',
  'src/components/layout/GameModeSwitcher.tsx',
  'src/components/maps/MapsModeBoard.tsx',
  'src/components/progression/GunsmithExplorer.tsx',
  'src/components/tasks/TasksExplorer.tsx',
  'src/components/tools/GameModeBadge.tsx',
  'src/components/tools/ModeAvailabilityBoundary.tsx',
];

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('every known consumer still calls useGameMode() unchanged', () => {
  for (const path of CONSUMERS) {
    const text = source(path);
    assert.match(
      text,
      /useGameMode\(\)/,
      `${path} no longer calls useGameMode() — Phase 2 must not touch consumer call sites`,
    );
  }
});

test('GameModeContext still exports GameModeProvider and useGameMode with the same names', () => {
  const text = source('src/contexts/GameModeContext.tsx');
  assert.match(text, /export function GameModeProvider/);
  assert.match(text, /export function useGameMode\(\)/);
  assert.match(text, /gameMode: GameMode/, 'the returned shape still types gameMode as GameMode');
  assert.match(text, /setGameMode: \(mode: GameMode\) => void/);
});

test('GameModeContext no longer touches localStorage directly — it delegates to the store', () => {
  const text = source('src/contexts/GameModeContext.tsx');
  // The word may still appear in prose explaining the change; what must be
  // gone is actual API usage.
  assert.doesNotMatch(
    text,
    /window\.localStorage|\.getItem\(|\.setItem\(/,
    'persistence must live in @/lib/local-state now, not duplicated in the context',
  );
  assert.match(text, /@\/lib\/local-state/);
});

// ---------------------------------------------------------------------------
// behavioral regression, through the real store the context delegates to
// ---------------------------------------------------------------------------

test.beforeEach(() => {
  resetLocalStateStoreForTests();
});

test('selecting PvP persists and survives a simulated reload', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    setGameMode('regular');
    resetLocalStateStoreForTests(); // simulates a fresh module load on reload
    hydrateLocalState();
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'regular');
  });
});

test('selecting PvE persists and survives a simulated reload', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    setGameMode('pve');
    resetLocalStateStoreForTests();
    hydrateLocalState();
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'pve');
  });
});

test('a pre-Phase-2 visitor\'s legacy selection survives the migration to the new store', async () => {
  const fake = createFakeStorage({ [LEGACY_GAME_MODE_KEY]: 'pve' });
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'pve', 'nothing was lost');
    assert.ok(fake.data.has(STORAGE_KEY), 'migrated into the new versioned document');
    assert.equal(fake.data.has(LEGACY_GAME_MODE_KEY), false, 'the old standalone key is gone');
  });
});

test('the persisted key is not parameterized by locale — one selection for the whole site', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    setGameMode('pve');
    // Nothing in this call touches a locale, and the same STORAGE_KEY is read
    // back regardless — simulating navigation from /ko/... to /en/... is
    // exactly "read the same key again".
    resetLocalStateStoreForTests();
    hydrateLocalState();
    assert.equal(getLocalStateSnapshot().preferences.gameMode, 'pve');
  });
  assert.equal(STORAGE_KEY, 'tarkovdex:v1');
});

test('setGameMode never produces a value outside the two known modes', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    setGameMode('regular');
    assert.ok(['regular', 'pve'].includes(getLocalStateSnapshot().preferences.gameMode));
    setGameMode('pve');
    assert.ok(['regular', 'pve'].includes(getLocalStateSnapshot().preferences.gameMode));
  });
});
