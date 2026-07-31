import type { GameMode, Item, MarketItem, MarketItemsResponse } from '@/types/tarkov';

/**
 * Shared filter/sort/paginate logic for the flea market item list — used by
 * both `/api/items` (client fetch/pagination) and the items page's initial
 * server render, so the two never drift into computing "the first page" two
 * different ways. Takes the already-fetched, already-translated `Item[]` from
 * `getItems()`; callers own fetching that.
 */

export const MARKET_ITEMS_PAGE_SIZE = 50;

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
  return Number.isFinite(timestamp)
    ? Math.max(0, Math.round(((now - timestamp) / 3_600_000) * 10) / 10)
    : null;
}

function toMarketItem(item: Item, feeRate: number, now: number): MarketItem {
  const slotCount = Math.max(1, item.width * item.height);
  const estimatedFleaNet =
    item.avg24hPrice == null
      ? null
      : Math.max(0, Math.round(item.avg24hPrice * (1 - feeRate / 100)));
  const trader = item.bestVendorSellRUB;
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

  const marketItems = items
    .map((item) => toMarketItem(item, feeRate, now))
    .filter((item) => {
      if (item.referenceValue == null) return false;
      if (
        query &&
        !item.name.toLocaleLowerCase(locale).includes(query) &&
        !item.shortName.toLocaleLowerCase(locale).includes(query)
      ) {
        return false;
      }
      if (sale === 'flea' && item.avg24hPrice == null) return false;
      if (sale === 'trader' && item.avg24hPrice != null) return false;
      if (category !== 'all' && !item.types.includes(category)) return false;
      return true;
    });

  marketItems.sort((a, b) => {
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
    return direction === 'asc' ? comparison : -comparison;
  });

  const start = (page - 1) * pageSize;
  const pagedItems = marketItems.slice(start, start + pageSize);
  const latestTimestamp = items.reduce((latest, item) => {
    const timestamp = item.updated ? Date.parse(item.updated) : Number.NaN;
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);

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
      feeRate,
    },
  };
}
