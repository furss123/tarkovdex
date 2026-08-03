import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateFuelCost,
  calculateManualFee,
  calculatePersonalizedCraft,
  calculateRequiredPurchaseQuantity,
  createDefaultCraftPreferences,
  resolveIngredientUnitPrice,
  resolveOutputUnitPrice,
  sortCraftResults,
} from '../src/lib/personalized-craft';
import type { CraftDeal, PriceOption } from '../src/types/tools';

function price(partial: Partial<PriceOption> = {}): PriceOption {
  return {
    flea: 1000,
    traderBuy: 800,
    traderSell: 700,
    updated: '2026-08-03T12:00:00.000Z',
    ...partial,
  };
}

function craft(overrides: Partial<CraftDeal> = {}): CraftDeal {
  const material = {
    item: {
      id: 'mat-1',
      name: 'Bolt',
      shortName: 'Bolt',
      iconLink: null,
      types: ['barter'],
      categories: [],
      price: price({ flea: 1000, traderBuy: 900 }),
    },
    count: 2,
  };
  const tool = {
    item: {
      id: 'tool-1',
      name: 'Screwdriver',
      shortName: 'SD',
      iconLink: null,
      types: ['barter'],
      categories: [],
      price: price({ flea: 5000, traderBuy: 4000 }),
    },
    count: 1,
    tool: true as const,
  };
  const product = {
    item: {
      id: 'out-1',
      name: 'Salewa',
      shortName: 'Salewa',
      iconLink: null,
      types: ['meds'],
      categories: [],
      price: price({ flea: 20000, traderSell: 5000 }),
    },
    count: 1,
  };
  return {
    id: 'craft-1',
    station: { id: 'med', name: 'Medstation', imageLink: null },
    level: 1,
    duration: 3600,
    requiredItems: [material, tool],
    requiredQuestItems: [],
    productItem: product,
    productItems: [product],
    active: true,
    updated: '2026-08-03T12:00:00.000Z',
    ...overrides,
  };
}

test('purchase quantity subtracts owned without going negative', () => {
  assert.equal(calculateRequiredPurchaseQuantity(5, 2), 3);
  assert.equal(calculateRequiredPurchaseQuantity(5, 5), 0);
  assert.equal(calculateRequiredPurchaseQuantity(5, 9), 0);
});

test('ingredient and output price modes resolve without inventing zeros', () => {
  const p = price({ flea: 1000, traderBuy: 800, traderSell: 900 });
  assert.equal(resolveIngredientUnitPrice(p, 'flea'), 1000);
  assert.equal(resolveIngredientUnitPrice(p, 'trader'), 800);
  assert.equal(resolveIngredientUnitPrice(p, 'best-value'), 800);
  assert.equal(resolveIngredientUnitPrice(p, 'flea-net', 5), 950);
  assert.equal(resolveIngredientUnitPrice(price({ flea: null, traderBuy: null }), 'flea'), null);

  assert.equal(resolveOutputUnitPrice(p, 'flea'), 1000);
  assert.equal(resolveOutputUnitPrice(p, 'trader'), 900);
  assert.equal(resolveOutputUnitPrice(p, 'best-value'), 1000);
  assert.equal(resolveOutputUnitPrice(p, 'flea-net', 10), 900);
});

test('fuel and manual fee modes', () => {
  assert.equal(calculateFuelCost(3600, { mode: 'none' }), 0);
  assert.equal(calculateFuelCost(3600, { mode: 'per-hour', rublesPerHour: 1000 }), 1000);
  assert.equal(calculateFuelCost(1800, { mode: 'fixed', fixedCost: 250 }), 250);
  assert.equal(calculateManualFee(10000, { mode: 'none' }), 0);
  assert.equal(calculateManualFee(10000, { mode: 'fixed', value: 500 }), 500);
  assert.equal(calculateManualFee(10000, { mode: 'percent', value: 5 }), 500);
});

test('cash-only excludes owned materials from additional purchase cost', () => {
  const prefs = createDefaultCraftPreferences();
  prefs.ingredientPriceMode = 'flea';
  prefs.outputSaleMode = 'flea';
  const result = calculatePersonalizedCraft({
    craft: craft(),
    preferences: prefs,
    ownedCounts: { 'mat-1': 2, 'tool-1': 1 },
  });
  assert.equal(result.additionalPurchaseCost, 0);
  assert.equal(result.ownedMaterialValue, 2000);
  assert.equal(result.totalEconomicCost, 2000);
  assert.equal(result.grossOutputValue, 20000);
  assert.equal(result.cashProfit, 20000);
  assert.equal(result.economicProfit, 18000);
  assert.equal(result.calculable, true);
  assert.ok(result.reasons.includes('cash-only'));
  assert.ok(result.reusableToolValueExcluded > 0);
});

test('unowned materials and tools add to cash cost; missing prices stay partial', () => {
  const prefs = createDefaultCraftPreferences();
  prefs.ingredientPriceMode = 'flea';
  prefs.outputSaleMode = 'flea';
  const missing = craft({
    requiredItems: [
      {
        item: {
          id: 'mat-x',
          name: 'Unknown',
          shortName: 'U',
          iconLink: null,
          types: [],
          categories: [],
          price: price({ flea: null, traderBuy: null }),
        },
        count: 1,
      },
    ],
  });
  const result = calculatePersonalizedCraft({
    craft: missing,
    preferences: prefs,
    ownedCounts: {},
  });
  assert.equal(result.additionalPurchaseCost, null);
  assert.equal(result.calculable, false);
  assert.equal(result.partial, true);
  assert.deepEqual(result.missingInputPriceItemIds, ['mat-x']);
});

test('opportunity-cost uses economic profit for ROI and hourly', () => {
  const prefs = createDefaultCraftPreferences();
  prefs.ownedMaterialCostMode = 'opportunity-cost';
  prefs.ingredientPriceMode = 'flea';
  prefs.outputSaleMode = 'flea';
  prefs.fuelCost = { mode: 'per-hour', rublesPerHour: 1000 };
  const result = calculatePersonalizedCraft({
    craft: craft(),
    preferences: prefs,
    ownedCounts: { 'mat-1': 2, 'tool-1': 1 },
  });
  assert.equal(result.cashProfit, 19000);
  assert.equal(result.economicProfit, 17000);
  assert.equal(result.roi, 17000 / 3000);
  assert.equal(result.profitPerHour, 17000);
});

test('sortCraftResults is deterministic and puts nulls last for profit sorts', () => {
  const prefs = createDefaultCraftPreferences();
  const a = {
    craft: craft({ id: 'a' }),
    result: calculatePersonalizedCraft({
      craft: craft({ id: 'a' }),
      preferences: prefs,
      ownedCounts: {},
    }),
  };
  const b = {
    craft: craft({ id: 'b', duration: 0 }),
    result: {
      ...calculatePersonalizedCraft({
        craft: craft({ id: 'b' }),
        preferences: prefs,
        ownedCounts: { 'mat-1': 99, 'tool-1': 1 },
      }),
      cashProfit: null,
      profitPerHour: null,
    },
  };
  const sorted = sortCraftResults([b, a], 'cash-profit');
  assert.equal(sorted[0].craft.id, 'a');
  assert.equal(sorted[1].craft.id, 'b');
});
