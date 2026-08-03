import assert from 'node:assert/strict';
import test from 'node:test';
import { queryMarketItems } from '../src/lib/market-items-query';
import type { Item } from '../src/types/tarkov';

const NOW = Date.parse('2026-08-03T00:00:00.000Z');

function item(
  id: string,
  price: number | null,
  updated: string | null,
  vendor: number | null = null,
): Item {
  return {
    id,
    name: id,
    shortName: id,
    width: 1,
    height: 1,
    weight: 0.1,
    types: ['mods'],
    avg24hPrice: price,
    low24hPrice: price,
    high24hPrice: price,
    changeLast48hPercent: price === null ? null : 10,
    updated,
    iconLink: null,
    bestVendorSellRUB: vendor,
  };
}

function query(items: Item[], sort = 'valuePerSlot') {
  return queryMarketItems(
    items,
    'regular',
    {
      query: '',
      locale: 'en',
      sort,
      sale: 'all',
      category: 'all',
      direction: 'desc',
      page: 1,
      pageSize: 50,
      feeRate: 5,
    },
    NOW,
  );
}

test('stale and unknown prices cannot outrank fresh values', () => {
  const result = query([
    item('stale-high', 1_000_000, '2026-08-01T00:00:00.000Z'),
    item('unknown-higher', 2_000_000, 'invalid'),
    item('fresh-low', 100, '2026-08-02T23:00:00.000Z'),
  ]);

  assert.deepEqual(result.items.map((entry) => entry.id), [
    'fresh-low',
    'stale-high',
    'unknown-higher',
  ]);
});

test('future timestamps are unknown and cannot replace source freshness', () => {
  const result = query([
    item('future', 200, '2026-08-03T01:00:00.000Z'),
    item('current', 100, '2026-08-02T23:00:00.000Z'),
  ]);

  assert.equal(result.items.find((entry) => entry.id === 'future')?.freshnessHours, null);
  assert.equal(result.meta.sourceUpdatedAt, '2026-08-02T23:00:00.000Z');
});

test('zero and non-finite prices are missing rather than free valuations', () => {
  const zero = item('zero', 0, '2026-08-02T23:00:00.000Z');
  const invalid = item('invalid', Number.NaN, '2026-08-02T23:00:00.000Z');
  const result = query([zero, invalid]);

  assert.equal(result.total, 0);
  assert.deepEqual(result.items, []);
});

test('invalid fee input is normalized in both values and response metadata', () => {
  const result = queryMarketItems(
    [item('priced', 100, '2026-08-02T23:00:00.000Z')],
    'regular',
    {
      query: '',
      locale: 'en',
      sort: 'valuePerSlot',
      sale: 'all',
      category: 'all',
      direction: 'desc',
      page: 1,
      feeRate: Number.NaN,
    },
    NOW,
  );

  assert.equal(result.items[0]?.estimatedFleaNet, 100);
  assert.equal(result.meta.feeRate, 0);
});
