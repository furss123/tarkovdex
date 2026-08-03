import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultState, MAX_IMPORT_BYTES, SCHEMA_VERSION } from '../src/lib/local-state/schema';
import {
  exportFilename,
  exportLocalState,
  serializeExport,
  validateImport,
} from '../src/lib/local-state/export-import';

const NOW = '2026-08-03T12:00:00.000Z';

test('exportLocalState wraps the state with the current schema version and an export stamp', () => {
  const state = createDefaultState(NOW);
  const exported = exportLocalState(state, '2026-08-03T13:00:00.000Z');
  assert.equal(exported.schemaVersion, SCHEMA_VERSION);
  assert.equal(exported.exportedAt, '2026-08-03T13:00:00.000Z');
  assert.deepEqual(exported.state, state);
});

test('exportFilename is stable and UTC-agnostic-by-construction (uses local Date fields)', () => {
  const date = new Date(2026, 7, 3); // August 3, 2026 in local time — no timezone helper needed
  assert.equal(exportFilename(date), 'tarkovdex-user-data-2026-08-03.json');
});

test('exportFilename pads single-digit months and days', () => {
  const date = new Date(2026, 0, 5); // Jan 5
  assert.equal(exportFilename(date), 'tarkovdex-user-data-2026-01-05.json');
});

test('export then import round-trips to an identical state', () => {
  const state = createDefaultState(NOW);
  state.preferences.gameMode = 'pve';
  const serialized = serializeExport(exportLocalState(state, '2026-08-03T13:00:00.000Z'));
  const result = validateImport(serialized);
  assert.ok(result.ok);
  if (result.ok) {
    assert.deepEqual(result.state, state);
    assert.equal(result.exportedAt, '2026-08-03T13:00:00.000Z');
  }
});

test('serializeExport produces plain UTF-8-safe JSON text (Korean content survives)', () => {
  // The document itself never carries localized text (only internal ids), but
  // this proves the encoding pipeline is a plain string, not something that
  // could mangle non-ASCII if a future field ever did carry text.
  const text = serializeExport(exportLocalState(createDefaultState(NOW), NOW));
  const roundTripped = JSON.parse(text);
  assert.equal(typeof text, 'string');
  assert.equal(roundTripped.schemaVersion, SCHEMA_VERSION);
});

test('validateImport rejects a file over the size limit', () => {
  const oversized = 'x'.repeat(MAX_IMPORT_BYTES + 1);
  const result = validateImport(oversized);
  assert.deepEqual(result, { ok: false, code: 'too-large' });
});

test('validateImport rejects non-JSON', () => {
  assert.deepEqual(validateImport('not json at all'), { ok: false, code: 'invalid-json' });
});

test('validateImport rejects the wrong top-level shape', () => {
  assert.deepEqual(validateImport('{}'), { ok: false, code: 'invalid-shape' });
  assert.deepEqual(validateImport('[]'), { ok: false, code: 'invalid-shape' });
  assert.deepEqual(
    validateImport(JSON.stringify({ schemaVersion: 1, state: createDefaultState(NOW) })),
    { ok: false, code: 'invalid-shape' },
    'missing exportedAt',
  );
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

test('validateImport rejects an internally invalid state even with a correct envelope', () => {
  const file = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: NOW,
    state: { schemaVersion: 1, preferences: { gameMode: 'nonsense' }, metadata: createDefaultState(NOW).metadata },
  };
  assert.deepEqual(validateImport(JSON.stringify(file)), {
    ok: false,
    code: 'invalid-state',
  });
});

test('validateImport never partially applies — a bad file yields no state at all', () => {
  const result = validateImport('{"schemaVersion":1,"exportedAt":"bad date","state":{}}');
  assert.equal(result.ok, false);
  assert.ok(!('state' in result));
});
