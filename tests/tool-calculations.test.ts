import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateBarterProfit,
  calculateCraftProfit,
  compareCondition,
  isReturnedCraftTool,
  normalizeArmorZones,
  penetrationGrade,
  selectBestCraftsByStation,
  selectSalePrice,
} from '../src/lib/tool-calculations';
import type {
  BarterDeal,
  CraftDeal,
  ExchangePart,
  ToolItem,
} from '../src/types/tools';

const item = (id: string, flea: number | null, traderBuy: number | null, traderSell = traderBuy): ToolItem => ({
  id,
  name: id,
  shortName: id,
  iconLink: null,
  types: [],
  categories: [],
  price: { flea, traderBuy, traderSell, updated: null },
});

type CraftOptions = {
  id?: string;
  stationId?: string;
  stationName?: string;
  level?: number;
  duration?: number;
  requiredItems?: ExchangePart[];
  productItem?: ExchangePart;
  productItems?: ExchangePart[];
  active?: boolean;
  unresolvedQuestRequirements?: string[];
};

function craft(options: CraftOptions = {}): CraftDeal {
  const productItem = options.productItem ?? {
    item: item('output', 300, null, 250),
    count: 1,
  };
  return {
    id: options.id ?? 'craft',
    station: {
      id: options.stationId ?? 'station',
      name: options.stationName ?? 'Station',
      imageLink: null,
    },
    level: options.level ?? 1,
    duration: options.duration ?? 3600,
    requiredItems: options.requiredItems ?? [
      { item: item('input', 100, 80), count: 1 },
    ],
    requiredQuestItems: [],
    unresolvedQuestRequirements: options.unresolvedQuestRequirements,
    productItem,
    productItems: options.productItems,
    active: options.active,
    updated: null,
  };
}

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

test('barter output uses the best sale route and only charges a flea fee on flea sales', () => {
  const deal: BarterDeal = {
    id: 'vendor-output',
    trader: { id: 't', name: 'trader' },
    minTraderLevel: 1,
    restockAmount: null,
    buyLimit: null,
    taskUnlock: null,
    requiredItems: [{ item: item('input', 100, 80), count: 2 }],
    offeredItem: { item: item('output', 300, null, 350), count: 1 },
    updated: null,
  };

  const result = calculateBarterProfit(deal, 'best', 0.25);
  assert.equal(result.outputGross, 350);
  assert.equal(result.outputNet, 350);
  assert.equal(result.profit, 190);

  deal.offeredItem.item.price.flea = 0;
  assert.equal(calculateBarterProfit(deal, 'best', 0.25).outputNet, 350);
  deal.offeredItem.item.price.traderSell = 0;
  assert.equal(calculateBarterProfit(deal, 'best', 0.25).profit, null);
});

test('zero input quantity is malformed rather than a free material', () => {
  const deal = craft({
    requiredItems: [{ item: item('input', 100, 80), count: 0 }],
  });
  const result = calculateCraftProfit(deal, 'best', 0);
  assert.equal(result.inputCost, null);
  assert.equal(result.profit, null);
  assert.deepEqual(result.missing, ['input']);
});

test('invalid duration or operating cost does not become a zero cost', () => {
  assert.equal(calculateCraftProfit(craft({ duration: Number.NaN }), 'best', 0).profit, null);
  assert.equal(calculateCraftProfit(craft(), 'best', Number.NaN).profit, null);
});

test('an unresolved quest gate preserves the recipe but disqualifies profit ranking', () => {
  const gated = craft({
    id: 'unresolved-gate',
    unresolvedQuestRequirements: ['missing-gate-id'],
  });
  const result = calculateCraftProfit(gated, 'best', 0);

  assert.equal(result.inputCost, 80);
  assert.equal(result.outputGross, 300);
  assert.equal(result.profit, null);
  assert.deepEqual(result.missing, ['quest:missing-gate-id']);
  assert.deepEqual(selectBestCraftsByStation([gated]), []);
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

test('current JSON craft flags classify only an exact boolean tool flag', () => {
  assert.equal(isReturnedCraftTool({ tool: true }), true);
  assert.equal(isReturnedCraftTool({}), false);
  assert.equal(isReturnedCraftTool({ functional: true }), false);
  assert.equal(isReturnedCraftTool({ tool: 'true' }), false);
  assert.equal(isReturnedCraftTool({ tool: 1 }), false);
});

test('ItemAttribute arrays require the exact returned-tool tuple and value', () => {
  assert.equal(
    isReturnedCraftTool([{ type: 'tool', name: 'tool', value: 'true' }]),
    true,
  );
  assert.equal(
    isReturnedCraftTool([{ type: 'tool', name: 'tool', value: true }]),
    true,
  );
  assert.equal(isReturnedCraftTool([]), false);
  assert.equal(isReturnedCraftTool(undefined), false);
  assert.equal(isReturnedCraftTool(null), false);
  assert.equal(
    isReturnedCraftTool([{ type: 'functional', name: 'functional', value: 'true' }]),
    false,
  );
  assert.equal(
    isReturnedCraftTool([{ type: 'Tool', name: 'tool', value: 'true' }]),
    false,
  );
  assert.equal(
    isReturnedCraftTool([{ type: 'tool', name: 'tool', value: 'TRUE' }]),
    false,
  );
  assert.equal(
    isReturnedCraftTool([{ type: 'tool', name: 'tool', value: 1 }]),
    false,
  );
});

test('API-shaped attributes exclude returned tools but keep ordinary inputs', () => {
  const returnedToolAttributes = [{ type: 'tool', name: 'tool', value: 'true' }];
  const materialAttributes = [{ type: 'functional', name: 'functional', value: 'true' }];
  const deal = craft({
    requiredItems: [
      {
        item: item('returned-tool', 10_000, null),
        count: 1,
        tool: isReturnedCraftTool(returnedToolAttributes) || undefined,
      },
      {
        item: item('ordinary-material', 125, null),
        count: 2,
        tool: isReturnedCraftTool(materialAttributes) || undefined,
      },
    ],
    productItem: { item: item('output', 500, null), count: 1 },
  });
  const result = calculateCraftProfit(deal, 'flea', 0);
  assert.equal(result.inputCost, 250);
  assert.equal(result.outputGross, 500);
  assert.equal(result.profit, 250);
  assert.deepEqual(result.tools, ['returned-tool']);
});

test('missing attributes and non-finite counts never create NaN profit', () => {
  const safe = craft({
    requiredItems: [{ item: item('material', 100, null), count: 2 }],
  });
  assert.equal(calculateCraftProfit(safe, 'flea', 0).profit, 100);

  const malformed = craft({
    requiredItems: [{ item: item('material', 100, null), count: Number.NaN }],
  });
  const result = calculateCraftProfit(malformed, 'flea', 0);
  assert.equal(result.profit, null);
  assert.equal(Number.isNaN(result.inputCost), false);
});

test('single-output craft uses the cheapest input and highest sale route', () => {
  const result = calculateCraftProfit(craft(), 'best', 0);
  assert.equal(result.inputCost, 80);
  assert.equal(result.outputGross, 300);
  assert.equal(result.profit, 220);
});

test('craft output quantity is multiplied into sale value', () => {
  const deal = craft({
    productItem: { item: item('output', 300, null, 250), count: 2 },
  });
  assert.equal(calculateCraftProfit(deal, 'best', 0).outputGross, 600);
});

test('multiple output kinds are all included when the data provides them', () => {
  const primary = { item: item('primary', 200, null, 150), count: 1 };
  const byproduct = { item: item('byproduct', 125, null, 100), count: 2 };
  const result = calculateCraftProfit(
    craft({ productItem: primary, productItems: [primary, byproduct] }),
    'best',
    0,
  );
  assert.equal(result.outputGross, 450);
  assert.equal(result.profit, 370);
});

test('a tool without the returned-tool flag is consumed', () => {
  const deal = craft({
    requiredItems: [{ item: item('consumed-tool', 500, 400), count: 1 }],
  });
  assert.equal(calculateCraftProfit(deal, 'best', 0).inputCost, 400);
});

test('missing input price invalidates the craft instead of becoming zero', () => {
  const deal = craft({
    requiredItems: [{ item: item('missing-input', null, null), count: 1 }],
  });
  const result = calculateCraftProfit(deal, 'best', 0);
  assert.equal(result.profit, null);
  assert.deepEqual(result.missing, ['missing-input']);
});

test('missing output price invalidates the craft instead of becoming zero', () => {
  const deal = craft({
    productItem: { item: item('missing-output', null, null, null), count: 1 },
  });
  const result = calculateCraftProfit(deal, 'best', 0);
  assert.equal(result.profit, null);
  assert.deepEqual(result.missing, ['missing-output']);
});

test('a station whose crafts all lose money keeps the smallest loss', () => {
  const leaders = selectBestCraftsByStation([
    craft({
      id: 'larger-loss',
      requiredItems: [{ item: item('input-a', 150, 150), count: 1 }],
      productItem: { item: item('output-a', 50, null, 40), count: 1 },
    }),
    craft({
      id: 'smaller-loss',
      requiredItems: [{ item: item('input-b', 100, 100), count: 1 }],
      productItem: { item: item('output-b', 80, null, 70), count: 1 },
    }),
  ]);
  assert.equal(leaders[0]?.craftId, 'smaller-loss');
  assert.equal(leaders[0]?.profit, -20);
});

test('a profitable craft outranks a loss at the same station', () => {
  const leaders = selectBestCraftsByStation([
    craft({ id: 'loss', productItem: { item: item('loss-output', 50, null), count: 1 } }),
    craft({ id: 'profit', productItem: { item: item('profit-output', 500, null), count: 1 } }),
  ]);
  assert.equal(leaders[0]?.craftId, 'profit');
});

test('profit ties prefer higher hourly profit, then stable price coverage', () => {
  const fast = craft({
    id: 'fast',
    duration: 1800,
    productItem: { item: item('fast-output', 180, null, 170), count: 1 },
  });
  const slow = craft({
    id: 'slow',
    duration: 3600,
    productItem: { item: item('slow-output', 180, null, 170), count: 1 },
  });
  assert.equal(selectBestCraftsByStation([slow, fast])[0]?.craftId, 'fast');

  const lessStable = craft({
    id: 'less-stable',
    productItem: { item: item('less-stable-output', 180, null, null), count: 1 },
  });
  const stable = craft({
    id: 'stable',
    productItem: { item: item('stable-output', 180, null, 170), count: 1 },
  });
  assert.equal(selectBestCraftsByStation([lessStable, stable])[0]?.craftId, 'stable');
});

test('hourly profit uses the base craft duration in seconds', () => {
  const result = calculateCraftProfit(craft({ duration: 7200 }), 'best', 0);
  assert.equal(result.profit, 220);
  assert.equal(result.hourlyProfit, 110);
});

test('zero or missing-equivalent duration omits hourly profit', () => {
  assert.equal(calculateCraftProfit(craft({ duration: 0 }), 'best', 0).hourlyProfit, null);
});

test('flea-unavailable output falls back to the trader value', () => {
  const price = item('vendor-only', null, null, 275).price;
  assert.deepEqual(selectSalePrice(price), { value: 275, source: 'trader' });
});

test('sale value chooses the higher realizable trader or flea route', () => {
  assert.deepEqual(selectSalePrice(item('vendor-best', 250, null, 300).price), {
    value: 300,
    source: 'trader',
  });
  assert.deepEqual(selectSalePrice(item('flea-best', 350, null, 300).price), {
    value: 350,
    source: 'flea',
  });
});

test('multiple levels of one station collapse to one best card', () => {
  const leaders = selectBestCraftsByStation([
    craft({ id: 'level-1', level: 1 }),
    craft({
      id: 'level-3',
      level: 3,
      productItem: { item: item('level-3-output', 600, null), count: 1 },
    }),
  ]);
  assert.equal(leaders.length, 1);
  assert.equal(leaders[0]?.level, 3);
});

test('explicitly inactive seasonal crafts are excluded while active ones remain', () => {
  const leaders = selectBestCraftsByStation([
    craft({ id: 'inactive', stationId: 'seasonal', active: false }),
    craft({ id: 'active', stationId: 'seasonal', active: true }),
  ]);
  assert.deepEqual(leaders.map((leader) => leader.craftId), ['active']);
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
