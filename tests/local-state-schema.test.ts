import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_GAME_MODE,
  SCHEMA_VERSION,
  SERVER_DEFAULT_STATE,
  createDefaultModeState,
  createDefaultState,
} from '../src/lib/local-state/schema';
import {
  isValidGameMode,
  isValidLocalState,
  recoverLocalState,
} from '../src/lib/local-state/validate';

const NOW = '2026-08-03T12:00:00.000Z';

test('createDefaultState produces a fully valid current document', () => {
  const state = createDefaultState(NOW);
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.preferences.gameMode, DEFAULT_GAME_MODE);
  assert.equal(state.preferences.beginnerMode, false);
  assert.deepEqual(state.modeData.regular.watchlist, []);
  assert.deepEqual(state.modeData.pve.watchlist, []);
  assert.equal(state.metadata.createdAt, NOW);
  assert.equal(state.metadata.updatedAt, NOW);
  assert.ok(isValidLocalState(state));
});

test('SERVER_DEFAULT_STATE never touches the clock and is always PvP', () => {
  assert.equal(SERVER_DEFAULT_STATE.preferences.gameMode, 'regular');
  assert.equal(SERVER_DEFAULT_STATE.metadata.createdAt, '1970-01-01T00:00:00.000Z');
  assert.ok(isValidLocalState(SERVER_DEFAULT_STATE));
});

test('isValidGameMode accepts only the two literals', () => {
  assert.ok(isValidGameMode('regular'));
  assert.ok(isValidGameMode('pve'));
  assert.ok(!isValidGameMode('pvp'));
  assert.ok(!isValidGameMode(''));
  assert.ok(!isValidGameMode(null));
  assert.ok(!isValidGameMode(undefined));
  assert.ok(!isValidGameMode(1));
});

// ---------------------------------------------------------------------------
// isValidLocalState — strict, whole-document, never defaults
// ---------------------------------------------------------------------------

test('isValidLocalState accepts a well-formed document', () => {
  assert.ok(isValidLocalState(createDefaultState(NOW)));
});

test('isValidLocalState rejects non-objects and arrays', () => {
  assert.ok(!isValidLocalState(null));
  assert.ok(!isValidLocalState(undefined));
  assert.ok(!isValidLocalState('string'));
  assert.ok(!isValidLocalState(42));
  assert.ok(!isValidLocalState([]));
  assert.ok(!isValidLocalState([createDefaultState(NOW)]));
});

test('isValidLocalState rejects a wrong schemaVersion', () => {
  const state = createDefaultState(NOW);
  assert.ok(!isValidLocalState({ ...state, schemaVersion: 0 }));
  assert.ok(!isValidLocalState({ ...state, schemaVersion: 1 }));
  assert.ok(!isValidLocalState({ ...state, schemaVersion: 3 }));
  assert.ok(!isValidLocalState({ ...state, schemaVersion: SCHEMA_VERSION + 1 }));
  assert.ok(!isValidLocalState({ ...state, schemaVersion: '4' }));
});

test('isValidLocalState rejects an invalid gameMode', () => {
  const state = createDefaultState(NOW);
  assert.ok(
    !isValidLocalState({
      ...state,
      preferences: { gameMode: 'pvp', beginnerMode: false },
    }),
  );
  assert.ok(!isValidLocalState({ ...state, preferences: {} }));
  assert.ok(
    !isValidLocalState({
      ...state,
      preferences: { gameMode: 'regular' },
    }),
    'missing beginnerMode is invalid for V4',
  );
});

test('isValidLocalState rejects malformed timestamps', () => {
  const state = createDefaultState(NOW);
  assert.ok(
    !isValidLocalState({
      ...state,
      metadata: { createdAt: 'not a date', updatedAt: NOW },
    }),
  );
  assert.ok(
    !isValidLocalState({
      ...state,
      metadata: { createdAt: NOW, updatedAt: '' },
    }),
  );
});

test('isValidLocalState rejects unknown top-level fields', () => {
  const state = createDefaultState(NOW);
  assert.ok(!isValidLocalState({ ...state, extra: true }));
});

test('isValidLocalState rejects a __proto__ key smuggled in via JSON.parse', () => {
  // JSON.parse (unlike an object literal) creates a literal OWN property
  // named "__proto__" — it never reassigns the real prototype — but it must
  // still be rejected as untrusted document content.
  const polluted = JSON.parse(
    '{"__proto__":{"polluted":true},"schemaVersion":1,"preferences":{"gameMode":"regular"},"metadata":{"createdAt":"2026-08-03T12:00:00.000Z","updatedAt":"2026-08-03T12:00:00.000Z"}}',
  );
  assert.ok(!isValidLocalState(polluted));
  assert.equal(({} as Record<string, unknown>).polluted, undefined, 'no actual prototype pollution occurred');
});

test('isValidLocalState rejects a __proto__ key nested inside preferences', () => {
  const nested = JSON.parse(
    '{"schemaVersion":1,"preferences":{"gameMode":"regular","__proto__":1},"metadata":{"createdAt":"2026-08-03T12:00:00.000Z","updatedAt":"2026-08-03T12:00:00.000Z"}}',
  );
  assert.ok(!isValidLocalState(nested));
});

// ---------------------------------------------------------------------------
// recoverLocalState — lenient, per-field, initial-load path
// ---------------------------------------------------------------------------

test('recoverLocalState round-trips an already-valid document unchanged', () => {
  const state = createDefaultState(NOW);
  const { state: recovered, recoveredFields } = recoverLocalState(state, NOW);
  assert.deepEqual(recovered, state);
  assert.deepEqual(recoveredFields, []);
});

test('recoverLocalState defaults a bad gameMode but keeps the rest', () => {
  const raw = {
    schemaVersion: SCHEMA_VERSION,
    preferences: { gameMode: 'nonsense', beginnerMode: true },
    modeData: { regular: createDefaultModeState(), pve: createDefaultModeState() },
    recentSearches: [],
    metadata: { createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-06-01T00:00:00.000Z' },
  };
  const { state, recoveredFields } = recoverLocalState(raw, NOW);
  assert.equal(state.preferences.gameMode, DEFAULT_GAME_MODE);
  assert.equal(state.preferences.beginnerMode, false);
  assert.equal(state.metadata.createdAt, '2020-01-01T00:00:00.000Z');
  assert.equal(state.metadata.updatedAt, '2020-06-01T00:00:00.000Z');
  assert.deepEqual(recoveredFields, ['preferences']);
});

test('recoverLocalState defaults only createdAt when only that field is bad', () => {
  const raw = {
    schemaVersion: SCHEMA_VERSION,
    preferences: { gameMode: 'pve', beginnerMode: true },
    modeData: { regular: createDefaultModeState(), pve: createDefaultModeState() },
    recentSearches: [],
    metadata: { createdAt: 'garbage', updatedAt: '2020-06-01T00:00:00.000Z' },
  };
  const { state, recoveredFields } = recoverLocalState(raw, NOW);
  assert.equal(state.preferences.gameMode, 'pve');
  assert.equal(state.preferences.beginnerMode, true);
  assert.equal(state.metadata.createdAt, NOW);
  assert.equal(state.metadata.updatedAt, '2020-06-01T00:00:00.000Z');
  assert.deepEqual(recoveredFields, ['metadata.createdAt']);
});

test('recoverLocalState defaults the whole metadata object when it is missing', () => {
  const raw = {
    schemaVersion: SCHEMA_VERSION,
    preferences: { gameMode: 'pve', beginnerMode: false },
    modeData: { regular: createDefaultModeState(), pve: createDefaultModeState() },
    recentSearches: [],
  };
  const { state, recoveredFields } = recoverLocalState(raw, NOW);
  assert.equal(state.metadata.createdAt, NOW);
  assert.equal(state.metadata.updatedAt, NOW);
  assert.deepEqual(recoveredFields, ['metadata']);
});

test('recoverLocalState defaults modeData entirely when missing, independent of other fields', () => {
  const raw = {
    schemaVersion: SCHEMA_VERSION,
    preferences: { gameMode: 'pve', beginnerMode: false },
    recentSearches: [],
    metadata: { createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
  };
  const { state, recoveredFields } = recoverLocalState(raw, NOW);
  assert.equal(state.preferences.gameMode, 'pve');
  assert.deepEqual(state.modeData.regular, createDefaultModeState());
  assert.deepEqual(state.modeData.pve, createDefaultModeState());
  assert.deepEqual(recoveredFields, ['modeData']);
});

test('recoverLocalState drops only the broken raid plan entry, keeping the rest', () => {
  const goodPlan = {
    id: 'p1',
    name: 'Good plan',
    mapId: null,
    activeQuestIds: [],
    checkedObjectiveKeys: [],
    customItems: [],
    notes: '',
    createdAt: NOW,
    updatedAt: NOW,
  };
  const raw = {
    schemaVersion: SCHEMA_VERSION,
    preferences: { gameMode: 'regular', beginnerMode: false },
    modeData: {
      regular: {
        quests: { activeQuestIds: [], completedQuestIds: [], ownedItemCounts: {} },
        raidPlans: [goodPlan, { id: 'broken', name: 123 }],
        watchlist: [],
      },
      pve: createDefaultModeState(),
    },
    recentSearches: [],
    metadata: { createdAt: NOW, updatedAt: NOW },
  };
  const { state, recoveredFields } = recoverLocalState(raw, NOW);
  assert.deepEqual(state.modeData.regular.raidPlans, [goodPlan]);
  assert.ok(recoveredFields.some((field) => field.includes('raidPlans')));
});

test('recoverLocalState treats a non-object top level as fully corrupt', () => {
  for (const bad of [null, undefined, 'x', 42, [], true]) {
    const { state, recoveredFields } = recoverLocalState(bad, NOW);
    assert.deepEqual(state, createDefaultState(NOW));
    assert.deepEqual(recoveredFields, ['*']);
  }
});

test('recoverLocalState strips dangerous keys rather than trusting them', () => {
  const raw = JSON.parse(
    '{"__proto__":{"x":1},"preferences":{"gameMode":"pve"},"metadata":{"createdAt":"2020-01-01T00:00:00.000Z","updatedAt":"2020-01-01T00:00:00.000Z"}}',
  );
  const { state, recoveredFields } = recoverLocalState(raw, NOW);
  assert.deepEqual(state, createDefaultState(NOW));
  assert.deepEqual(recoveredFields, ['*']);
});

test('recoverLocalState never throws on wildly malformed input', () => {
  const inputs: unknown[] = [
    { preferences: 'not an object' },
    { preferences: null },
    { metadata: 'nope' },
    { preferences: { gameMode: { nested: true } } },
    { schemaVersion: Number.NaN, preferences: { gameMode: 'regular' } },
  ];
  for (const input of inputs) {
    assert.doesNotThrow(() => recoverLocalState(input, NOW));
  }
});
