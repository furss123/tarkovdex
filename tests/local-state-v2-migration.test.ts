import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultQuestProgress,
  createDefaultState,
  SCHEMA_VERSION,
  V4_SCHEMA_VERSION,
  V1_SCHEMA_VERSION,
  V2_SCHEMA_VERSION,
  V3_SCHEMA_VERSION,
  type LocalStateV1,
  type ModeStateV2,
} from '../src/lib/local-state/schema';
import {
  loadLocalState,
  upgradeV1ToV2,
  upgradeV1ToV3,
  upgradeV1ToV4,
} from '../src/lib/local-state/migrate';
import {
  isValidLocalState,
  isValidLocalStateV1,
  isValidLocalStateV2,
  isValidLocalStateV3,
  isValidLocalStateV4,
} from '../src/lib/local-state/validate';
import { exportLocalState, serializeExport, validateImport } from '../src/lib/local-state/export-import';

const NOW = '2026-08-03T12:00:00.000Z';

function emptyModeV2(): ModeStateV2 {
  return { quests: createDefaultQuestProgress(), raidPlans: [] };
}

function v1(gameMode: 'regular' | 'pve', createdAt: string, updatedAt: string): LocalStateV1 {
  return { schemaVersion: V1_SCHEMA_VERSION, preferences: { gameMode }, metadata: { createdAt, updatedAt } };
}

// ---------------------------------------------------------------------------
// upgradeV1ToV2 — pure
// ---------------------------------------------------------------------------

test('upgradeV1ToV2 preserves gameMode and both timestamps exactly', () => {
  const source = v1('pve', '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
  const upgraded = upgradeV1ToV2(source);
  assert.equal(upgraded.schemaVersion, V2_SCHEMA_VERSION);
  assert.equal(upgraded.preferences.gameMode, 'pve');
  assert.equal(upgraded.metadata.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(upgraded.metadata.updatedAt, '2026-02-01T00:00:00.000Z', 'updatedAt is preserved, not bumped to "now"');
});

test('upgradeV1ToV2 creates safe, empty mode state for both modes', () => {
  const upgraded = upgradeV1ToV2(v1('regular', NOW, NOW));
  assert.deepEqual(upgraded.modeData.regular, emptyModeV2());
  assert.deepEqual(upgraded.modeData.pve, emptyModeV2());
});

test('upgradeV1ToV2 output is itself a valid V2 document', () => {
  assert.ok(isValidLocalStateV2(upgradeV1ToV2(v1('pve', NOW, NOW))));
});

test('upgradeV1ToV3 output is a valid V3 document with empty recentSearches', () => {
  const upgraded = upgradeV1ToV3(v1('regular', NOW, NOW));
  assert.ok(isValidLocalStateV3(upgraded));
  assert.equal(upgraded.schemaVersion, V3_SCHEMA_VERSION);
  assert.deepEqual(upgraded.recentSearches, []);
});

test('upgradeV1ToV4 output is a valid V4 intermediate document with empty watchlists', () => {
  const upgraded = upgradeV1ToV4(v1('regular', NOW, NOW));
  assert.ok(isValidLocalStateV4(upgraded));
  assert.equal(upgraded.schemaVersion, V4_SCHEMA_VERSION);
  assert.equal(upgraded.preferences.beginnerMode, false);
  assert.deepEqual(upgraded.recentSearches, []);
  assert.deepEqual(upgraded.modeData.regular.watchlist, []);
  assert.deepEqual(upgraded.modeData.pve.watchlist, []);
});

// ---------------------------------------------------------------------------
// loadLocalState — V1 document on disk
// ---------------------------------------------------------------------------

test('loadLocalState upgrades a stored V1 regular document', () => {
  const outcome = loadLocalState({
    rawMainJson: JSON.stringify(v1('regular', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')),
    legacyGameMode: null,
    now: NOW,
  });
  assert.equal(outcome.upgradedFromV1, true);
  assert.equal(outcome.state.schemaVersion, SCHEMA_VERSION);
  assert.equal(outcome.state.preferences.gameMode, 'regular');
  assert.equal(outcome.state.metadata.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(outcome.state.metadata.updatedAt, '2026-01-02T00:00:00.000Z');
  assert.deepEqual(outcome.state.modeData.regular.quests, createDefaultQuestProgress());
  assert.deepEqual(outcome.state.modeData.regular.raidPlans, []);
  assert.deepEqual(outcome.state.modeData.regular.watchlist, []);
  assert.equal(outcome.state.preferences.beginnerMode, false);
});

test('loadLocalState upgrades a stored V1 pve document', () => {
  const outcome = loadLocalState({
    rawMainJson: JSON.stringify(v1('pve', NOW, NOW)),
    legacyGameMode: null,
    now: NOW,
  });
  assert.equal(outcome.state.preferences.gameMode, 'pve');
  assert.equal(outcome.upgradedFromV1, true);
});

test('a V1 document on disk takes priority over the legacy key — legacy is not consulted', () => {
  const outcome = loadLocalState({
    rawMainJson: JSON.stringify(v1('pve', NOW, NOW)),
    legacyGameMode: 'regular',
    now: NOW,
  });
  assert.equal(outcome.state.preferences.gameMode, 'pve');
  assert.equal(outcome.adoptedLegacyGameMode, false);
});

test('a V1 document with corrupted preferences is recovered before upgrading', () => {
  const raw = JSON.stringify({
    schemaVersion: V1_SCHEMA_VERSION,
    preferences: { gameMode: 'nonsense' },
    metadata: { createdAt: NOW, updatedAt: NOW },
  });
  const outcome = loadLocalState({ rawMainJson: raw, legacyGameMode: null, now: NOW });
  assert.equal(outcome.upgradedFromV1, true);
  assert.equal(outcome.state.preferences.gameMode, 'regular');
});

test('a V1 document with corrupted metadata is recovered before upgrading', () => {
  const raw = JSON.stringify({
    schemaVersion: V1_SCHEMA_VERSION,
    preferences: { gameMode: 'pve' },
    metadata: { createdAt: 'garbage', updatedAt: NOW },
  });
  const outcome = loadLocalState({ rawMainJson: raw, legacyGameMode: null, now: NOW });
  assert.equal(outcome.state.metadata.createdAt, NOW);
  assert.equal(outcome.state.preferences.gameMode, 'pve');
});

test('legacy key only (no V1, no V2 document) still works exactly as in Phase 2', () => {
  const outcome = loadLocalState({ rawMainJson: null, legacyGameMode: 'pve', now: NOW });
  assert.equal(outcome.state.schemaVersion, SCHEMA_VERSION);
  assert.equal(outcome.state.preferences.gameMode, 'pve');
  assert.equal(outcome.adoptedLegacyGameMode, true);
  assert.equal(outcome.upgradedFromV1, false);
});

test('a stored V2 document loads normally, not through the upgrade path', () => {
  const state = createDefaultState(NOW);
  state.preferences.gameMode = 'pve';
  const outcome = loadLocalState({ rawMainJson: JSON.stringify(state), legacyGameMode: null, now: NOW });
  assert.equal(outcome.upgradedFromV1, false);
  assert.equal(outcome.state.preferences.gameMode, 'pve');
});

test('re-migrating an already-V2 document is idempotent', () => {
  const first = loadLocalState({
    rawMainJson: JSON.stringify(v1('pve', NOW, NOW)),
    legacyGameMode: null,
    now: NOW,
  });
  const second = loadLocalState({
    rawMainJson: JSON.stringify(first.state),
    legacyGameMode: null,
    now: '2026-08-03T13:00:00.000Z',
  });
  assert.deepEqual(second.state, first.state);
  assert.equal(second.upgradedFromV1, false);
});

test('a future schemaVersion beyond current is still refused', () => {
  const future = { ...createDefaultState(NOW), schemaVersion: SCHEMA_VERSION + 1 };
  const outcome = loadLocalState({
    rawMainJson: JSON.stringify(future),
    legacyGameMode: 'pve',
    now: NOW,
  });
  assert.equal(outcome.refusedNewerVersion, true);
  assert.equal(outcome.adoptedLegacyGameMode, false);
  assert.deepEqual(outcome.state, createDefaultState(NOW));
});

// ---------------------------------------------------------------------------
// import — accepts V1 files, exports only current
// ---------------------------------------------------------------------------

test('exportLocalState always produces a current-schema envelope', () => {
  const exported = exportLocalState(createDefaultState(NOW), NOW);
  assert.equal(exported.schemaVersion, SCHEMA_VERSION);
});

test('validateImport accepts a Phase-2-style V1 export file and upgrades it', () => {
  const v1File = { schemaVersion: V1_SCHEMA_VERSION, exportedAt: NOW, state: v1('pve', NOW, NOW) };
  const result = validateImport(JSON.stringify(v1File));
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.state.schemaVersion, SCHEMA_VERSION);
    assert.equal(result.state.preferences.gameMode, 'pve');
    assert.deepEqual(result.state.modeData.regular.watchlist, []);
    assert.equal(result.state.preferences.beginnerMode, false);
  }
});

test('validateImport accepts a current export file as-is', () => {
  const state = createDefaultState(NOW);
  state.preferences.gameMode = 'pve';
  const file = serializeExport(exportLocalState(state, NOW));
  const result = validateImport(file);
  assert.ok(result.ok);
  if (result.ok) assert.deepEqual(result.state, state);
});

test('validateImport rejects a malformed V1 state even inside a correctly-versioned envelope', () => {
  const file = {
    schemaVersion: V1_SCHEMA_VERSION,
    exportedAt: NOW,
    state: { schemaVersion: V1_SCHEMA_VERSION, preferences: { gameMode: 'nonsense' }, metadata: { createdAt: NOW, updatedAt: NOW } },
  };
  const result = validateImport(JSON.stringify(file));
  assert.deepEqual(result, { ok: false, code: 'invalid-state' });
});

test('validateImport still rejects a schemaVersion beyond the current one', () => {
  const file = { schemaVersion: SCHEMA_VERSION + 1, exportedAt: NOW, state: createDefaultState(NOW) };
  const result = validateImport(JSON.stringify(file));
  assert.deepEqual(result, { ok: false, code: 'unsupported-version' });
});

test('a failed import (bad V1 state) leaves no partial result', () => {
  const file = { schemaVersion: V1_SCHEMA_VERSION, exportedAt: NOW, state: { schemaVersion: V1_SCHEMA_VERSION } };
  const result = validateImport(JSON.stringify(file));
  assert.equal(result.ok, false);
  assert.ok(!('state' in result));
});

test('isValidLocalStateV1 is strict and independent of the current validator', () => {
  assert.ok(isValidLocalStateV1(v1('regular', NOW, NOW)));
  assert.ok(!isValidLocalStateV1(createDefaultState(NOW)), 'a current document is not a valid V1 document');
  assert.ok(!isValidLocalState(v1('regular', NOW, NOW)), 'a V1 document is not a valid current document');
});
