import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chunkIds,
  computeWatchPriceDelta,
  defaultWatchPriceType,
  isWatchPriceStale,
  priceForType,
  WATCHLIST_FETCH_CHUNK,
  type WatchPriceType,
} from '../src/lib/watchlist';
import type { MarketItem } from '../src/types/tarkov';
import { createFakeStorage, withFakeWindow } from './helpers/fake-browser';
import { createDefaultState } from '../src/lib/local-state/schema';
import {
  addToWatchlist,
  getLocalStateSnapshot,
  getWatchlist,
  hydrateLocalState,
  isItemWatched,
  removeFromWatchlist,
  resetLocalStateStoreForTests,
} from '../src/lib/local-state/store';

test.beforeEach(() => {
  resetLocalStateStoreForTests();
});

function marketItem(overrides: Partial<MarketItem> = {}): MarketItem {
  return {
    id: 'item-1',
    name: 'Test Item',
    shortName: 'TI',
    iconLink: null,
    avg24hPrice: 10000,
    low24hPrice: 9000,
    high24hPrice: 11000,
    changeLast48hPercent: 0,
    types: ['armor'],
    width: 2,
    height: 2,
    weight: 2.5,
    bestVendorSellRUB: 8000,
    updated: '2026-08-03T12:00:00.000Z',
    slotCount: 4,
    estimatedFleaNet: 9500,
    referenceValue: 9500,
    valuePerSlot: 2375,
    valueSource: 'flea',
    freshnessHours: 1,
    ...overrides,
  };
}

test('computeWatchPriceDelta returns ok with signed absolute and percent', () => {
  const up = computeWatchPriceDelta({
    baselinePrice: 10000,
    currentPrice: 12500,
    baselineType: 'flea-net',
    currentType: 'flea-net',
  });
  assert.deepEqual(up, {
    kind: 'ok',
    absolute: 2500,
    percent: 25,
    direction: 'up',
  });

  const down = computeWatchPriceDelta({
    baselinePrice: 10000,
    currentPrice: 7500,
    baselineType: 'flea',
    currentType: 'flea',
  });
  assert.equal(down.kind, 'ok');
  if (down.kind === 'ok') {
    assert.equal(down.absolute, -2500);
    assert.equal(down.direction, 'down');
  }

  const flat = computeWatchPriceDelta({
    baselinePrice: 1000,
    currentPrice: 1000,
    baselineType: 'trader',
    currentType: 'trader',
  });
  assert.deepEqual(flat, { kind: 'ok', absolute: 0, percent: 0, direction: 'flat' });
});

test('computeWatchPriceDelta reports missing baseline, missing current, type mismatch, and zero baseline', () => {
  assert.deepEqual(
    computeWatchPriceDelta({
      baselinePrice: undefined,
      currentPrice: 100,
      baselineType: 'flea',
      currentType: 'flea',
    }),
    { kind: 'missing-baseline' },
  );
  assert.deepEqual(
    computeWatchPriceDelta({
      baselinePrice: 100,
      currentPrice: null,
      baselineType: 'flea',
      currentType: 'flea',
    }),
    { kind: 'missing-current' },
  );
  assert.deepEqual(
    computeWatchPriceDelta({
      baselinePrice: 100,
      currentPrice: 120,
      baselineType: 'flea',
      currentType: 'trader',
    }),
    { kind: 'type-mismatch' },
  );
  assert.deepEqual(
    computeWatchPriceDelta({
      baselinePrice: 0,
      currentPrice: 50,
      baselineType: 'flea',
      currentType: 'flea',
    }),
    { kind: 'baseline-zero' },
  );
});

test('priceForType and defaultWatchPriceType prefer flea-net when flea exists', () => {
  const item = marketItem();
  assert.equal(priceForType(item, 'flea'), 10000);
  assert.equal(priceForType(item, 'flea-net'), 9500);
  assert.equal(priceForType(item, 'trader'), 8000);
  assert.equal(priceForType(item, 'best-value'), 9500);
  assert.equal(defaultWatchPriceType(item), 'flea-net');

  const fleaBanned = marketItem({
    avg24hPrice: null,
    estimatedFleaNet: null,
    referenceValue: 8000,
    valueSource: 'trader',
  });
  assert.equal(defaultWatchPriceType(fleaBanned), 'trader');
});

test('chunkIds dedupes, trims, and chunks at the requested size', () => {
  assert.deepEqual(chunkIds(['a', ' a ', '', 'b', 'a'], 2), [['a', 'b']]);
  assert.deepEqual(chunkIds(['1', '2', '3', '4', '5'], 2), [
    ['1', '2'],
    ['3', '4'],
    ['5'],
  ]);
  assert.equal(WATCHLIST_FETCH_CHUNK, 100);
  assert.equal(chunkIds(Array.from({ length: 250 }, (_, i) => `id-${i}`), 100).length, 3);
});

test('isWatchPriceStale uses MARKET_PRICE_STALE_HOURS threshold', () => {
  assert.equal(isWatchPriceStale(null), false);
  assert.equal(isWatchPriceStale(1), false);
  assert.equal(isWatchPriceStale(24), false);
  assert.equal(isWatchPriceStale(25), true);
});

test('store add/remove watchlist entries and isolate PvP from PvE', async () => {
  const fake = createFakeStorage();
  await withFakeWindow(fake, () => {
    hydrateLocalState();
    const now = '2026-08-03T12:00:00.000Z';
    const entry = {
      itemId: 'shared-item',
      priceType: 'flea-net' as WatchPriceType,
      baselinePrice: 10000,
      baselineUpdatedAt: now,
      addedAt: now,
    };

    assert.deepEqual(addToWatchlist('regular', entry), { ok: true, value: undefined });
    assert.equal(isItemWatched('regular', 'shared-item'), true);
    assert.equal(isItemWatched('pve', 'shared-item'), false);
    assert.equal(getWatchlist('regular').length, 1);
    assert.equal(getWatchlist('pve').length, 0);

    assert.deepEqual(addToWatchlist('pve', { ...entry, priceType: 'trader' }), {
      ok: true,
      value: undefined,
    });
    assert.equal(getWatchlist('pve')[0]?.priceType, 'trader');
    assert.equal(getWatchlist('regular')[0]?.priceType, 'flea-net');

    removeFromWatchlist('regular', 'shared-item', 'flea-net');
    assert.equal(isItemWatched('regular', 'shared-item'), false);
    assert.equal(isItemWatched('pve', 'shared-item', 'trader'), true);

    // Same item + different price type can coexist in one mode.
    addToWatchlist('pve', { ...entry, priceType: 'flea-net' });
    assert.equal(getWatchlist('pve').length, 2);
    removeFromWatchlist('pve', 'shared-item');
    assert.equal(getWatchlist('pve').length, 0);

    const snapshot = getLocalStateSnapshot();
    assert.equal(snapshot.schemaVersion, createDefaultState(now).schemaVersion);
  });
});
