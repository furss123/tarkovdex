import { CRAFT_FRESHNESS, contentFreshness } from '@/lib/data-status';
import type {
  CraftPartAttributes,
  CraftDeal,
  CraftProfitLeader,
  ExchangePart,
  PriceOption,
  PriceStrategy,
} from '@/types/tools';

/**
 * Return-tool classification at the API boundary.
 *
 * json.tarkov.dev currently sends `{tool: true}`. Its GraphQL-compatible
 * ItemAttribute representation uses the exact `tool/tool/true` tuple. Values
 * are intentionally case-sensitive and strict so malformed strings, numbers,
 * unrelated attributes, or a tool-looking item name are never guessed.
 */
export function isReturnedCraftTool(attributes: CraftPartAttributes): boolean {
  if (Array.isArray(attributes)) {
    return attributes.some(
      (attribute) =>
        attribute?.type === 'tool' &&
        attribute.name === 'tool' &&
        (attribute.value === true || attribute.value === 'true'),
    );
  }
  return attributes?.tool === true;
}

export function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function finitePositive(value: unknown): number | null {
  const number = finiteNonNegative(value);
  return number !== null && number > 0 ? number : null;
}

function finitePrice(value: unknown): number | null {
  return finitePositive(value);
}

export function selectPurchasePrice(
  price: PriceOption,
  strategy: PriceStrategy,
): number | null {
  const flea = finitePrice(price.flea);
  const trader = finitePrice(price.traderBuy);
  if (strategy === 'flea') return flea;
  if (strategy === 'trader') return trader;
  if (flea === null) return trader;
  if (trader === null) return flea;
  return Math.min(flea, trader);
}

export type SalePriceSource = 'flea' | 'trader';

export function selectSalePrice(
  price: PriceOption,
): { value: number; source: SalePriceSource } | null {
  const flea = finitePrice(price.flea);
  const trader = finitePrice(price.traderSell);
  if (flea === null && trader === null) return null;
  if (trader !== null && (flea === null || trader > flea)) {
    return { value: trader, source: 'trader' };
  }
  return { value: flea as number, source: 'flea' };
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
    if (count === null || count <= 0 || unit === null) {
      missing.push(part.item.name);
      continue;
    }
    total += count * unit;
  }
  return { total: missing.length ? null : total, missing };
}

export function calculateCraftProfit(
  craft: CraftDeal,
  strategy: PriceStrategy,
  hourlyOperatingCost: number,
): ProfitResult & { hourlyProfit: number | null; tools: string[] } {
  const inputs = totalParts(craft.requiredItems, strategy, true);
  const unresolvedQuestRequirements = craft.unresolvedQuestRequirements ?? [];
  const outputs = craft.productItems?.length
    ? craft.productItems
    : [craft.productItem];
  let outputGrossValue = 0;
  const missingOutputs: string[] = [];
  for (const output of outputs) {
    const outputCount = finiteNonNegative(output.count);
    const outputPrice = selectSalePrice(output.item.price);
    if (outputCount === null || outputCount <= 0 || outputPrice === null) {
      missingOutputs.push(output.item.name);
      continue;
    }
    outputGrossValue += outputCount * outputPrice.value;
  }
  const outputGross = missingOutputs.length ? null : outputGrossValue;
  const duration = finiteNonNegative(craft.duration);
  const operatingRate = finiteNonNegative(hourlyOperatingCost);
  const operating =
    duration !== null && operatingRate !== null
      ? (operatingRate * duration) / 3600
      : null;
  const profit =
    inputs.total !== null &&
    outputGross !== null &&
    operating !== null &&
    unresolvedQuestRequirements.length === 0
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
      ...missingOutputs,
      ...unresolvedQuestRequirements.map((id) => `quest:${id}`),
    ],
    tools: [
      ...new Set(
        craft.requiredItems.filter((part) => part.tool).map((part) => part.item.name),
      ),
    ],
  };
}

function priceSignalCount(parts: ExchangePart[], output: boolean): number {
  return parts.reduce((total, part) => {
    const prices = output
      ? [part.item.price.flea, part.item.price.traderSell]
      : [part.item.price.flea, part.item.price.traderBuy];
    return total + prices.filter((price) => finitePrice(price) !== null).length;
  }, 0);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

type RankedCraft = {
  craft: CraftDeal;
  result: ReturnType<typeof calculateCraftProfit> & {
    inputCost: number;
    outputGross: number;
    profit: number;
  };
  stability: number;
};

function rankCrafts(a: RankedCraft, b: RankedCraft): number {
  const hourlyA = a.result.hourlyProfit ?? Number.NEGATIVE_INFINITY;
  const hourlyB = b.result.hourlyProfit ?? Number.NEGATIVE_INFINITY;
  const durationA = a.craft.duration > 0 ? a.craft.duration : Number.POSITIVE_INFINITY;
  const durationB = b.craft.duration > 0 ? b.craft.duration : Number.POSITIVE_INFINITY;
  return (
    b.result.profit - a.result.profit ||
    hourlyB - hourlyA ||
    durationA - durationB ||
    b.stability - a.stability ||
    compareText(a.craft.id, b.craft.id)
  );
}

/** One deterministic leader per station. Invalid or explicitly inactive
 * recipes never enter the ranking; a station whose valid recipes all lose
 * money still keeps its least-negative leader. */
export function selectBestCraftsByStation(
  crafts: CraftDeal[],
  strategy: PriceStrategy = 'best',
  hourlyOperatingCost = 0,
): CraftProfitLeader[] {
  const bestByStation = new Map<string, RankedCraft>();

  for (const craft of crafts) {
    if (craft.active === false) continue;
    const result = calculateCraftProfit(craft, strategy, hourlyOperatingCost);
    if (
      result.inputCost === null ||
      result.outputGross === null ||
      result.profit === null
    ) continue;
    const outputs = craft.productItems?.length
      ? craft.productItems
      : [craft.productItem];
    const ranked: RankedCraft = {
      craft,
      result: {
        ...result,
        inputCost: result.inputCost,
        outputGross: result.outputGross,
        profit: result.profit,
      },
      stability:
        priceSignalCount(craft.requiredItems.filter((part) => !part.tool), false) +
        priceSignalCount(outputs, true),
    };
    const current = bestByStation.get(craft.station.id);
    if (!current || rankCrafts(ranked, current) < 0) {
      bestByStation.set(craft.station.id, ranked);
    }
  }

  return [...bestByStation.values()]
    .sort(
      (a, b) =>
        compareText(a.craft.station.name, b.craft.station.name) ||
        compareText(a.craft.station.id, b.craft.station.id),
    )
    .map(({ craft, result }) => ({
      craftId: craft.id,
      station: {
        id: craft.station.id,
        name: craft.station.name,
        imageLink: craft.station.imageLink ?? null,
      },
      level: craft.level,
      duration: craft.duration,
      product: {
        id: craft.productItem.item.id,
        name: craft.productItem.item.name,
        iconLink: craft.productItem.item.iconLink,
        count: craft.productItem.count,
      },
      inputCost: result.inputCost,
      outputValue: result.outputGross,
      profit: result.profit,
      hourlyProfit: result.hourlyProfit,
      priceUpdatedAt: oldestPriceUpdatedAt(craft),
    }));
}

/**
 * The oldest upstream price stamp the craft's profit actually rests on: every
 * non-tool input plus every output. Tools are excluded because they are
 * returned and never enter the cost.
 *
 * Null whenever a contributor carries no stamp — an unstamped price is not a
 * recent one, and pretending otherwise is what let a 243-day-old Bitcoin Farm
 * output rank as a current figure.
 */
function oldestPriceUpdatedAt(craft: CraftDeal): string | null {
  const outputs = craft.productItems?.length
    ? craft.productItems
    : [craft.productItem];
  const contributors = [
    ...craft.requiredItems.filter((part) => !part.tool),
    ...outputs,
  ];
  let oldest: { value: string; time: number } | null = null;
  for (const part of contributors) {
    const stamp = part.item.price.updated;
    if (!stamp) return null;
    const time = Date.parse(stamp);
    if (!Number.isFinite(time)) return null;
    if (!oldest || time < oldest.time) oldest = { value: stamp, time };
  }
  return oldest?.value ?? null;
}

/**
 * Split leaders into what may be presented as a current ranking and what may
 * only be shown as dated reference.
 *
 * Uses the `crafts` domain's already-registered thresholds (the same 12h/24h
 * the flea market applies) via `contentFreshness()` — no new policy. `unknown`
 * lands in `stale` on purpose: an age we cannot establish must not be sold as
 * a current one.
 */
export function partitionCraftLeadersByFreshness(
  leaders: CraftProfitLeader[],
  now: number,
): { current: CraftProfitLeader[]; stale: CraftProfitLeader[] } {
  const current: CraftProfitLeader[] = [];
  const stale: CraftProfitLeader[] = [];
  for (const leader of leaders) {
    const freshness = contentFreshness({
      sourceUpdatedAt: leader.priceUpdatedAt,
      warningAfterMs: CRAFT_FRESHNESS.warningAfterMs,
      staleAfterMs: CRAFT_FRESHNESS.staleAfterMs,
      now,
    });
    (freshness === 'fresh' || freshness === 'warning' ? current : stale).push(
      leader,
    );
  }
  return { current, stale };
}
