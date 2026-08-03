/**
 * Personalized hideout craft calculator — pure functions only.
 * Extends tool-calculations without inventing fees, fuel, or tool reuse.
 */

import type { CraftDeal, ExchangePart, PriceOption } from '@/types/tools';
import {
  finiteNonNegative,
  finitePositive,
  isReturnedCraftTool,
  selectPurchasePrice,
  selectSalePrice,
} from '@/lib/tool-calculations';
import type { WatchPriceType } from '@/lib/watchlist';
import { isSafeWatchPrice, isWatchPriceType } from '@/lib/watchlist';

export type IngredientPriceMode = WatchPriceType;
export type OutputSaleMode = WatchPriceType;
export type OwnedMaterialCostMode = 'cash-only' | 'opportunity-cost';

export type FuelCostInput =
  | { mode: 'none' }
  | { mode: 'per-hour'; rublesPerHour: number }
  | { mode: 'fixed'; fixedCost: number };

export type ManualFeeInput =
  | { mode: 'none' }
  | { mode: 'fixed'; value: number }
  | { mode: 'percent'; value: number };

export interface CraftPreferences {
  ingredientPriceMode: IngredientPriceMode;
  outputSaleMode: OutputSaleMode;
  ownedMaterialCostMode: OwnedMaterialCostMode;
  /** Station id → player hideout level. Missing = treat as unlocked for filter only. */
  stationLevels: Record<string, number>;
  fuelCost: FuelCostInput;
  manualFee: ManualFeeInput;
}

export function createDefaultCraftPreferences(): CraftPreferences {
  return {
    ingredientPriceMode: 'best-value',
    outputSaleMode: 'best-value',
    ownedMaterialCostMode: 'cash-only',
    stationLevels: {},
    fuelCost: { mode: 'none' },
    manualFee: { mode: 'none' },
  };
}

export function isOwnedMaterialCostMode(value: unknown): value is OwnedMaterialCostMode {
  return value === 'cash-only' || value === 'opportunity-cost';
}

export function isFuelCostInput(value: unknown): value is FuelCostInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (v.mode === 'none') return true;
  if (v.mode === 'per-hour') return isSafeWatchPrice(v.rublesPerHour);
  if (v.mode === 'fixed') return isSafeWatchPrice(v.fixedCost);
  return false;
}

export function isManualFeeInput(value: unknown): value is ManualFeeInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (v.mode === 'none') return true;
  if (v.mode === 'fixed' || v.mode === 'percent') {
    return isSafeWatchPrice(v.value) && (v.mode !== 'percent' || (v.value as number) <= 100);
  }
  return false;
}

/** Normalize fee rate 0–100 percent → fraction 0–1. */
export function feeFractionFromPercent(feeRatePercent: unknown): number {
  const n = finiteNonNegative(feeRatePercent);
  if (n === null) return 0;
  return Math.min(1, n / 100);
}

export function resolveIngredientUnitPrice(
  price: PriceOption,
  mode: IngredientPriceMode,
  feeRatePercent = 0,
): number | null {
  if (mode === 'flea') return finitePositive(price.flea);
  if (mode === 'trader') return finitePositive(price.traderBuy);
  if (mode === 'best-value') return selectPurchasePrice(price, 'best');
  // flea-net: opportunity value of the material if sold on flea after fee.
  const flea = finitePositive(price.flea);
  if (flea !== null) return flea * (1 - feeFractionFromPercent(feeRatePercent));
  return finitePositive(price.traderBuy);
}

export function resolveOutputUnitPrice(
  price: PriceOption,
  mode: OutputSaleMode,
  feeRatePercent = 0,
): number | null {
  if (mode === 'flea') return finitePositive(price.flea);
  if (mode === 'trader') return finitePositive(price.traderSell);
  if (mode === 'best-value') {
    const sale = selectSalePrice(price);
    return sale?.value ?? null;
  }
  const flea = finitePositive(price.flea);
  if (flea !== null) return flea * (1 - feeFractionFromPercent(feeRatePercent));
  return finitePositive(price.traderSell);
}

export function calculateRequiredPurchaseQuantity(
  required: number,
  owned: number,
): number {
  const need = finiteNonNegative(required) ?? 0;
  const have = finiteNonNegative(owned) ?? 0;
  return Math.max(0, need - have);
}

export function calculateFuelCost(
  durationSeconds: number,
  fuel: FuelCostInput,
): number | null {
  if (fuel.mode === 'none') return 0;
  if (fuel.mode === 'fixed') {
    return isSafeWatchPrice(fuel.fixedCost) ? fuel.fixedCost : null;
  }
  const duration = finiteNonNegative(durationSeconds);
  const rate = isSafeWatchPrice(fuel.rublesPerHour) ? fuel.rublesPerHour : null;
  if (duration === null || rate === null) return null;
  return (rate * duration) / 3600;
}

export function calculateManualFee(
  grossOutputValue: number,
  fee: ManualFeeInput,
): number | null {
  if (fee.mode === 'none') return 0;
  if (!isSafeWatchPrice(grossOutputValue)) return null;
  if (fee.mode === 'fixed') {
    return isSafeWatchPrice(fee.value) ? fee.value : null;
  }
  if (!isSafeWatchPrice(fee.value) || fee.value > 100) return null;
  return grossOutputValue * (fee.value / 100);
}

export interface PersonalizedCraftLine {
  itemId: string;
  name: string;
  required: number;
  owned: number;
  purchaseQuantity: number;
  unitPrice: number | null;
  isTool: boolean;
  priceMissing: boolean;
}

export interface PersonalizedCraftResult {
  craftId: string;
  lines: PersonalizedCraftLine[];
  additionalPurchaseCost: number | null;
  ownedMaterialValue: number | null;
  totalEconomicCost: number | null;
  knownPurchaseSubtotal: number;
  knownOwnedSubtotal: number;
  grossOutputValue: number | null;
  knownGrossOutputSubtotal: number;
  sellingFees: number | null;
  netOutputValue: number | null;
  fuelCost: number | null;
  cashProfit: number | null;
  economicProfit: number | null;
  roi: number | null;
  profitPerHour: number | null;
  reusableToolValueExcluded: number;
  missingInputPriceItemIds: string[];
  missingOutputPriceItemIds: string[];
  staleItemIds: string[];
  partial: boolean;
  calculable: boolean;
  reasons: string[];
}

export interface PersonalizedCraftInput {
  craft: CraftDeal;
  preferences: CraftPreferences;
  ownedCounts: Record<string, number>;
  /** 0–100, same contract as flea market feeRate. Used for flea-net mode. */
  feeRatePercent?: number;
  /** Optional stale item ids for labeling only. */
  staleItemIds?: string[];
}

function ownedOf(counts: Record<string, number>, itemId: string): number {
  const n = counts[itemId];
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function calculatePersonalizedCraft(
  input: PersonalizedCraftInput,
): PersonalizedCraftResult {
  const { craft, preferences } = input;
  const feeRate = input.feeRatePercent ?? 0;
  const staleItemIds = [...new Set(input.staleItemIds ?? [])];
  const reasons: string[] = [];
  const missingInputPriceItemIds: string[] = [];
  const missingOutputPriceItemIds: string[] = [];

  const lines: PersonalizedCraftLine[] = [];
  let knownPurchaseSubtotal = 0;
  let knownOwnedSubtotal = 0;
  let reusableToolValueExcluded = 0;
  let purchaseComplete = true;
  let ownedComplete = true;

  for (const part of craft.requiredItems) {
    const isTool = part.tool === true;
    const required = finitePositive(part.count);
    if (required === null) {
      purchaseComplete = false;
      continue;
    }
    const owned = ownedOf(input.ownedCounts, part.item.id);
    const purchaseQuantity = isTool
      ? owned > 0
        ? 0
        : required
      : calculateRequiredPurchaseQuantity(required, owned);
    const unitPrice = resolveIngredientUnitPrice(
      part.item.price,
      preferences.ingredientPriceMode,
      feeRate,
    );
    const priceMissing = unitPrice === null;

    if (isTool) {
      if (owned > 0) {
        if (unitPrice !== null) reusableToolValueExcluded += required * unitPrice;
        reasons.push(`tool-owned:${part.item.id}`);
      } else if (priceMissing) {
        missingInputPriceItemIds.push(part.item.id);
        purchaseComplete = false;
      } else {
        knownPurchaseSubtotal += required * (unitPrice as number);
      }
    } else {
      if (priceMissing) {
        missingInputPriceItemIds.push(part.item.id);
        if (purchaseQuantity > 0) purchaseComplete = false;
        if (Math.min(owned, required) > 0) ownedComplete = false;
      } else {
        const unit = unitPrice as number;
        knownPurchaseSubtotal += purchaseQuantity * unit;
        const consumedOwned = Math.min(owned, required);
        knownOwnedSubtotal += consumedOwned * unit;
      }
    }

    lines.push({
      itemId: part.item.id,
      name: part.item.name,
      required,
      owned,
      purchaseQuantity: isTool ? (owned > 0 ? 0 : required) : purchaseQuantity,
      unitPrice,
      isTool,
      priceMissing,
    });
  }

  const additionalPurchaseCost = purchaseComplete ? knownPurchaseSubtotal : null;
  const ownedMaterialValue = ownedComplete ? knownOwnedSubtotal : null;
  const totalEconomicCost =
    additionalPurchaseCost !== null && ownedMaterialValue !== null
      ? additionalPurchaseCost + ownedMaterialValue
      : null;

  let knownGrossOutputSubtotal = 0;
  let outputComplete = true;
  const outputs: ExchangePart[] = craft.productItems?.length
    ? craft.productItems
    : [craft.productItem];
  for (const output of outputs) {
    const count = finitePositive(output.count);
    const unit = resolveOutputUnitPrice(
      output.item.price,
      preferences.outputSaleMode,
      feeRate,
    );
    if (count === null || unit === null) {
      missingOutputPriceItemIds.push(output.item.id);
      outputComplete = false;
      continue;
    }
    knownGrossOutputSubtotal += count * unit;
  }
  const grossOutputValue = outputComplete ? knownGrossOutputSubtotal : null;

  // When outputSaleMode is already flea-net, manual fee stacks only if user set it.
  // When mode is flea/best-value and sale used flea, manual fee can model listing fee.
  const sellingFees =
    grossOutputValue === null
      ? null
      : calculateManualFee(grossOutputValue, preferences.manualFee);

  const netOutputValue =
    grossOutputValue !== null && sellingFees !== null
      ? grossOutputValue - sellingFees
      : null;

  const fuelCost = calculateFuelCost(craft.duration, preferences.fuelCost);

  const unresolved = (craft.unresolvedQuestRequirements ?? []).length > 0;
  if (unresolved) reasons.push('unresolved-quest-requirements');

  const cashBasisCost =
    additionalPurchaseCost !== null && fuelCost !== null
      ? additionalPurchaseCost + fuelCost
      : null;
  const economicBasisCost =
    totalEconomicCost !== null && fuelCost !== null
      ? totalEconomicCost + fuelCost
      : null;

  const cashProfit =
    !unresolved && netOutputValue !== null && cashBasisCost !== null
      ? netOutputValue - cashBasisCost
      : null;
  const economicProfit =
    !unresolved && netOutputValue !== null && economicBasisCost !== null
      ? netOutputValue - economicBasisCost
      : null;

  const costForRoi =
    preferences.ownedMaterialCostMode === 'opportunity-cost'
      ? economicBasisCost
      : cashBasisCost;
  const profitForRoi =
    preferences.ownedMaterialCostMode === 'opportunity-cost'
      ? economicProfit
      : cashProfit;

  const roi =
    profitForRoi !== null && costForRoi !== null && costForRoi > 0
      ? profitForRoi / costForRoi
      : null;

  const duration = finiteNonNegative(craft.duration);
  const profitPerHour =
    profitForRoi !== null && duration !== null && duration > 0
      ? profitForRoi / (duration / 3600)
      : null;

  const calculable =
    cashProfit !== null &&
    missingInputPriceItemIds.length === 0 &&
    missingOutputPriceItemIds.length === 0 &&
    !unresolved;

  const partial =
    !calculable &&
    (knownPurchaseSubtotal > 0 ||
      knownOwnedSubtotal > 0 ||
      knownGrossOutputSubtotal > 0);

  if (preferences.fuelCost.mode !== 'none') reasons.push('manual-fuel');
  if (preferences.manualFee.mode !== 'none') reasons.push('manual-fee');
  if (preferences.ownedMaterialCostMode === 'opportunity-cost') {
    reasons.push('opportunity-cost');
  } else {
    reasons.push('cash-only');
  }
  if (staleItemIds.length) reasons.push('stale-prices');

  return {
    craftId: craft.id,
    lines,
    additionalPurchaseCost,
    ownedMaterialValue,
    totalEconomicCost,
    knownPurchaseSubtotal,
    knownOwnedSubtotal,
    grossOutputValue,
    knownGrossOutputSubtotal,
    sellingFees,
    netOutputValue,
    fuelCost,
    cashProfit,
    economicProfit,
    roi,
    profitPerHour,
    reusableToolValueExcluded,
    missingInputPriceItemIds: [...new Set(missingInputPriceItemIds)],
    missingOutputPriceItemIds: [...new Set(missingOutputPriceItemIds)],
    staleItemIds,
    partial,
    calculable,
    reasons,
  };
}

export type CraftSortKey =
  | 'cash-profit'
  | 'economic-profit'
  | 'profit-per-hour'
  | 'additional-cost'
  | 'station';

export function sortCraftResults<T extends { craft: CraftDeal; result: PersonalizedCraftResult }>(
  rows: T[],
  key: CraftSortKey,
): T[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av === null && bv === null) return a.craft.id.localeCompare(b.craft.id);
    if (av === null) return 1;
    if (bv === null) return -1;
    if (key === 'additional-cost' || key === 'station') {
      return av - bv || a.craft.id.localeCompare(b.craft.id);
    }
    return bv - av || a.craft.id.localeCompare(b.craft.id);
  });
  return copy;
}

function sortValue(
  row: { craft: CraftDeal; result: PersonalizedCraftResult },
  key: CraftSortKey,
): number | null {
  switch (key) {
    case 'cash-profit':
      return row.result.cashProfit;
    case 'economic-profit':
      return row.result.economicProfit;
    case 'profit-per-hour':
      return row.result.profitPerHour;
    case 'additional-cost':
      return row.result.additionalPurchaseCost;
    case 'station':
      return row.craft.level;
    default:
      return null;
  }
}

export function craftMeetsStationLevel(
  craft: CraftDeal,
  stationLevels: Record<string, number>,
): boolean {
  const have = stationLevels[craft.station.id];
  if (have === undefined) return true;
  const level = finiteNonNegative(have);
  if (level === null) return true;
  return level >= craft.level;
}

export function isCraftPriceMode(value: unknown): value is WatchPriceType {
  return isWatchPriceType(value);
}

/** Re-export for attribute audits without pulling UI. */
export { isReturnedCraftTool };
