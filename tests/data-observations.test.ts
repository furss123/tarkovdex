import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cachePathsForDomain,
  classifyFetchError,
  domainHealth,
  readFetchObservation,
  recordCacheHit,
  recordFetchError,
  recordFetchSuccess,
  recordStaleServed,
  resetFetchObservations,
} from '../src/lib/data-observations';

const NOW = Date.parse('2026-08-03T12:00:00.000Z');
const PATH = '/regular/items';

function fresh() {
  resetFetchObservations();
}

// ---------------------------------------------------------------------------
// recorder lifecycle
// ---------------------------------------------------------------------------

test('a first success records the fetch time and a network delivery', () => {
  fresh();
  recordFetchSuccess(PATH, NOW);
  const record = readFetchObservation(PATH);
  assert.equal(record?.lastSuccessAt, NOW);
  assert.equal(record?.cacheStoredAt, NOW);
  assert.equal(record?.lastServedFrom, 'network');
  assert.equal(record?.servedStale, false);
  assert.equal(record?.lastErrorAt, null);
});

test('a cache hit does not move the fetch time', () => {
  fresh();
  recordFetchSuccess(PATH, NOW);
  recordCacheHit(PATH);
  const record = readFetchObservation(PATH);
  assert.equal(record?.lastSuccessAt, NOW, 'a cache hit is not a new observation');
  assert.equal(record?.lastServedFrom, 'cache');
});

test('a failure with a usable cached value is recorded as serving the previous copy', () => {
  fresh();
  recordFetchSuccess(PATH, NOW);
  recordStaleServed(PATH, NOW + 1000, new Error('json.tarkov.dev responded 503 x for /y'));
  const record = readFetchObservation(PATH);
  assert.equal(record?.servedStale, true);
  assert.equal(record?.lastServedFrom, 'stale-cache');
  assert.equal(record?.lastSuccessAt, NOW, 'a failed attempt is not a success');
  assert.equal(record?.lastErrorAt, NOW + 1000);
  assert.equal(record?.errorCode, 'http_503');
});

test('cache hits during the stale-serve window keep reporting the previous copy', () => {
  fresh();
  recordFetchSuccess(PATH, NOW);
  recordStaleServed(PATH, NOW + 1000, new Error('boom'));
  recordCacheHit(PATH);
  assert.equal(
    readFetchObservation(PATH)?.lastServedFrom,
    'stale-cache',
    'the 60s retry pin must not launder a stale serve into a normal cache hit',
  );
});

test('a failure past the stale window drops the cached value entirely', () => {
  fresh();
  recordFetchSuccess(PATH, NOW);
  recordFetchError(PATH, NOW + 1000, new Error('network down'));
  const record = readFetchObservation(PATH);
  assert.equal(record?.cacheStoredAt, null);
  assert.equal(record?.servedStale, false);
  assert.equal(record?.lastServedFrom, 'unknown');
  assert.equal(record?.errorCode, 'network');
});

test('a later success clears the previous error state', () => {
  fresh();
  recordFetchError(PATH, NOW, new Error('network down'));
  recordFetchSuccess(PATH, NOW + 5000);
  const record = readFetchObservation(PATH);
  assert.equal(record?.errorCode, null, 'a recovered path must not read as broken');
  assert.equal(record?.servedStale, false);
  assert.equal(record?.lastServedFrom, 'network');
  assert.equal(record?.lastErrorAt, NOW, 'the error time itself is history, not a claim');
});

test('different cache keys are isolated from each other', () => {
  fresh();
  recordFetchSuccess('/regular/items', NOW);
  recordStaleServed('/pve/items', NOW, new Error('boom'));
  assert.equal(readFetchObservation('/regular/items')?.servedStale, false);
  assert.equal(readFetchObservation('/pve/items')?.servedStale, true);
});

test('an empty registry — a restarted instance — reports no observation at all', () => {
  fresh();
  assert.equal(readFetchObservation(PATH), null);
  const state = domainHealth({
    domain: 'itemPrices',
    gameMode: 'regular',
    locale: 'ko',
    availability: 'available',
    now: NOW,
  });
  assert.equal(state.delivery, 'unknown');
  assert.equal(state.timestamps.fetchedAt, undefined, 'never invent a fetch time');
  assert.equal(state.timestamps.cacheStoredAt, undefined);
});

test('reading an observation returns a copy, so callers cannot mutate the registry', () => {
  fresh();
  recordFetchSuccess(PATH, NOW);
  const record = readFetchObservation(PATH)!;
  record.servedStale = true;
  assert.equal(readFetchObservation(PATH)?.servedStale, false);
});

// ---------------------------------------------------------------------------
// error classification — safe codes only
// ---------------------------------------------------------------------------

test('error classification never carries the original message', () => {
  const secretish = new Error(
    'fetch failed for https://json.tarkov.dev/regular/items?token=abcd1234',
  );
  const { code } = classifyFetchError(secretish);
  assert.equal(code, 'network');
  assert.ok(!code.includes('json.tarkov.dev'));
  assert.ok(!code.includes('abcd1234'));
});

test('error classification marks the retryable cases correctly', () => {
  const timeout = new Error('timed out');
  timeout.name = 'TimeoutError';
  assert.deepEqual(classifyFetchError(timeout), { code: 'timeout', retryable: true });
  assert.deepEqual(
    classifyFetchError(new Error('json.tarkov.dev responded 500 x for /y')),
    { code: 'http_500', retryable: true },
  );
  assert.deepEqual(
    classifyFetchError(new Error('json.tarkov.dev responded 429 x for /y')),
    { code: 'http_429', retryable: true },
  );
  assert.deepEqual(
    classifyFetchError(new Error('json.tarkov.dev responded 404 x for /y')),
    { code: 'http_404', retryable: false },
  );
  assert.deepEqual(
    classifyFetchError(
      new Error('json.tarkov.dev returned an invalid data shape for /regular/items'),
    ),
    { code: 'invalid_document', retryable: false },
  );
});

test('a classified code never reaches a user-facing field', () => {
  fresh();
  recordFetchError(PATH, NOW, new Error('json.tarkov.dev responded 500 x for /y'));
  const state = domainHealth({
    domain: 'itemPrices',
    gameMode: 'regular',
    locale: 'ko',
    availability: 'unavailable',
    now: NOW,
  });
  assert.equal(state.internalErrorCode, 'http_500');
  // publicMessageKey is the only user-facing channel and is a message key, not
  // an error string. Nothing here sets it from the error.
  assert.equal(state.publicMessageKey, undefined);
});

// ---------------------------------------------------------------------------
// domain -> cache key mapping
// ---------------------------------------------------------------------------

test('domain cache keys are explicit per mode and locale, not inferred from substrings', () => {
  assert.deepEqual(cachePathsForDomain('itemPrices', 'regular', 'ko'), [
    '/regular/items',
    '/regular/items_ko',
  ]);
  assert.deepEqual(cachePathsForDomain('itemPrices', 'pve', 'en'), [
    '/pve/items',
    '/pve/items_en',
  ]);
  assert.deepEqual(cachePathsForDomain('crafts', 'regular', 'zh'), [
    '/regular/crafts',
    '/regular/items',
    '/regular/items_zh',
  ]);
  assert.deepEqual(cachePathsForDomain('news', 'regular', 'ko'), []);
});

test('one mode never reads the other mode observation', () => {
  fresh();
  recordFetchSuccess('/regular/items', NOW);
  recordFetchSuccess('/regular/items_ko', NOW);
  const pve = domainHealth({
    domain: 'itemPrices',
    gameMode: 'pve',
    locale: 'ko',
    availability: 'available',
    now: NOW,
  });
  assert.equal(pve.delivery, 'unknown', 'PvP observations must not describe PvE');
  assert.equal(pve.timestamps.fetchedAt, undefined);
});

test('the oldest component decides the reported fetch time', () => {
  fresh();
  recordFetchSuccess('/regular/items', NOW - 60_000);
  recordFetchSuccess('/regular/items_ko', NOW);
  const state = domainHealth({
    domain: 'itemPrices',
    gameMode: 'regular',
    locale: 'ko',
    availability: 'available',
    now: NOW,
  });
  assert.equal(state.timestamps.fetchedAt, new Date(NOW - 60_000).toISOString());
});

test('a half-observed domain reports no fetch time rather than the half it knows', () => {
  fresh();
  recordFetchSuccess('/regular/items', NOW);
  recordCacheHit('/regular/items_ko'); // observed, but never a success
  const state = domainHealth({
    domain: 'itemPrices',
    gameMode: 'regular',
    locale: 'ko',
    availability: 'available',
    now: NOW,
  });
  assert.equal(state.timestamps.fetchedAt, undefined);
});

test('one stale component makes the whole domain report the previous copy', () => {
  fresh();
  recordFetchSuccess('/regular/items', NOW);
  recordStaleServed('/regular/items_ko', NOW, new Error('boom'));
  const state = domainHealth({
    domain: 'itemPrices',
    gameMode: 'regular',
    locale: 'ko',
    availability: 'available',
    now: NOW,
  });
  assert.equal(state.delivery, 'stale-cache');
});

test('a domain with no upstream stamp reports unknown content age even when given one', () => {
  fresh();
  recordFetchSuccess('/regular/tasks', NOW);
  recordFetchSuccess('/regular/tasks_ko', NOW);
  const state = domainHealth({
    domain: 'quests',
    gameMode: 'regular',
    locale: 'ko',
    availability: 'available',
    sourceUpdatedAt: new Date(NOW).toISOString(),
    now: NOW,
  });
  assert.equal(state.freshness, 'unknown');
  assert.equal(
    state.timestamps.sourceUpdatedAt,
    undefined,
    'a domain the audit found has no content stamp must not start reporting one',
  );
});

test('a price domain does report its real upstream stamp', () => {
  fresh();
  recordFetchSuccess('/regular/items', NOW);
  recordFetchSuccess('/regular/items_ko', NOW);
  const state = domainHealth({
    domain: 'itemPrices',
    gameMode: 'regular',
    locale: 'ko',
    availability: 'available',
    sourceUpdatedAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
    totalCount: 4200,
    staleCount: 12,
    missingCount: 3,
    now: NOW,
  });
  assert.equal(state.freshness, 'fresh');
  assert.equal(state.delivery, 'network');
  assert.equal(state.totalCount, 4200);
  assert.equal(state.staleCount, 12);
  assert.equal(state.missingCount, 3);
});
