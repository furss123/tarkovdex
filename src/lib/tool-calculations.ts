import type {
  BarterDeal,
  CraftDeal,
  PriceOption,
  PriceStrategy,
} from '@/types/tools';

export function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function selectPurchasePrice(
  price: PriceOption,
  strategy: PriceStrategy,
): number | null {
  const flea = finiteNonNegative(price.flea);
  const trader = finiteNonNegative(price.traderBuy);
  if (strategy === 'flea') return flea;
  if (strategy === 'trader') return trader;
  if (flea === null) return trader;
  if (trader === null) return flea;
  return Math.min(flea, trader);
}

export interface ProfitResult {
  inputCost: number | null;
  outputGross: number | null;
  outputNet: number | null;
  profit: number | null;
  roi: number | null;
  missing: string[];
}

function totalParts(
  parts: Array<{ item: { name: string; price: PriceOption }; count: number; tool?: boolean }>,
  strategy: PriceStrategy,
  excludeTools: boolean,
): { total: number | null; missing: string[] } {
  let total = 0;
  const missing: string[] = [];
  for (const part of parts) {
    if (excludeTools && part.tool) continue;
    const count = finiteNonNegative(part.count);
    const unit = selectPurchasePrice(part.item.price, strategy);
    if (count === null || unit === null) {
      missing.push(part.item.name);
      continue;
    }
    total += count * unit;
  }
  return { total: missing.length ? null : total, missing };
}

export function calculateBarterProfit(
  barter: BarterDeal,
  strategy: PriceStrategy,
  fleaFeeRate: number,
): ProfitResult {
  const inputs = totalParts(barter.requiredItems, strategy, false);
  const outputCount = finiteNonNegative(barter.offeredItem.count);
  const flea = finiteNonNegative(barter.offeredItem.item.price.flea);
  const vendor = finiteNonNegative(barter.offeredItem.item.price.traderSell);
  const outputUnit = flea ?? vendor;
  const outputGross =
    outputCount !== null && outputUnit !== null ? outputCount * outputUnit : null;
  const safeFee = Math.min(1, Math.max(0, finiteNonNegative(fleaFeeRate) ?? 0));
  const outputNet =
    outputGross === null ? null : flea !== null ? outputGross * (1 - safeFee) : outputGross;
  const profit =
    inputs.total !== null && outputNet !== null ? outputNet - inputs.total : null;
  return {
    inputCost: inputs.total,
    outputGross,
    outputNet,
    profit,
    roi: profit !== null && inputs.total !== null && inputs.total > 0
      ? profit / inputs.total
      : null,
    missing: [
      ...inputs.missing,
      ...(outputGross === null ? [barter.offeredItem.item.name] : []),
    ],
  };
}

export function calculateCraftProfit(
  craft: CraftDeal,
  strategy: PriceStrategy,
  hourlyOperatingCost: number,
): ProfitResult & { hourlyProfit: number | null; tools: string[] } {
  const inputs = totalParts(craft.requiredItems, strategy, true);
  const outputCount = finiteNonNegative(craft.productItem.count);
  const outputUnit =
    finiteNonNegative(craft.productItem.item.price.flea) ??
    finiteNonNegative(craft.productItem.item.price.traderSell);
  const outputGross =
    outputCount !== null && outputUnit !== null ? outputCount * outputUnit : null;
  const duration = finiteNonNegative(craft.duration);
  const operating =
    duration !== null
      ? (Math.max(0, finiteNonNegative(hourlyOperatingCost) ?? 0) * duration) / 3600
      : 0;
  const profit =
    inputs.total !== null && outputGross !== null
      ? outputGross - inputs.total - operating
      : null;
  return {
    inputCost: inputs.total,
    outputGross,
    outputNet: outputGross,
    profit,
    roi: profit !== null && inputs.total !== null && inputs.total > 0
      ? profit / inputs.total
      : null,
    hourlyProfit:
      profit !== null && duration !== null && duration > 0
        ? profit / (duration / 3600)
        : null,
    missing: [
      ...inputs.missing,
      ...(outputGross === null ? [craft.productItem.item.name] : []),
    ],
    tools: craft.requiredItems.filter((part) => part.tool).map((part) => part.item.name),
  };
}

export type PenetrationGrade = 'excellent' | 'good' | 'limited' | 'poor';

/**
 * A transparent relative grade, not a fabricated probability. Tarkov armor
 * durability and hidden/current-version formula details affect exact odds.
 */
export function penetrationGrade(
  penetrationPower: number | null,
  armorClass: number,
): PenetrationGrade {
  const power = finiteNonNegative(penetrationPower);
  if (power === null) return 'poor';
  const delta = power - armorClass * 10;
  if (delta >= 5) return 'excellent';
  if (delta >= 0) return 'good';
  if (delta >= -5) return 'limited';
  return 'poor';
}

export const ZONE_LABELS: Record<string, string> = {
  'Collider Type NeckFront': 'neckFront',
  'Collider Type NeckBack': 'neckBack',
  'Collider Type RibcageUp': 'upperChest',
  'Collider Type RibcageLow': 'lowerChest',
  'Collider Type SpineTop': 'upperBack',
  'Collider Type SpineDown': 'lowerBack',
  'Collider Type LeftSideChestDown': 'leftSide',
  'Collider Type RightSideChestDown': 'rightSide',
  'Collider Type Pelvis': 'pelvis',
  'Collider Type PelvisBack': 'pelvis',
  'Collider Type LeftUpperArm': 'leftArm',
  'Collider Type RightUpperArm': 'rightArm',
  'Armor Zone Plate_Granit_SAPI_chest': 'frontPlate',
  'Armor Zone Plate_Granit_SAPI_back': 'backPlate',
  'Armor Zone Plate_6B13_back': 'backPlate',
  'Armor Zone Plate_Korund_chest': 'frontPlate',
  'Armor Zone Plate_Granit_SSAPI_side_left_high': 'leftPlate',
  'Armor Zone Plate_Granit_SSAPI_side_left_low': 'leftPlate',
  'Armor Zone Plate_Granit_SSAPI_side_right_high': 'rightPlate',
  'Armor Zone Plate_Granit_SSAPI_side_right_low': 'rightPlate',
  'Armor Zone Plate_Korund_side_left_high': 'leftPlate',
  'Armor Zone Plate_Korund_side_left_low': 'leftPlate',
  'Armor Zone Plate_Korund_side_right_high': 'rightPlate',
  'Armor Zone Plate_Korund_side_right_low': 'rightPlate',
};

export function normalizeArmorZones(zones: string[]): {
  normalized: string[];
  unknown: string[];
} {
  const normalized = new Set<string>();
  const unknown = new Set<string>();
  for (const zone of zones) {
    const mapped = ZONE_LABELS[zone];
    if (mapped) normalized.add(mapped);
    else if (zone) unknown.add(zone);
  }
  return { normalized: [...normalized], unknown: [...unknown] };
}

export function compareCondition(
  actual: number,
  expected: number,
  method: string,
): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  switch (method) {
    case '>':
      return actual > expected;
    case '>=':
      return actual >= expected;
    case '<':
      return actual < expected;
    case '<=':
      return actual <= expected;
    case '=':
    case '==':
      return actual === expected;
    default:
      return false;
  }
}
