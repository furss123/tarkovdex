import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateBudgetPreset,
  cloneBudgetPreset,
  determineBudgetStatus,
  normalizeBudgetLines,
  type BudgetLine,
  type BudgetPreset,
} from '../src/lib/loadout-budget';
import type { MarketItem } from '../src/types/tarkov';

function item(partial: Partial<MarketItem> & { id: string }): MarketItem {
  return {
    name: partial.name ?? partial.id,
    shortName: partial.shortName ?? partial.id,
    width: partial.width ?? 2,
    height: partial.height ?? 2,
    weight: partial.weight ?? 1,
    types: partial.types ?? ['armor'],
    avg24hPrice: partial.avg24hPrice ?? 10000,
    low24hPrice: null,
    high24hPrice: null,
    changeLast48hPercent: null,
    updated: '2026-08-03T12:00:00.000Z',
    iconLink: null,
    bestVendorSellRUB: partial.bestVendorSellRUB ?? 5000,
    slotCount: partial.slotCount ?? 4,
    estimatedFleaNet: partial.estimatedFleaNet ?? 9500,
    referenceValue: partial.referenceValue ?? 9500,
    valuePerSlot: partial.valuePerSlot ?? 2375,
    valueSource: 'flea',
    freshnessHours: partial.freshnessHours ?? 1,
    ...partial,
  };
}

function line(partial: Partial<BudgetLine> & { id: string; itemId: string }): BudgetLine {
  return {
    category: 'armor',
    quantity: 1,
    priceType: 'flea-net',
    ...partial,
  };
}

test('determineBudgetStatus: within, exact, over, and unknown with missing prices', () => {
  assert.equal(
    determineBudgetStatus({ budget: 100, knownSubtotal: 80, missingPrice: false }).budgetStatus,
    'within',
  );
  assert.equal(
    determineBudgetStatus({ budget: 100, knownSubtotal: 100, missingPrice: false }).remainingBudget,
    0,
  );
  assert.equal(
    determineBudgetStatus({ budget: 100, knownSubtotal: 120, missingPrice: true }).budgetStatus,
    'over',
  );
  assert.equal(
    determineBudgetStatus({ budget: 100, knownSubtotal: 80, missingPrice: true }).budgetStatus,
    'unknown',
  );
});

test('calculateBudgetPreset aggregates price weight slots and orphans', () => {
  const preset: Pick<BudgetPreset, 'budget' | 'lines'> = {
    budget: 20000,
    lines: [
      line({ id: 'l1', itemId: 'a', quantity: 2, priceType: 'flea' }),
      line({ id: 'l2', itemId: 'missing', quantity: 1, priceType: 'flea' }),
    ],
  };
  const map = new Map([['a', item({ id: 'a', avg24hPrice: 4000, weight: 2.5, width: 2, height: 2, slotCount: 4 })]]);
  const result = calculateBudgetPreset(preset, map);
  assert.equal(result.knownSubtotal, 8000);
  assert.equal(result.totalPrice, null);
  assert.deepEqual(result.missingPriceLineIds, ['l2']);
  assert.deepEqual(result.orphanLineIds, ['l2']);
  assert.equal(result.knownWeight, 5);
  assert.equal(result.totalWeight, null);
  assert.equal(result.budgetStatus, 'unknown');
  assert.equal(result.partial, true);
});

test('complete priced preset can be within budget', () => {
  const preset = {
    budget: 10000,
    lines: [line({ id: 'l1', itemId: 'a', quantity: 1, priceType: 'flea-net' })],
  };
  const map = new Map([['a', item({ id: 'a', estimatedFleaNet: 9500, weight: 1, slotCount: 2 })]]);
  const result = calculateBudgetPreset(preset, map);
  assert.equal(result.totalPrice, 9500);
  assert.equal(result.totalWeight, 1);
  assert.equal(result.totalSlots, 2);
  assert.equal(result.budgetStatus, 'within');
  assert.equal(result.remainingBudget, 500);
});

test('normalizeBudgetLines drops invalid rows', () => {
  const normalized = normalizeBudgetLines([
    line({ id: 'ok', itemId: 'a', quantity: 2 }),
    line({ id: '', itemId: 'a', quantity: 1 }),
    line({ id: 'bad-qty', itemId: 'a', quantity: 0 }),
  ]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].id, 'ok');
});

test('cloneBudgetPreset remaps line ids and timestamps', () => {
  const source: BudgetPreset = {
    id: 'p1',
    name: 'Kit',
    budget: 50000,
    lines: [line({ id: 'l1', itemId: 'a' })],
    notes: 'note',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const clone = cloneBudgetPreset(source, '2026-08-03T12:00:00.000Z', 'p2', ' (copy)');
  assert.equal(clone.id, 'p2');
  assert.equal(clone.name, 'Kit (copy)');
  assert.equal(clone.lines[0].id, 'p2:l1');
  assert.equal(clone.createdAt, '2026-08-03T12:00:00.000Z');
});
