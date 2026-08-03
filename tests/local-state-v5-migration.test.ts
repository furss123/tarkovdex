import assert from 'node:assert/strict';
import test from 'node:test';
import {
  V4_SCHEMA_VERSION,
  createDefaultState,
  type LocalStateV4,
} from '../src/lib/local-state/schema';
import { loadLocalState } from '../src/lib/local-state/migrate';
import { exportLocalState, serializeExport, validateImport } from '../src/lib/local-state/export-import';

const NOW = '2026-08-03T12:00:00.000Z';

function v4(): LocalStateV4 {
  const current = createDefaultState(NOW);
  return {
    schemaVersion: V4_SCHEMA_VERSION,
    preferences: { gameMode: 'pve', beginnerMode: true },
    modeData: {
      regular: {
        quests: {
          activeQuestIds: ['regular-quest'],
          completedQuestIds: [],
          ownedItemCounts: { salewa: 2 },
        },
        raidPlans: [],
        watchlist: [],
      },
      pve: {
        quests: current.modeData.pve.quests,
        raidPlans: [],
        watchlist: [],
      },
    },
    recentSearches: [{ query: 'M4', normalizedQuery: 'm4', searchedAt: NOW }],
    metadata: current.metadata,
  };
}

test('V4 load upgrades to V5 without losing existing local state', () => {
  const outcome = loadLocalState({ rawMainJson: JSON.stringify(v4()), legacyGameMode: null, now: NOW });
  assert.equal(outcome.upgradedFromV4, true);
  assert.equal(outcome.state.preferences.beginnerMode, true);
  assert.equal(outcome.state.modeData.regular.quests.ownedItemCounts.salewa, 2);
  assert.equal(outcome.state.recentSearches[0]?.query, 'M4');
  assert.deepEqual(outcome.state.modeData.regular.budgetPresets, []);
  assert.equal(outcome.state.metadata.updatedAt, NOW);
});

test('V5 export/import retains crafting and budget state', () => {
  const state = createDefaultState(NOW);
  state.modeData.regular.crafting.preferences.stationLevels = { nutrition: 3 };
  state.modeData.regular.budgetPresets = [{
    id: 'kit',
    name: 'Budget kit',
    budget: 100000,
    lines: [{ id: 'line', itemId: 'item', category: 'gun', quantity: 1, priceType: 'flea' }],
    notes: 'keep',
    createdAt: NOW,
    updatedAt: NOW,
  }];
  const result = validateImport(serializeExport(exportLocalState(state, NOW)));
  assert.ok(result.ok);
  if (result.ok) assert.deepEqual(result.state, state);
});
