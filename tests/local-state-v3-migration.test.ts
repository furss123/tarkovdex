import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SCHEMA_VERSION,
  V4_SCHEMA_VERSION,
  V2_SCHEMA_VERSION,
  V3_SCHEMA_VERSION,
  createDefaultQuestProgress,
  createDefaultState,
  type LocalStateV2,
} from '../src/lib/local-state/schema';
import { loadLocalState, upgradeV2ToV3, upgradeV2ToV4 } from '../src/lib/local-state/migrate';
import {
  isValidLocalState,
  isValidLocalStateV2,
  isValidLocalStateV3,
  isValidLocalStateV4,
} from '../src/lib/local-state/validate';
import {
  exportLocalState,
  serializeExport,
  validateImport,
} from '../src/lib/local-state/export-import';
import {
  clearRecentSearches,
  getLocalStateSnapshot,
  hydrateLocalState,
  recordRecentSearch,
  removeRecentSearch,
  resetLocalStateStoreForTests,
} from '../src/lib/local-state/store';
import { pushRecentSearch } from '../src/lib/search/recent';

const NOW = '2026-08-03T12:00:00.000Z';

function emptyModeV2(): LocalStateV2['modeData']['regular'] {
  return { quests: createDefaultQuestProgress(), raidPlans: [] };
}

function v2(gameMode: 'regular' | 'pve' = 'regular'): LocalStateV2 {
  return {
    schemaVersion: V2_SCHEMA_VERSION,
    preferences: { gameMode },
    modeData: { regular: emptyModeV2(), pve: emptyModeV2() },
    metadata: { createdAt: NOW, updatedAt: NOW },
  };
}

test('upgradeV2ToV3 preserves modeData and timestamps, adds empty recentSearches', () => {
  const source = v2('pve');
  source.modeData.regular.quests.activeQuestIds = ['abc'];
  const upgraded = upgradeV2ToV3(source);
  assert.equal(upgraded.schemaVersion, V3_SCHEMA_VERSION);
  assert.deepEqual(upgraded.recentSearches, []);
  assert.deepEqual(upgraded.modeData.regular.quests.activeQuestIds, ['abc']);
  assert.equal(upgraded.metadata.updatedAt, NOW);
  assert.ok(isValidLocalStateV3(upgraded));
});

test('upgradeV2ToV4 produces a valid V4 intermediate document with empty watchlists', () => {
  const source = v2('pve');
  source.modeData.regular.quests.activeQuestIds = ['abc'];
  const upgraded = upgradeV2ToV4(source);
  assert.equal(upgraded.schemaVersion, V4_SCHEMA_VERSION);
  assert.equal(upgraded.preferences.beginnerMode, false);
  assert.deepEqual(upgraded.modeData.regular.watchlist, []);
  assert.deepEqual(upgraded.modeData.pve.watchlist, []);
  assert.deepEqual(upgraded.modeData.regular.quests.activeQuestIds, ['abc']);
  assert.ok(isValidLocalStateV4(upgraded));
});

test('loadLocalState upgrades a stored V2 document to current', () => {
  const outcome = loadLocalState({
    rawMainJson: JSON.stringify(v2('regular')),
    legacyGameMode: null,
    now: NOW,
  });
  assert.equal(outcome.upgradedFromV2, true);
  assert.equal(outcome.state.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(outcome.state.recentSearches, []);
  assert.deepEqual(outcome.state.modeData.regular.watchlist, []);
  assert.equal(outcome.state.preferences.beginnerMode, false);
});

test('validateImport accepts V2 export and upgrades to current', () => {
  const file = {
    schemaVersion: V2_SCHEMA_VERSION,
    exportedAt: NOW,
    state: v2('pve'),
  };
  const result = validateImport(JSON.stringify(file));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.state.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(result.state.recentSearches, []);
    assert.equal(result.state.preferences.beginnerMode, false);
  }
});

test('exportLocalState produces current schema with recentSearches', () => {
  const state = createDefaultState(NOW);
  state.recentSearches = pushRecentSearch([], {
    query: 'Salewa',
    searchedAt: NOW,
  });
  const exported = exportLocalState(state, NOW);
  assert.equal(exported.schemaVersion, SCHEMA_VERSION);
  assert.ok(isValidLocalState(exported.state));
  const roundTrip = validateImport(serializeExport(exported));
  assert.equal(roundTrip.ok, true);
  if (roundTrip.ok) {
    assert.equal(roundTrip.state.recentSearches[0]?.query, 'Salewa');
  }
});

test('isValidLocalStateV2 rejects a current document', () => {
  assert.ok(isValidLocalStateV2(v2()));
  assert.ok(!isValidLocalStateV2(createDefaultState(NOW)));
});

test('recordRecentSearch / remove / clear persist through the store', async () => {
  resetLocalStateStoreForTests();
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  };
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: storage,
      addEventListener() {},
      removeEventListener() {},
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  });

  hydrateLocalState();
  recordRecentSearch({ query: 'Salewa', locale: 'en' });
  assert.equal(getLocalStateSnapshot().recentSearches[0]?.query, 'Salewa');
  recordRecentSearch({ query: 'salewa', locale: 'en' });
  assert.equal(getLocalStateSnapshot().recentSearches.length, 1);
  removeRecentSearch(getLocalStateSnapshot().recentSearches[0]!.normalizedQuery);
  assert.equal(getLocalStateSnapshot().recentSearches.length, 0);
  recordRecentSearch({ query: 'M855', locale: 'en' });
  clearRecentSearches();
  assert.equal(getLocalStateSnapshot().recentSearches.length, 0);
  resetLocalStateStoreForTests();
});
