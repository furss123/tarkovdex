import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateBarterProfit,
  calculateCraftProfit,
  compareCondition,
  normalizeArmorZones,
  penetrationGrade,
} from '../src/lib/tool-calculations';
import type { BarterDeal, CraftDeal, ToolItem } from '../src/types/tools';

const item = (id: string, flea: number | null, traderBuy: number | null, traderSell = traderBuy): ToolItem => ({
  id,
  name: id,
  shortName: id,
  iconLink: null,
  types: [],
  categories: [],
  price: { flea, traderBuy, traderSell, updated: null },
});

test('barter calculation preserves profit and loss and refuses missing prices', () => {
  const deal: BarterDeal = {
    id: 'deal',
    trader: { id: 't', name: 'trader' },
    minTraderLevel: 1,
    restockAmount: null,
    buyLimit: null,
    taskUnlock: null,
    requiredItems: [{ item: item('input', 100, 80), count: 2 }],
    offeredItem: { item: item('output', 300, null, 250), count: 1 },
    updated: null,
  };
  assert.equal(calculateBarterProfit(deal, 'best', 0.05).inputCost, 160);
  assert.equal(calculateBarterProfit(deal, 'best', 0.05).profit, 125);
  assert.ok((calculateBarterProfit(deal, 'flea', 0.05).profit ?? 0) > 0);
  deal.offeredItem.item.price.flea = 100;
  assert.ok((calculateBarterProfit(deal, 'flea', 0).profit ?? 0) < 0);
  deal.requiredItems[0].item.price.flea = null;
  assert.equal(calculateBarterProfit(deal, 'flea', 0).profit, null);
});

test('craft tools are excluded from consumed cost', () => {
  const craft: CraftDeal = {
    id: 'craft',
    station: { id: 's', name: 'station' },
    level: 1,
    duration: 3600,
    requiredItems: [
      { item: item('tool', 10_000, null), count: 1, tool: true },
      { item: item('material', 100, null), count: 2 },
    ],
    requiredQuestItems: [],
    productItem: { item: item('output', 500, null), count: 1 },
    updated: null,
  };
  const result = calculateCraftProfit(craft, 'flea', 50);
  assert.equal(result.inputCost, 200);
  assert.equal(result.profit, 250);
  assert.deepEqual(result.tools, ['tool']);
});

test('penetration matrix returns transparent grades for classes 1-6', () => {
  assert.equal(penetrationGrade(45, 4), 'excellent');
  assert.equal(penetrationGrade(40, 4), 'good');
  assert.equal(penetrationGrade(36, 4), 'limited');
  assert.equal(penetrationGrade(20, 4), 'poor');
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((value) => penetrationGrade(35, value)).length, 6);
});

test('armor zones map known values and expose unknown values', () => {
  const mapped = normalizeArmorZones(['Collider Type RibcageUp', 'Future Zone']);
  assert.deepEqual(mapped.normalized, ['upperChest']);
  assert.deepEqual(mapped.unknown, ['Future Zone']);
});

test('gunsmith numeric comparison methods are explicit', () => {
  assert.equal(compareCondition(45, 45, '>='), true);
  assert.equal(compareCondition(4, 5, '<='), true);
  assert.equal(compareCondition(4, 5, 'unknown'), false);
});
