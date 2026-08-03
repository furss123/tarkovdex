/**
 * Pure beginner-mode filters. Deterministic, no I/O, no invented stats.
 * Every returned row carries at least one human-readable reason string key
 * (message key fragment) plus numeric facts for UI formatting.
 */

import type { MarketItem } from '@/types/tarkov';
import type { AmmoRound, ArmorItem } from '@/types/tools';
import { MARKET_PRICE_STALE_HOURS } from '@/lib/market-items-query';
import { penetrationGrade } from '@/lib/tool-calculations';
import type { RequiredItemLine } from '@/lib/quest-requirements';

export type BeginnerQuestionId =
  | 'ammo-for-armor-class'
  | 'gear-within-budget'
  | 'level-15-gear'
  | 'quest-keep-items'
  | 'high-value-per-slot'
  | 'light-affordable-armor';

export type BeginnerSupportLevel = 'supported' | 'partially-supported' | 'unsupported';

export const BEGINNER_QUESTION_SUPPORT: Record<
  BeginnerQuestionId,
  { support: BeginnerSupportLevel; reasonKey: string }
> = {
  'ammo-for-armor-class': {
    support: 'supported',
    reasonKey: 'support.ammoForClass',
  },
  'gear-within-budget': {
    support: 'partially-supported',
    reasonKey: 'support.gearBudget',
  },
  'level-15-gear': {
    support: 'unsupported',
    reasonKey: 'support.level15',
  },
  'quest-keep-items': {
    support: 'supported',
    reasonKey: 'support.questKeep',
  },
  'high-value-per-slot': {
    support: 'supported',
    reasonKey: 'support.valuePerSlot',
  },
  'light-affordable-armor': {
    support: 'partially-supported',
    reasonKey: 'support.lightArmor',
  },
};

export interface BeginnerReason {
  /** Stable id for tests / i18n lookup under beginner.reasons.* */
  id: string;
  values?: Record<string, string | number | boolean | null>;
}

export interface BeginnerResultBase {
  id: string;
  reasons: BeginnerReason[];
}

export interface AmmoForClassResult extends BeginnerResultBase {
  ammo: AmmoRound;
  grade: ReturnType<typeof penetrationGrade>;
}

export function filterAmmoForArmorClass(input: {
  ammo: AmmoRound[];
  armorClass: number;
  caliber?: string;
  maxPrice?: number | null;
  pricesById?: Map<string, number | null>;
  limit?: number;
}): AmmoForClassResult[] {
  const armorClass = Math.min(6, Math.max(1, Math.floor(input.armorClass)));
  const limit = input.limit ?? 20;
  const caliber = input.caliber?.trim();
  const results: AmmoForClassResult[] = [];

  for (const ammo of input.ammo) {
    if (caliber && ammo.caliber !== caliber) continue;
    if (ammo.penetrationPower == null || !Number.isFinite(ammo.penetrationPower)) continue;
    const grade = penetrationGrade(ammo.penetrationPower, armorClass);
    // Prefer rounds graded limited/good/excellent against the class —
    // never claim first-shot penetration probability.
    if (grade === 'poor') continue;

    const price = input.pricesById?.get(ammo.id) ?? null;
    if (input.maxPrice != null && (price == null || price > input.maxPrice)) continue;

    const reasons: BeginnerReason[] = [
      { id: 'penMeetsClass', values: { pen: ammo.penetrationPower, armorClass, grade } },
    ];
    if (ammo.damage != null) {
      reasons.push({ id: 'damageListed', values: { damage: ammo.damage } });
    }
    if (price != null) {
      reasons.push({ id: 'priceWithinBudget', values: { price } });
    }
    results.push({ id: ammo.id, ammo, grade, reasons });
  }

  results.sort((a, b) => {
    const penDiff = (b.ammo.penetrationPower ?? 0) - (a.ammo.penetrationPower ?? 0);
    if (penDiff !== 0) return penDiff;
    return a.ammo.name.localeCompare(b.ammo.name);
  });
  return results.slice(0, limit);
}

const BUDGET_GEAR_TYPES = new Set(['armor', 'headphones', 'backpack', 'rig']);

export interface GearBudgetResult extends BeginnerResultBase {
  item: MarketItem;
}

export function filterGearWithinBudget(input: {
  items: MarketItem[];
  maxBudget: number;
  categories?: string[];
  maxWeight?: number | null;
  weightById?: Map<string, number | null>;
  includeStale?: boolean;
  limit?: number;
}): GearBudgetResult[] {
  const maxBudget = input.maxBudget;
  if (!Number.isFinite(maxBudget) || maxBudget < 0) return [];
  const limit = input.limit ?? 30;
  const categories = input.categories?.length
    ? new Set(input.categories)
    : BUDGET_GEAR_TYPES;

  const results: GearBudgetResult[] = [];
  for (const item of input.items) {
    const price = item.referenceValue;
    if (price == null || price > maxBudget) continue;
    const matchesType = item.types.some((type) => categories.has(type));
    if (!matchesType) continue;
    if (!input.includeStale && item.freshnessHours != null && item.freshnessHours > MARKET_PRICE_STALE_HOURS) {
      continue;
    }
    const weight = input.weightById?.get(item.id) ?? null;
    if (input.maxWeight != null && (weight == null || weight > input.maxWeight)) continue;

    const reasons: BeginnerReason[] = [
      { id: 'priceWithinBudget', values: { price, maxBudget } },
      { id: 'categoryMatch', values: { category: item.types.find((t) => categories.has(t)) ?? item.types[0] ?? '' } },
    ];
    if (weight != null) reasons.push({ id: 'weightListed', values: { weight } });
    results.push({ id: item.id, item, reasons });
  }

  results.sort((a, b) => (a.item.referenceValue ?? 0) - (b.item.referenceValue ?? 0) || a.item.name.localeCompare(b.item.name));
  return results.slice(0, limit);
}

export interface QuestKeepResult extends BeginnerResultBase {
  requirement: RequiredItemLine;
}

export function filterActiveQuestRequiredItems(input: {
  requirements: RequiredItemLine[];
  ownedCounts?: Record<string, number>;
  limit?: number;
}): QuestKeepResult[] {
  const limit = input.limit ?? 50;
  const owned = input.ownedCounts ?? {};
  return input.requirements.slice(0, limit).map((requirement) => {
    const ownedCount = owned[requirement.itemId] ?? 0;
    const shortfall = Math.max(0, requirement.totalRequired - ownedCount);
    return {
      id: requirement.itemId,
      requirement,
      reasons: [
        {
          id: 'neededByActiveQuest',
          values: {
            needed: requirement.totalRequired,
            owned: ownedCount,
            shortfall,
            foundInRaid: requirement.foundInRaid,
            questCount: requirement.questIds.length,
          },
        },
      ],
    };
  });
}

export interface ValuePerSlotResult extends BeginnerResultBase {
  item: MarketItem;
}

export function filterHighValuePerSlotItems(input: {
  items: MarketItem[];
  minPrice?: number | null;
  minValuePerSlot?: number | null;
  category?: string | null;
  includeStale?: boolean;
  limit?: number;
}): ValuePerSlotResult[] {
  const limit = input.limit ?? 30;
  const results: ValuePerSlotResult[] = [];
  for (const item of input.items) {
    if (item.valuePerSlot == null || item.referenceValue == null) continue;
    if (input.minPrice != null && item.referenceValue < input.minPrice) continue;
    if (input.minValuePerSlot != null && item.valuePerSlot < input.minValuePerSlot) continue;
    if (input.category && !item.types.includes(input.category)) continue;
    if (!input.includeStale && item.freshnessHours != null && item.freshnessHours > MARKET_PRICE_STALE_HOURS) {
      continue;
    }
    results.push({
      id: item.id,
      item,
      reasons: [
        {
          id: 'valuePerSlotMeets',
          values: {
            valuePerSlot: item.valuePerSlot,
            referenceValue: item.referenceValue,
            slots: item.slotCount,
            source: item.valueSource,
          },
        },
      ],
    });
  }
  results.sort(
    (a, b) =>
      (b.item.valuePerSlot ?? 0) - (a.item.valuePerSlot ?? 0) ||
      a.item.name.localeCompare(b.item.name),
  );
  return results.slice(0, limit);
}

export interface LightArmorResult extends BeginnerResultBase {
  armor: ArmorItem;
  price: number | null;
}

export function filterLightAffordableArmor(input: {
  armor: ArmorItem[];
  pricesById: Map<string, number | null>;
  maxPrice?: number | null;
  maxWeight?: number | null;
  minClass?: number | null;
  requiredArea?: string | null;
  limit?: number;
}): LightArmorResult[] {
  const limit = input.limit ?? 20;
  const results: LightArmorResult[] = [];
  for (const armor of input.armor) {
    const price = input.pricesById.get(armor.id) ?? null;
    if (input.maxPrice != null && (price == null || price > input.maxPrice)) continue;
    if (input.maxWeight != null && (armor.weight == null || armor.weight > input.maxWeight)) continue;
    const effectiveClass =
      armor.armorClass ??
      armor.softArmor.reduce<number | null>(
        (best, layer) =>
          layer.armorClass == null ? best : best == null ? layer.armorClass : Math.max(best, layer.armorClass),
        null,
      );
    if (input.minClass != null && (effectiveClass == null || effectiveClass < input.minClass)) continue;
    if (input.requiredArea && !armor.normalizedZones.includes(input.requiredArea)) continue;

    const reasons: BeginnerReason[] = [];
    if (effectiveClass != null) reasons.push({ id: 'armorClassMeets', values: { armorClass: effectiveClass } });
    if (armor.weight != null) reasons.push({ id: 'weightWithin', values: { weight: armor.weight } });
    if (price != null) reasons.push({ id: 'priceWithinBudget', values: { price } });
    if (reasons.length === 0) continue;
    results.push({ id: armor.id, armor, price, reasons });
  }
  results.sort((a, b) => {
    const w = (a.armor.weight ?? 999) - (b.armor.weight ?? 999);
    if (w !== 0) return w;
    return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
  });
  return results.slice(0, limit);
}
