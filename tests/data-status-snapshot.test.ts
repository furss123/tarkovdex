import assert from 'node:assert/strict';
import test from 'node:test';
import { getDomainStatusSnapshot } from '../src/lib/data-status-snapshot';
import {
  recordCacheHit,
  recordFetchError,
  recordFetchSuccess,
  recordStaleServed,
  resetFetchObservations,
} from '../src/lib/data-observations';

const NOW = Date.parse('2026-08-03T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function snapshot({
  stamp = null,
  fail = false,
}: { stamp?: string | null; fail?: boolean } = {}) {
  return getDomainStatusSnapshot({
    locale: 'ko',
    now: NOW,
    loadPriceSourceUpdatedAt: async () => {
      if (fail) throw new Error('items document unavailable');
      return stamp;
    },
  });
}

test('a real source stamp decides content freshness with no observation present', async () => {
  resetFetchObservations();
  const statuses = await snapshot({ stamp: new Date(NOW - 2 * HOUR).toISOString() });
  const items = statuses.get('itemPrices');
  assert.equal(items?.freshness, 'fresh');
  assert.equal(items?.timestamps.sourceUpdatedAt, new Date(NOW - 2 * HOUR).toISOString());
  // No observation exists, so availability is undetermined rather than a verdict.
  assert.equal(items?.availability, null);
  assert.equal(items?.observed, false);
});

test('the same stamp reaches all three price-backed domains and no others', async () => {
  resetFetchObservations();
  const statuses = await snapshot({ stamp: new Date(NOW - HOUR).toISOString() });
  for (const domain of ['itemPrices', 'crafts', 'barters'] as const) {
    assert.equal(statuses.get(domain)?.freshness, 'fresh', domain);
  }
  for (const domain of ['quests', 'maps', 'bosses', 'traderPrices', 'gunsmith'] as const) {
    assert.equal(statuses.get(domain)?.freshness, 'unknown', domain);
    assert.equal(statuses.get(domain)?.timestamps.sourceUpdatedAt, undefined, domain);
  }
});

test('an old stamp reports stale content while the fetch still succeeded', async () => {
  resetFetchObservations();
  recordFetchSuccess('/regular/items', NOW - 60_000);
  recordFetchSuccess('/regular/items_ko', NOW - 60_000);
  recordFetchSuccess('/pve/items', NOW - 60_000);
  recordFetchSuccess('/pve/items_ko', NOW - 60_000);

  const statuses = await snapshot({ stamp: new Date(NOW - 40 * HOUR).toISOString() });
  const items = statuses.get('itemPrices');
  assert.equal(items?.availability, 'available');
  assert.equal(items?.freshness, 'stale');
  assert.equal(items?.delivery, 'network');
});

test('an observation alone never becomes a content age', async () => {
  resetFetchObservations();
  recordFetchSuccess('/regular/tasks', NOW - 30_000);
  const statuses = await snapshot({ stamp: null });
  const quests = statuses.get('quests');
  assert.equal(quests?.availability, 'available');
  assert.equal(quests?.freshness, 'unknown');
  // The fetch time is reported as a fetch time and nothing else.
  assert.equal(quests?.timestamps.fetchedAt, new Date(NOW - 30_000).toISOString());
  assert.equal(quests?.timestamps.sourceUpdatedAt, undefined);
});

test('a stale-cache serve is reported as delivery, not as availability', async () => {
  resetFetchObservations();
  recordFetchSuccess('/regular/maps', NOW - 4 * HOUR);
  recordStaleServed('/regular/maps', NOW - 60_000, new Error('json.tarkov.dev responded 503'));
  const statuses = await snapshot();
  const maps = statuses.get('maps');
  assert.equal(maps?.delivery, 'stale-cache');
  assert.equal(maps?.availability, 'available');
  assert.equal(maps?.internalErrorCode, 'http_503');
  assert.equal(maps?.retryable, true);
});

test('a total failure with nothing cached is unavailable', async () => {
  resetFetchObservations();
  recordFetchError('/regular/tasks', NOW - 30_000, new Error('json.tarkov.dev responded 404'));
  const statuses = await snapshot();
  const quests = statuses.get('quests');
  assert.equal(quests?.availability, 'unavailable');
  assert.equal(quests?.retryable, false);
});

test('a mix of one success and one failure is partial', async () => {
  resetFetchObservations();
  recordFetchSuccess('/regular/maps', NOW - 60_000);
  recordFetchError('/pve/maps', NOW - 60_000, new Error('boom'));
  const statuses = await snapshot();
  assert.equal(statuses.get('maps')?.availability, 'partial');
});

test('a cache hit is delivery cache, and observation is recorded', async () => {
  resetFetchObservations();
  recordFetchSuccess('/regular/tasks', NOW - 5 * 60_000);
  recordCacheHit('/regular/tasks');
  const statuses = await snapshot();
  assert.equal(statuses.get('quests')?.delivery, 'cache');
  assert.equal(statuses.get('quests')?.observed, true);
});

test('a failing price loader degrades only content age, never the snapshot', async () => {
  resetFetchObservations();
  recordFetchSuccess('/regular/tasks', NOW - 60_000);
  const statuses = await snapshot({ fail: true });
  assert.equal(statuses.get('itemPrices')?.freshness, 'unknown');
  assert.equal(statuses.get('itemPrices')?.timestamps.sourceUpdatedAt, undefined);
  // Every other domain is still reported from its own observations.
  assert.equal(statuses.get('quests')?.availability, 'available');
  assert.equal(statuses.size, 10);
});

test('the snapshot covers every json.tarkov.dev domain and excludes the live ones', async () => {
  resetFetchObservations();
  const statuses = await snapshot();
  assert.equal(statuses.has('news'), false);
  assert.equal(statuses.has('events'), false);
  for (const domain of statuses.values()) {
    assert.equal(domain.timestamps.observedAt, new Date(NOW).toISOString());
  }
});

test('an empty instance reports undetermined availability, not unavailable', async () => {
  resetFetchObservations();
  const statuses = await snapshot();
  for (const domain of statuses.values()) {
    assert.equal(domain.availability, null, domain.domain);
    assert.equal(domain.observed, false, domain.domain);
    assert.equal(domain.delivery, 'unknown', domain.domain);
  }
});
