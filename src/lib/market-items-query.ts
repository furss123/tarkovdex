import type { GameMode, Item, MarketItem, MarketItemsResponse } from '@/types/tarkov';

/**
 * Shared filter/sort/paginate logic for the flea market item list — used by
 * both `/api/items` (client fetch/pagination) and the items page's initial
 * server render, so the two never drift into computing "the first page" two
 * different ways. Takes the already-fetched, already-translated `Item[]` from
 * `getItems()`; callers own fetching that.
 */

export const MARKET_ITEMS_PAGE_SIZE = 50;
export const MARKET_PRICE_STALE_HOURS = 24;
const FUTURE_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

export interface MarketItemsQueryOptions {
  /** Already trimmed + locale-lowercased. */
  query: string;
  locale: string;
  sort: string;
  sale: string;
  category: string;
  direction: 'asc' | 'desc';
  page: number;
  feeRate: number;
  pageSize?: number;
}

function freshnessHours(updated: string | null, now: number): number | null {
  if (!updated) return null;
  const timestamp = Date.parse(updated);
  if (!Number.isFinite(timestamp) || timestamp > now + FUTURE_TIMESTAMP_TOLERANCE_MS) {
    return null;
  }
  return Math.max(0, Math.round(((now - timestamp) / 3_600_000) * 10) / 10);
}

function positivePrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function normalizeFeeRate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : 0;
}

function freshnessRank(item: MarketItem): number {
  if (item.valueSource === 'trader') return 0;
  if (item.freshnessHours == null) return 2;
  return item.freshnessHours > MARKET_PRICE_STALE_HOURS ? 1 : 0;
}

export function toMarketItem(item: Item, feeRate: number, now: number = Date.now()): MarketItem {
  const slotCount = Math.max(1, item.width * item.height);
  const flea = positivePrice(item.avg24hPrice);
  const safeFeeRate = normalizeFeeRate(feeRate);
  const estimatedFleaNet =
    flea === null
      ? null
      : Math.max(0, Math.round(flea * (1 - safeFeeRate / 100)));
  const trader = positivePrice(item.bestVendorSellRUB);
  const referenceValue =
    estimatedFleaNet == null
      ? trader
      : trader == null
        ? estimatedFleaNet
        : Math.max(estimatedFleaNet, trader);
  const valueSource =
    referenceValue == null
      ? null
      : trader != null && trader >= (estimatedFleaNet ?? -1)
        ? 'trader'
        : 'flea';

  return {
    ...item,
    slotCount,
    estimatedFleaNet,
    referenceValue,
    valuePerSlot: referenceValue == null ? null : Math.round(referenceValue / slotCount),
    valueSource,
    freshnessHours: freshnessHours(item.updated, now),
  };
}

/** Resolve a capped id set to full `MarketItem` rows (watchlist batch path).
 * Missing ids are omitted — callers treat absence as orphan, not zero price. */
export function marketItemsByIds(
  items: Item[],
  ids: Iterable<string>,
  feeRate: number,
  now: number = Date.now(),
): MarketItem[] {
  const wanted = new Set(
    [...ids].map((id) => id.trim()).filter(Boolean).slice(0, 1000),
  );
  if (wanted.size === 0) return [];
  const appliedFeeRate = normalizeFeeRate(feeRate);
  return items
    .filter((item) => wanted.has(item.id))
    .map((item) => toMarketItem(item, appliedFeeRate, now));
}

export function queryMarketItems(
  items: Item[],
  gameMode: GameMode,
  options: MarketItemsQueryOptions,
  now: number = Date.now(),
): MarketItemsResponse {
  const {
    query,
    locale,
    sort,
    sale,
    category,
    direction,
    page,
    feeRate,
    pageSize = MARKET_ITEMS_PAGE_SIZE,
  } = options;
  const appliedFeeRate = normalizeFeeRate(feeRate);

  const marketItems = items
    .map((item) => toMarketItem(item, appliedFeeRate, now))
    .filter((item) => {
      if (item.referenceValue == null) return false;
      if (
        query &&
        !item.name.toLocaleLowerCase(locale).includes(query) &&
        !item.shortName.toLocaleLowerCase(locale).includes(query)
      ) {
        return false;
      }
      if (sale === 'flea' && positivePrice(item.avg24hPrice) === null) return false;
      if (sale === 'trader' && positivePrice(item.avg24hPrice) !== null) return false;
      if (category !== 'all' && !item.types.includes(category)) return false;
      return true;
    });

  marketItems.sort((a, b) => {
    // Price/change rankings keep unknown and stale signals behind current
    // observations, regardless of ascending/descending direction. The row is
    // still present with its freshness badge; it simply cannot masquerade as
    // a current top-value result.
    if (sort === 'valuePerSlot' || sort === 'referenceValue' || sort === 'change') {
      const freshnessComparison = freshnessRank(a) - freshnessRank(b);
      if (freshnessComparison !== 0) return freshnessComparison;
    }
    let comparison = 0;
    if (sort === 'name') comparison = a.name.localeCompare(b.name, locale);
    if (sort === 'valuePerSlot')
      comparison = (a.valuePerSlot ?? -1) - (b.valuePerSlot ?? -1);
    if (sort === 'referenceValue')
      comparison = (a.referenceValue ?? -1) - (b.referenceValue ?? -1);
    if (sort === 'change')
      comparison =
        (a.changeLast48hPercent ?? Number.NEGATIVE_INFINITY) -
        (b.changeLast48hPercent ?? Number.NEGATIVE_INFINITY);
    if (sort === 'freshness')
      comparison =
        (b.freshnessHours ?? Number.POSITIVE_INFINITY) -
        (a.freshnessHours ?? Number.POSITIVE_INFINITY);
    return (direction === 'asc' ? comparison : -comparison) || a.id.localeCompare(b.id);
  });

  const start = (page - 1) * pageSize;
  const pagedItems = marketItems.slice(start, start + pageSize);
  const latestTimestamp = items.reduce((latest, item) => {
    const timestamp = item.updated ? Date.parse(item.updated) : Number.NaN;
    return Number.isFinite(timestamp) && timestamp <= now + FUTURE_TIMESTAMP_TOLERANCE_MS
      ? Math.max(latest, timestamp)
      : latest;
  }, 0);

  // Per-row freshness already exists on every MarketItem; these are the same
  // signal counted over the matched set so the page can state "N of M rows are
  // older than a day" instead of leaving it to be discovered row by row.
  let staleCount = 0;
  let missingCount = 0;
  for (const item of marketItems) {
    if (item.freshnessHours == null) missingCount += 1;
    else if (item.freshnessHours > MARKET_PRICE_STALE_HOURS) staleCount += 1;
  }

  return {
    items: pagedItems,
    total: marketItems.length,
    page,
    pageSize,
    hasMore: start + pageSize < marketItems.length,
    meta: {
      source: 'json.tarkov.dev',
      sourceUpdatedAt: latestTimestamp ? new Date(latestTimestamp).toISOString() : null,
      generatedAt: new Date(now).toISOString(),
      gameMode,
      feeRate: appliedFeeRate,
      totalCount: marketItems.length,
      staleCount,
      missingCount,
      // Pure function: it cannot observe the fetch layer. The server caller
      // overwrites this from `domainHealth()`.
      delivery: 'unknown',
    },
  };
}
