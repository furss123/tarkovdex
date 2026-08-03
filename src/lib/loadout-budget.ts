/**
 * Loadout / gear budget calculator — cost, weight, slots only.
 * Does not validate weapon/ammo/plate compatibility.
 */

import type { WatchPriceType } from '@/lib/watchlist';
import {
  isSafeWatchPrice,
  isWatchPriceType,
  priceForType,
} from '@/lib/watchlist';
import type { MarketItem } from '@/types/tarkov';
import { finiteNonNegative, finitePositive } from '@/lib/tool-calculations';

export const BUDGET_GEAR_CATEGORIES = [
  'gun',
  'ammo',
  'armor',
  'helmet',
  'headphones',
  'rig',
  'backpack',
  'armorPlate',
  'meds',
  'grenade',
] as const;

export type BudgetGearCategory = (typeof BUDGET_GEAR_CATEGORIES)[number];

export function isBudgetGearCategory(value: unknown): value is BudgetGearCategory {
  return (
    typeof value === 'string' &&
    (BUDGET_GEAR_CATEGORIES as readonly string[]).includes(value)
  );
}

/** Stable types used by the budget picker — never invent from display names. */
export function categoryFromItemTypes(types: string[]): BudgetGearCategory | null {
  for (const cat of BUDGET_GEAR_CATEGORIES) {
    if (types.includes(cat)) return cat;
  }
  return null;
}

/** Message key for a budget category — avoids leaking raw `armorPlate` into i18n. */
export function categoryMessageKey(
  category: string,
): 'gun' | 'ammo' | 'armor' | 'helmet' | 'headphones' | 'rig' | 'backpack' | 'plate' | 'meds' | 'grenade' | null {
  if (category === 'armorPlate') return 'plate';
  if (
    category === 'gun' ||
    category === 'ammo' ||
    category === 'armor' ||
    category === 'helmet' ||
    category === 'headphones' ||
    category === 'rig' ||
    category === 'backpack' ||
    category === 'meds' ||
    category === 'grenade'
  ) {
    return category;
  }
  return null;
}

export interface BudgetLine {
  id: string;
  itemId: string;
  category: string;
  quantity: number;
  priceType: WatchPriceType;
}

export interface BudgetPreset {
  id: string;
  name: string;
  budget?: number;
  lines: BudgetLine[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetLinePriceInput {
  line: BudgetLine;
  item: MarketItem | null;
}

export interface BudgetLineCalc {
  lineId: string;
  itemId: string;
  unitPrice: number | null;
  subtotal: number | null;
  unitWeight: number | null;
  weightSubtotal: number | null;
  unitSlots: number | null;
  slotsSubtotal: number | null;
  priceMissing: boolean;
  weightMissing: boolean;
  slotsMissing: boolean;
  orphan: boolean;
  stale: boolean;
}

export type BudgetStatus = 'within' | 'over' | 'unknown';

export interface BudgetCalculationResult {
  lines: BudgetLineCalc[];
  knownSubtotal: number;
  missingPriceLineIds: string[];
  totalPrice: number | null;
  knownWeight: number;
  missingWeightLineIds: string[];
  totalWeight: number | null;
  knownSlots: number;
  missingSlotLineIds: string[];
  totalSlots: number | null;
  budget: number | undefined;
  budgetStatus: BudgetStatus;
  remainingBudget: number | null;
  overBudgetBy: number | null;
  staleLineIds: string[];
  orphanLineIds: string[];
  partial: boolean;
}

export function resolveBudgetLinePrice(
  item: MarketItem | null,
  priceType: WatchPriceType,
): number | null {
  if (!item) return null;
  if (!isWatchPriceType(priceType)) return null;
  return priceForType(item, priceType);
}

export function calculateBudgetLine(
  input: BudgetLinePriceInput,
  options?: { staleItemIds?: Set<string> },
): BudgetLineCalc {
  const { line, item } = input;
  const qty = finitePositive(line.quantity);
  const orphan = item == null;
  const unitPrice = resolveBudgetLinePrice(item, line.priceType);
  const unitWeight = item ? finiteNonNegative(item.weight) : null;
  const unitSlots = item
    ? finitePositive(item.slotCount) ??
      (finitePositive(item.width) != null && finitePositive(item.height) != null
        ? (item.width as number) * (item.height as number)
        : null)
    : null;

  const priceMissing = unitPrice === null || qty === null;
  const weightMissing = unitWeight === null || qty === null;
  const slotsMissing = unitSlots === null || qty === null;

  return {
    lineId: line.id,
    itemId: line.itemId,
    unitPrice,
    subtotal: !priceMissing && unitPrice !== null && qty !== null ? unitPrice * qty : null,
    unitWeight,
    weightSubtotal:
      !weightMissing && unitWeight !== null && qty !== null ? unitWeight * qty : null,
    unitSlots,
    slotsSubtotal:
      !slotsMissing && unitSlots !== null && qty !== null ? unitSlots * qty : null,
    priceMissing,
    weightMissing,
    slotsMissing,
    orphan,
    stale: Boolean(options?.staleItemIds?.has(line.itemId)),
  };
}

export function determineBudgetStatus(input: {
  budget: number | undefined;
  knownSubtotal: number;
  missingPrice: boolean;
}): {
  budgetStatus: BudgetStatus;
  remainingBudget: number | null;
  overBudgetBy: number | null;
} {
  const budget = input.budget;
  if (budget === undefined || !isSafeWatchPrice(budget)) {
    return { budgetStatus: 'unknown', remainingBudget: null, overBudgetBy: null };
  }
  if (input.knownSubtotal > budget) {
    return {
      budgetStatus: 'over',
      remainingBudget: null,
      overBudgetBy: input.knownSubtotal - budget,
    };
  }
  if (input.missingPrice) {
    return { budgetStatus: 'unknown', remainingBudget: null, overBudgetBy: null };
  }
  return {
    budgetStatus: 'within',
    remainingBudget: budget - input.knownSubtotal,
    overBudgetBy: null,
  };
}

export function calculateBudgetPreset(
  preset: Pick<BudgetPreset, 'budget' | 'lines'>,
  itemsById: Map<string, MarketItem>,
  options?: { staleItemIds?: Iterable<string> },
): BudgetCalculationResult {
  const staleSet = new Set(options?.staleItemIds ?? []);
  const lines = preset.lines.map((line) =>
    calculateBudgetLine(
      { line, item: itemsById.get(line.itemId) ?? null },
      { staleItemIds: staleSet },
    ),
  );

  let knownSubtotal = 0;
  let knownWeight = 0;
  let knownSlots = 0;
  const missingPriceLineIds: string[] = [];
  const missingWeightLineIds: string[] = [];
  const missingSlotLineIds: string[] = [];
  const staleLineIds: string[] = [];
  const orphanLineIds: string[] = [];

  for (const line of lines) {
    if (line.orphan) orphanLineIds.push(line.lineId);
    if (line.stale) staleLineIds.push(line.lineId);
    if (line.subtotal != null) knownSubtotal += line.subtotal;
    else missingPriceLineIds.push(line.lineId);
    if (line.weightSubtotal != null) knownWeight += line.weightSubtotal;
    else missingWeightLineIds.push(line.lineId);
    if (line.slotsSubtotal != null) knownSlots += line.slotsSubtotal;
    else missingSlotLineIds.push(line.lineId);
  }

  const priceComplete = missingPriceLineIds.length === 0;
  const weightComplete = missingWeightLineIds.length === 0;
  const slotsComplete = missingSlotLineIds.length === 0;
  const status = determineBudgetStatus({
    budget: preset.budget,
    knownSubtotal,
    missingPrice: !priceComplete,
  });

  return {
    lines,
    knownSubtotal,
    missingPriceLineIds,
    totalPrice: priceComplete ? knownSubtotal : null,
    knownWeight,
    missingWeightLineIds,
    totalWeight: weightComplete ? knownWeight : null,
    knownSlots,
    missingSlotLineIds,
    totalSlots: slotsComplete ? knownSlots : null,
    budget: preset.budget,
    budgetStatus: status.budgetStatus,
    remainingBudget: status.remainingBudget,
    overBudgetBy: status.overBudgetBy,
    staleLineIds,
    orphanLineIds,
    partial: !priceComplete || !weightComplete || !slotsComplete || orphanLineIds.length > 0,
  };
}

export function normalizeBudgetLines(lines: BudgetLine[]): BudgetLine[] {
  return lines
    .filter(
      (line) =>
        typeof line.id === 'string' &&
        line.id.length > 0 &&
        typeof line.itemId === 'string' &&
        line.itemId.length > 0 &&
        finitePositive(line.quantity) !== null &&
        isWatchPriceType(line.priceType),
    )
    .map((line) => ({
      id: line.id,
      itemId: line.itemId,
      category: typeof line.category === 'string' ? line.category : '',
      quantity: Math.floor(line.quantity),
      priceType: line.priceType,
    }));
}

export function cloneBudgetPreset(
  preset: BudgetPreset,
  now: string,
  newId: string,
  nameSuffix: string,
): BudgetPreset {
  return {
    id: newId,
    name: `${preset.name}${nameSuffix}`.slice(0, 100),
    budget: preset.budget,
    lines: preset.lines.map((line) => ({
      ...line,
      id: `${newId}:${line.id}`,
    })),
    notes: preset.notes,
    createdAt: now,
    updatedAt: now,
  };
}

/** Optional weight on market payloads for budget aggregation. */
export type BudgetItemSnapshot = MarketItem & { weight?: number | null };
