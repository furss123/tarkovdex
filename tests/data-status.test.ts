import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DATA_DOMAINS,
  availabilityFromFeedFreshness,
  contentFreshness,
  domainPolicy,
  summarizeHealth,
  worstSummary,
  type DataHealth,
} from '../src/lib/data-status';

const NOW = Date.parse('2026-08-03T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const WARN = 12 * HOUR;
const STALE = 24 * HOUR;

function at(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

function freshness(sourceUpdatedAt: string | null | undefined) {
  return contentFreshness({
    sourceUpdatedAt,
    warningAfterMs: WARN,
    staleAfterMs: STALE,
    now: NOW,
  });
}

// ---------------------------------------------------------------------------
// freshness boundaries
// ---------------------------------------------------------------------------

test('freshness: exactly on the warning boundary counts as warning', () => {
  assert.equal(freshness(at(WARN)), 'warning');
});

test('freshness: one millisecond either side of the warning boundary', () => {
  assert.equal(freshness(at(WARN - 1)), 'fresh');
  assert.equal(freshness(at(WARN + 1)), 'warning');
});

test('freshness: exactly on the stale boundary counts as stale', () => {
  assert.equal(freshness(at(STALE)), 'stale');
});

test('freshness: one millisecond either side of the stale boundary', () => {
  assert.equal(freshness(at(STALE - 1)), 'warning');
  assert.equal(freshness(at(STALE + 1)), 'stale');
});

test('freshness: a brand new timestamp is fresh', () => {
  assert.equal(freshness(at(0)), 'fresh');
});

test('freshness: small clock skew into the future is tolerated, large is not', () => {
  assert.equal(freshness(at(-60 * 1000)), 'fresh');
  assert.equal(freshness(at(-60 * 60 * 1000)), 'unknown');
});

test('freshness: an unparseable timestamp is unknown, never an age', () => {
  assert.equal(freshness('yesterday'), 'unknown');
  assert.equal(freshness(''), 'unknown');
});

test('freshness: a missing timestamp is unknown', () => {
  assert.equal(freshness(null), 'unknown');
  assert.equal(freshness(undefined), 'unknown');
});

test('freshness: a domain with no thresholds cannot judge content age', () => {
  assert.equal(
    contentFreshness({ sourceUpdatedAt: at(0), now: NOW }),
    'unknown',
    'having data is not evidence of being fresh',
  );
  assert.equal(
    contentFreshness({ sourceUpdatedAt: at(0), warningAfterMs: WARN, now: NOW }),
    'unknown',
  );
});

// ---------------------------------------------------------------------------
// timestamp combinations — fetch observation must never stand in for content age
// ---------------------------------------------------------------------------

function health(overrides: Partial<DataHealth> = {}): DataHealth {
  return {
    domain: 'itemPrices',
    availability: 'available',
    freshness: 'fresh',
    delivery: 'network',
    timestamps: { observedAt: new Date(NOW).toISOString() },
    retryable: true,
    ...overrides,
  };
}

test('fetchedAt alone does not make content fresh', () => {
  const state = health({
    freshness: freshness(undefined),
    timestamps: { fetchedAt: at(0), observedAt: at(0) },
  });
  assert.equal(state.freshness, 'unknown');
  assert.equal(summarizeHealth(state), 'unknownAge');
});

test('cacheStoredAt alone does not make content fresh', () => {
  const state = health({
    freshness: freshness(undefined),
    delivery: 'cache',
    timestamps: { cacheStoredAt: at(0), observedAt: at(0) },
  });
  assert.equal(summarizeHealth(state), 'unknownAge');
});

test('a source timestamp is only reported when one exists', () => {
  const state = health({
    timestamps: { sourceUpdatedAt: at(HOUR), fetchedAt: at(0), observedAt: at(0) },
  });
  assert.equal(state.timestamps.sourceUpdatedAt, at(HOUR));
  assert.notEqual(state.timestamps.sourceUpdatedAt, state.timestamps.fetchedAt);
});

// ---------------------------------------------------------------------------
// status combinations
// ---------------------------------------------------------------------------

test('fresh + available + network summarises as ok', () => {
  assert.equal(summarizeHealth(health()), 'ok');
});

test('fresh + available + cache still summarises as ok', () => {
  assert.equal(summarizeHealth(health({ delivery: 'cache' })), 'ok');
});

test('stale-cache delivery is reported even when the content itself is fresh', () => {
  assert.equal(
    summarizeHealth(health({ delivery: 'stale-cache' })),
    'previous',
    'serving the previous copy must never look like a normal render',
  );
});

test('stale + available + stale-cache reports the delivery, not just the age', () => {
  assert.equal(
    summarizeHealth(health({ freshness: 'stale', delivery: 'stale-cache' })),
    'previous',
  );
});

test('unknown content age with usable data is not ok and not unavailable', () => {
  assert.equal(summarizeHealth(health({ freshness: 'unknown' })), 'unknownAge');
});

test('warning + partial reports the missing data first', () => {
  assert.equal(
    summarizeHealth(health({ freshness: 'warning', availability: 'partial' })),
    'partial',
  );
});

test('warning alone is a delay, not staleness', () => {
  assert.equal(summarizeHealth(health({ freshness: 'warning' })), 'delayed');
});

test('unavailable outranks every other signal', () => {
  assert.equal(
    summarizeHealth(
      health({ availability: 'unavailable', delivery: 'stale-cache', freshness: 'stale' }),
    ),
    'unavailable',
  );
});

test('an empty but successful result is still ok, not a failure', () => {
  const state = health({ totalCount: 0 });
  assert.equal(summarizeHealth(state), 'ok');
  assert.notEqual(summarizeHealth(state), 'unavailable');
});

test('worstSummary picks the most severe of several domains', () => {
  assert.equal(worstSummary(['ok', 'delayed', 'previous']), 'previous');
  assert.equal(worstSummary(['ok', 'ok']), 'ok');
  assert.equal(worstSummary([]), 'ok');
  assert.equal(worstSummary(['unknownAge', 'ok']), 'unknownAge');
});

// ---------------------------------------------------------------------------
// registry honesty
// ---------------------------------------------------------------------------

test('every domain declares thresholds if and only if it has a source timestamp', () => {
  for (const policy of DATA_DOMAINS) {
    if (policy.supportsSourceTimestamp) {
      assert.ok(
        policy.warningAfterMs != null && policy.staleAfterMs != null,
        `${policy.id} claims a source timestamp but has no thresholds`,
      );
      assert.ok(
        policy.staleAfterMs! > policy.warningAfterMs!,
        `${policy.id} stale threshold must be later than its warning threshold`,
      );
    } else {
      assert.equal(
        policy.warningAfterMs,
        undefined,
        `${policy.id} has no source timestamp, so thresholds would be meaningless`,
      );
      assert.equal(policy.staleAfterMs, undefined);
    }
  }
});

test('domains with no upstream timestamp are the ones the audit identified', () => {
  const withStamp = DATA_DOMAINS.filter((p) => p.supportsSourceTimestamp).map((p) => p.id).sort();
  assert.deepEqual(withStamp, [
    'barters',
    'crafts',
    'events',
    'itemPrices',
    'news',
  ]);
});

test('gunsmith reports an unknown artifact age until the generator stamps one', () => {
  assert.equal(domainPolicy('gunsmith').supportsSourceTimestamp, false);
});

test('every domain id is unique and resolvable', () => {
  const ids = DATA_DOMAINS.map((policy) => policy.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.equal(domainPolicy(id).id, id);
  assert.throws(() => domainPolicy('nope' as never));
});

test('the Tarkov Live freshness model projects onto availability without loss of meaning', () => {
  assert.equal(availabilityFromFeedFreshness('ok'), 'available');
  assert.equal(availabilityFromFeedFreshness('partial'), 'partial');
  assert.equal(availabilityFromFeedFreshness('down'), 'unavailable');
  // stale/never/unmanaged still have usable stored content — they are age and
  // configuration statements, not availability failures.
  assert.equal(availabilityFromFeedFreshness('stale'), 'available');
  assert.equal(availabilityFromFeedFreshness('never'), 'available');
  assert.equal(availabilityFromFeedFreshness('unmanaged'), 'available');
});
