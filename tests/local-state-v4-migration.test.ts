import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCHEMA_VERSION,
  V4_SCHEMA_VERSION,
  V1_SCHEMA_VERSION,
  V2_SCHEMA_VERSION,
  V3_SCHEMA_VERSION,
  createDefaultQuestProgress,
  createDefaultState,
  type LocalStateV1,
  type LocalStateV2,
  type LocalStateV3,
  type ModeStateV2,
  type LocalStateV4,
} from '../src/lib/local-state/schema';
import {
  loadLocalState,
  upgradeV1ToV4,
  upgradeV2ToV4,
  upgradeV3ToV4,
  upgradeV4ToV5,
} from '../src/lib/local-state/migrate';
import { isValidLocalState, isValidLocalStateV4 } from '../src/lib/local-state/validate';
import {
  exportLocalState,
  serializeExport,
  validateImport,
} from '../src/lib/local-state/export-import';

const NOW = '2026-08-03T12:00:00.000Z';
const EARLIER = '2026-01-15T08:00:00.000Z';

function emptyModeV2(): ModeStateV2 {
  return { quests: createDefaultQuestProgress(), raidPlans: [] };
}

function v1(gameMode: 'regular' | 'pve' = 'regular'): LocalStateV1 {
  return {
    schemaVersion: V1_SCHEMA_VERSION,
    preferences: { gameMode },
    metadata: { createdAt: EARLIER, updatedAt: EARLIER },
  };
}

function v2(gameMode: 'regular' | 'pve' = 'regular'): LocalStateV2 {
  return {
    schemaVersion: V2_SCHEMA_VERSION,
    preferences: { gameMode },
    modeData: {
      regular: {
        quests: { activeQuestIds: ['q-reg'], completedQuestIds: ['c-reg'], ownedItemCounts: { i1: 2 } },
        raidPlans: [
          {
            id: 'plan-r',
            name: 'Customs run',
            mapId: 'customs',
            activeQuestIds: ['q-reg'],
            checkedObjectiveKeys: [],
            customItems: [],
            notes: 'bring keys',
            createdAt: EARLIER,
            updatedAt: EARLIER,
          },
        ],
      },
      pve: emptyModeV2(),
    },
    metadata: { createdAt: EARLIER, updatedAt: EARLIER },
  };
}

function v3(gameMode: 'regular' | 'pve' = 'regular'): LocalStateV3 {
  return {
    schemaVersion: V3_SCHEMA_VERSION,
    preferences: { gameMode },
    modeData: {
      regular: {
        quests: { activeQuestIds: ['q-reg'], completedQuestIds: [], ownedItemCounts: {} },
        raidPlans: [],
      },
      pve: {
        quests: { activeQuestIds: ['q-pve'], completedQuestIds: [], ownedItemCounts: {} },
        raidPlans: [],
      },
    },
    recentSearches: [
      {
        query: 'Salewa',
        normalizedQuery: 'salewa',
        searchedAt: EARLIER,
      },
    ],
    metadata: { createdAt: EARLIER, updatedAt: EARLIER },
  };
}

test('upgradeV1ToV4 sets beginnerMode false and empty watchlists', () => {
  const upgraded = upgradeV1ToV4(v1('pve'));
  assert.equal(upgraded.schemaVersion, V4_SCHEMA_VERSION);
  assert.equal(upgraded.preferences.gameMode, 'pve');
  assert.equal(upgraded.preferences.beginnerMode, false);
  assert.deepEqual(upgraded.modeData.regular.watchlist, []);
  assert.deepEqual(upgraded.modeData.pve.watchlist, []);
  assert.deepEqual(upgraded.recentSearches, []);
  assert.equal(upgraded.metadata.createdAt, EARLIER);
  assert.equal(upgraded.metadata.updatedAt, EARLIER);
  assert.ok(isValidLocalStateV4(upgraded));
});

test('upgradeV2ToV4 preserves quests and raid plans, adds empty watchlists', () => {
  const upgraded = upgradeV2ToV4(v2('regular'));
  assert.equal(upgraded.schemaVersion, V4_SCHEMA_VERSION);
  assert.equal(upgraded.preferences.beginnerMode, false);
  assert.deepEqual(upgraded.modeData.regular.quests.activeQuestIds, ['q-reg']);
  assert.equal(upgraded.modeData.regular.raidPlans[0]?.name, 'Customs run');
  assert.deepEqual(upgraded.modeData.regular.watchlist, []);
  assert.deepEqual(upgraded.modeData.pve.watchlist, []);
  assert.deepEqual(upgraded.recentSearches, []);
  assert.ok(isValidLocalStateV4(upgraded));
});

test('upgradeV3ToV4 preserves recentSearches and quests, adds empty watchlists', () => {
  const upgraded = upgradeV3ToV4(v3('pve'));
  assert.equal(upgraded.schemaVersion, V4_SCHEMA_VERSION);
  assert.equal(upgraded.preferences.gameMode, 'pve');
  assert.equal(upgraded.preferences.beginnerMode, false);
  assert.equal(upgraded.recentSearches[0]?.query, 'Salewa');
  assert.deepEqual(upgraded.modeData.regular.quests.activeQuestIds, ['q-reg']);
  assert.deepEqual(upgraded.modeData.pve.quests.activeQuestIds, ['q-pve']);
  assert.deepEqual(upgraded.modeData.regular.watchlist, []);
  assert.deepEqual(upgraded.modeData.pve.watchlist, []);
  assert.equal(upgraded.metadata.updatedAt, EARLIER);
  assert.ok(isValidLocalStateV4(upgraded));
});

test('loadLocalState upgrades V1 → V4', () => {
  const outcome = loadLocalState({
    rawMainJson: JSON.stringify(v1('regular')),
    legacyGameMode: null,
    now: NOW,
  });
  assert.equal(outcome.upgradedFromV1, true);
  assert.equal(outcome.state.schemaVersion, SCHEMA_VERSION);
  assert.equal(outcome.state.preferences.beginnerMode, false);
  assert.deepEqual(outcome.state.modeData.regular.watchlist, []);
});

test('loadLocalState upgrades V2 → V4', () => {
  const outcome = loadLocalState({
    rawMainJson: JSON.stringify(v2('pve')),
    legacyGameMode: null,
    now: NOW,
  });
  assert.equal(outcome.upgradedFromV2, true);
  assert.equal(outcome.state.schemaVersion, SCHEMA_VERSION);
  assert.equal(outcome.state.modeData.regular.raidPlans[0]?.id, 'plan-r');
  assert.deepEqual(outcome.state.modeData.regular.watchlist, []);
});

test('loadLocalState upgrades V3 → V4', () => {
  const outcome = loadLocalState({
    rawMainJson: JSON.stringify(v3('regular')),
    legacyGameMode: null,
    now: NOW,
  });
  assert.equal(outcome.upgradedFromV3, true);
  assert.equal(outcome.state.schemaVersion, SCHEMA_VERSION);
  assert.equal(outcome.state.recentSearches[0]?.normalizedQuery, 'salewa');
  assert.equal(outcome.state.preferences.beginnerMode, false);
});

test('loadLocalState upgrades V4 and preserves all existing fields', () => {
  const state: LocalStateV4 = upgradeV3ToV4(v3('regular'));
  state.preferences.beginnerMode = true;
  state.modeData.regular.watchlist = [
    {
      itemId: 'item-1',
      priceType: 'flea-net',
      baselinePrice: 10000,
      baselineUpdatedAt: EARLIER,
      addedAt: EARLIER,
    },
  ];
  state.recentSearches = [
    { query: 'M4A1', normalizedQuery: 'm4a1', searchedAt: EARLIER },
  ];
  const outcome = loadLocalState({
    rawMainJson: JSON.stringify(state),
    legacyGameMode: null,
    now: NOW,
  });
  assert.equal(outcome.upgradedFromV1, false);
  assert.equal(outcome.upgradedFromV2, false);
  assert.equal(outcome.upgradedFromV3, false);
  assert.equal(outcome.upgradedFromV4, true);
  assert.equal(outcome.state.preferences.beginnerMode, true);
  assert.equal(outcome.state.modeData.regular.watchlist[0]?.itemId, 'item-1');
  assert.equal(outcome.state.recentSearches[0]?.query, 'M4A1');
});

test('export then import round-trips V5 including watchlist and beginnerMode', () => {
  const state = createDefaultState(NOW);
  state.preferences.beginnerMode = true;
  state.modeData.pve.watchlist = [
    {
      itemId: 'pve-item',
      priceType: 'trader',
      baselinePrice: 5000,
      addedAt: NOW,
    },
  ];
  state.modeData.regular.quests.activeQuestIds = ['keep-me'];
  state.recentSearches = [{ query: 'keep', normalizedQuery: 'keep', searchedAt: NOW }];
  const result = validateImport(serializeExport(exportLocalState(state, NOW)));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.state, state);
  }
});

test('upgradeV4ToV5 adds only craft and budget defaults', () => {
  const v4 = upgradeV3ToV4(v3('regular'));
  const upgraded = upgradeV4ToV5(v4);
  assert.equal(upgraded.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(upgraded.modeData.regular.crafting.preferences.stationLevels, {});
  assert.deepEqual(upgraded.modeData.pve.budgetPresets, []);
  assert.equal(upgraded.metadata.updatedAt, EARLIER);
  assert.ok(isValidLocalState(upgraded));
});

test('validateImport upgrades a V3 export file to V4', () => {
  const file = { schemaVersion: V3_SCHEMA_VERSION, exportedAt: NOW, state: v3('pve') };
  const result = validateImport(JSON.stringify(file));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.state.schemaVersion, SCHEMA_VERSION);
    assert.equal(result.state.preferences.beginnerMode, false);
    assert.equal(result.state.recentSearches[0]?.query, 'Salewa');
    assert.deepEqual(result.state.modeData.pve.quests.activeQuestIds, ['q-pve']);
  }
});

test('a future schemaVersion is refused on load', () => {
  const future = { ...createDefaultState(NOW), schemaVersion: SCHEMA_VERSION + 1 };
  const outcome = loadLocalState({
    rawMainJson: JSON.stringify(future),
    legacyGameMode: 'pve',
    now: NOW,
  });
  assert.equal(outcome.refusedNewerVersion, true);
  assert.deepEqual(outcome.state, createDefaultState(NOW));
});

test('validateImport rejects a future schema version', () => {
  const file = {
    schemaVersion: SCHEMA_VERSION + 1,
    exportedAt: NOW,
    state: createDefaultState(NOW),
  };
  assert.deepEqual(validateImport(JSON.stringify(file)), {
    ok: false,
    code: 'unsupported-version',
  });
});
