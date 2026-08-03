import assert from 'node:assert/strict';
import test from 'node:test';
import {
  partitionCraftLeadersByFreshness,
  selectBestCraftsByStation,
} from '../src/lib/tool-calculations';
import type { CraftDeal, ExchangePart, ToolItem } from '../src/types/tools';

const NOW = Date.parse('2026-08-03T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function at(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

function item(
  id: string,
  {
    flea = 100,
    traderSell = null as number | null,
    updated = at(HOUR),
  }: { flea?: number | null; traderSell?: number | null; updated?: string | null } = {},
): ToolItem {
  return {
    id,
    name: id,
    shortName: id,
    iconLink: null,
    types: [],
    categories: [],
    price: { flea, traderBuy: flea, traderSell, updated },
  };
}

function craft({
  id = 'craft',
  stationId = id,
  requiredItems = [{ item: item(`${id}-input`), count: 1 }] as ExchangePart[],
  productItem = { item: item(`${id}-output`, { flea: 900 }), count: 1 } as ExchangePart,
}: {
  id?: string;
  stationId?: string;
  requiredItems?: ExchangePart[];
  productItem?: ExchangePart;
} = {}): CraftDeal {
  return {
    id,
    station: { id: stationId, name: stationId, imageLink: null },
    level: 1,
    duration: 3600,
    requiredItems,
    requiredQuestItems: [],
    productItem,
    productItems: [productItem],
    updated: productItem.item.price.updated,
  };
}

function partition(crafts: CraftDeal[]) {
  return partitionCraftLeadersByFreshness(selectBestCraftsByStation(crafts), NOW);
}

test('priceUpdatedAt is the oldest contributing stamp, ignoring returned tools', () => {
  const [leader] = selectBestCraftsByStation([
    craft({
      id: 'mixed',
      requiredItems: [
        { item: item('recent-input', { updated: at(HOUR) }), count: 1 },
        { item: item('older-input', { updated: at(6 * HOUR) }), count: 1 },
        // A tool is returned, never consumed, so its age cannot decide the
        // craft's — otherwise a rarely-traded tool would sink every recipe.
        { item: item('ancient-tool', { flea: 5000, updated: at(400 * HOUR) }), count: 1, tool: true },
      ],
      productItem: { item: item('mixed-output', { flea: 9000, updated: at(2 * HOUR) }), count: 1 },
    }),
  ]);
  assert.equal(leader?.priceUpdatedAt, at(6 * HOUR));
});

test('recent and mildly delayed crafts both stay in the current ranking', () => {
  const { current, stale } = partition([
    craft({ id: 'fresh', productItem: { item: item('fresh-output', { flea: 900, updated: at(HOUR) }), count: 1 } }),
    craft({ id: 'warning', productItem: { item: item('warning-output', { flea: 900, updated: at(20 * HOUR) }), count: 1 } }),
  ]);
  assert.deepEqual(current.map((leader) => leader.craftId).sort(), ['fresh', 'warning']);
  assert.deepEqual(stale, []);
});

test('an old input alone moves a craft out of the current ranking', () => {
  const { current, stale } = partition([
    craft({
      id: 'old-input',
      requiredItems: [{ item: item('old-input-item', { updated: at(30 * HOUR) }), count: 1 }],
    }),
  ]);
  assert.deepEqual(current, []);
  assert.deepEqual(stale.map((leader) => leader.craftId), ['old-input']);
});

test('an old output alone moves a craft out of the current ranking', () => {
  const { current, stale } = partition([
    craft({
      id: 'old-output',
      productItem: { item: item('old-output-item', { flea: 900, updated: at(48 * HOUR) }), count: 1 },
    }),
  ]);
  assert.deepEqual(current, []);
  assert.deepEqual(stale.map((leader) => leader.craftId), ['old-output']);
});

test('an unstamped price is treated as an unknown age, never as a recent one', () => {
  const { current, stale } = partition([
    craft({
      id: 'no-stamp',
      productItem: { item: item('no-stamp-output', { flea: 900, updated: null }), count: 1 },
    }),
  ]);
  assert.deepEqual(current, []);
  assert.deepEqual(stale.map((leader) => leader.craftId), ['no-stamp']);
  assert.equal(stale[0]?.priceUpdatedAt, null);
});

test('an unparseable stamp is unknown rather than silently accepted', () => {
  const { current, stale } = partition([
    craft({
      id: 'bad-stamp',
      productItem: { item: item('bad-output', { flea: 900, updated: 'not a date' }), count: 1 },
    }),
  ]);
  assert.deepEqual(current, []);
  assert.equal(stale[0]?.priceUpdatedAt, null);
});

test('a craft with no usable price is still excluded entirely, not merely dated', () => {
  const { current, stale } = partition([
    craft({
      id: 'unpriced',
      productItem: { item: item('unpriced-output', { flea: null, traderSell: null }), count: 1 },
    }),
  ]);
  assert.deepEqual(current, []);
  assert.deepEqual(stale, []);
});

test('regression: a Bitcoin-Farm-shaped craft never enters the current ranking', () => {
  // The exact production shape: no inputs at all, so the entire profit rests on
  // one output price whose record was 243 days old and had no flea value. It
  // ranked second on the home board under a "current prices" caption.
  const bitcoin = craft({
    id: 'bitcoin-farm',
    stationId: 'bitcoin-farm',
    requiredItems: [],
    productItem: {
      item: item('physical-bitcoin', {
        flea: null,
        traderSell: 178_000,
        updated: at(243 * 24 * HOUR),
      }),
      count: 1,
    },
  });
  const healthy = craft({
    id: 'workbench',
    stationId: 'workbench',
    productItem: { item: item('workbench-output', { flea: 500, updated: at(2 * HOUR) }), count: 1 },
  });

  const { current, stale } = partition([bitcoin, healthy]);
  assert.deepEqual(current.map((leader) => leader.craftId), ['workbench']);
  assert.deepEqual(stale.map((leader) => leader.craftId), ['bitcoin-farm']);
  assert.equal(stale[0]?.priceUpdatedAt, at(243 * 24 * HOUR));
});

test('partitioning preserves ranking order within each group', () => {
  const { current } = partition([
    craft({ id: 'a', stationId: 'a-station' }),
    craft({ id: 'b', stationId: 'b-station' }),
    craft({ id: 'c', stationId: 'c-station' }),
  ]);
  assert.deepEqual(current.map((leader) => leader.station.id), [
    'a-station',
    'b-station',
    'c-station',
  ]);
});
