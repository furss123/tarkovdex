import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultState, MAX_STORED_BYTES, SCHEMA_VERSION } from '../src/lib/local-state/schema';
import { loadLocalState, narrowLegacyGameMode } from '../src/lib/local-state/migrate';

const NOW = '2026-08-03T12:00:00.000Z';

test('narrowLegacyGameMode accepts only the two legacy literals', () => {
  assert.equal(narrowLegacyGameMode('regular'), 'regular');
  assert.equal(narrowLegacyGameMode('pve'), 'pve');
  assert.equal(narrowLegacyGameMode(null), null);
  assert.equal(narrowLegacyGameMode('pvp'), null);
  assert.equal(narrowLegacyGameMode(''), null);
});

// ---------------------------------------------------------------------------
// no stored document
// ---------------------------------------------------------------------------

test('no stored document and no legacy key produces defaults', () => {
  const outcome = loadLocalState({ rawMainJson: null, legacyGameMode: null, now: NOW });
  assert.deepEqual(outcome.state, createDefaultState(NOW));
  assert.equal(outcome.adoptedLegacyGameMode, false);
  assert.equal(outcome.refusedNewerVersion, false);
  assert.equal(outcome.wasCorrupt, false);
});

test('no stored document but a legacy pvp value adopts it', () => {
  const outcome = loadLocalState({ rawMainJson: null, legacyGameMode: 'regular', now: NOW });
  assert.equal(outcome.state.preferences.gameMode, 'regular');
  assert.equal(outcome.adoptedLegacyGameMode, true);
});

test('no stored document but a legacy pve value adopts it', () => {
  const outcome = loadLocalState({ rawMainJson: null, legacyGameMode: 'pve', now: NOW });
  assert.equal(outcome.state.preferences.gameMode, 'pve');
  assert.equal(outcome.adoptedLegacyGameMode, true);
});

test('an invalid legacy value (already narrowed to null) behaves as absent', () => {
  const outcome = loadLocalState({ rawMainJson: null, legacyGameMode: null, now: NOW });
  assert.equal(outcome.state.preferences.gameMode, 'regular');
  assert.equal(outcome.adoptedLegacyGameMode, false);
});

// ---------------------------------------------------------------------------
// a valid V1 document already exists — legacy is never consulted
// ---------------------------------------------------------------------------

test('an existing valid document is used as-is and legacy is ignored', () => {
  const stored = createDefaultState('2020-01-01T00:00:00.000Z');
  stored.preferences.gameMode = 'pve';
  const outcome = loadLocalState({
    rawMainJson: JSON.stringify(stored),
    legacyGameMode: 'regular', // present, but must not override the real document
    now: NOW,
  });
  assert.equal(outcome.state.preferences.gameMode, 'pve');
  assert.equal(outcome.adoptedLegacyGameMode, false);
  assert.equal(outcome.wasCorrupt, false);
});

// ---------------------------------------------------------------------------
// corruption
// ---------------------------------------------------------------------------

test('unparseable JSON is reported corrupt and falls back to legacy if present', () => {
  const outcome = loadLocalState({
    rawMainJson: '{not json',
    legacyGameMode: 'pve',
    now: NOW,
  });
  assert.equal(outcome.wasCorrupt, true);
  assert.equal(outcome.state.preferences.gameMode, 'pve');
  assert.equal(outcome.adoptedLegacyGameMode, true);
});

test('a JSON array instead of an object is reported corrupt', () => {
  const outcome = loadLocalState({ rawMainJson: '[]', legacyGameMode: null, now: NOW });
  assert.equal(outcome.wasCorrupt, true);
});

test('an oversized document is reported corrupt without being parsed as valid', () => {
  const huge = JSON.stringify({ padding: 'x'.repeat(MAX_STORED_BYTES + 1) });
  const outcome = loadLocalState({ rawMainJson: huge, legacyGameMode: null, now: NOW });
  assert.equal(outcome.wasCorrupt, true);
});

test('a partially bad document is per-field recovered, not treated as fully corrupt', () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    preferences: { gameMode: 'bogus' },
    metadata: { createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
  });
  const outcome = loadLocalState({ rawMainJson: raw, legacyGameMode: null, now: NOW });
  assert.equal(outcome.wasCorrupt, false);
  assert.equal(outcome.state.preferences.gameMode, 'regular');
  assert.equal(outcome.state.metadata.createdAt, '2020-01-01T00:00:00.000Z');
});

// ---------------------------------------------------------------------------
// version refusal
// ---------------------------------------------------------------------------

test('a newer schemaVersion is refused: defaults in memory, nothing adopted', () => {
  const future = { ...createDefaultState(NOW), schemaVersion: SCHEMA_VERSION + 1 };
  const outcome = loadLocalState({
    rawMainJson: JSON.stringify(future),
    legacyGameMode: 'pve',
    now: NOW,
  });
  assert.equal(outcome.refusedNewerVersion, true);
  assert.equal(outcome.adoptedLegacyGameMode, false);
  assert.equal(outcome.wasCorrupt, false);
  assert.deepEqual(outcome.state, createDefaultState(NOW));
});

test('schemaVersion equal to current is accepted normally, not refused', () => {
  const outcome = loadLocalState({
    rawMainJson: JSON.stringify(createDefaultState(NOW)),
    legacyGameMode: null,
    now: NOW,
  });
  assert.equal(outcome.refusedNewerVersion, false);
});

// ---------------------------------------------------------------------------
// idempotency
// ---------------------------------------------------------------------------

test('running migration twice on its own output is a no-op', () => {
  const first = loadLocalState({ rawMainJson: null, legacyGameMode: 'pve', now: NOW });
  const second = loadLocalState({
    rawMainJson: JSON.stringify(first.state),
    legacyGameMode: null, // the real orchestrator would have removed the legacy key by now
    now: '2026-08-03T13:00:00.000Z',
  });
  assert.deepEqual(second.state, first.state);
  assert.equal(second.adoptedLegacyGameMode, false);
  assert.equal(second.wasCorrupt, false);
});
