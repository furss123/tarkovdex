/**
 * Pure watchlist price arithmetic — no storage, no React.
 * Baselines are only compared to current prices of the *same* WatchPriceType.
 */

import type { MarketItem } from '@/types/tarkov';
import { MARKET_PRICE_STALE_HOURS } from '@/lib/market-items-query';

export type WatchPriceType = 'flea' | 'flea-net' | 'trader' | 'best-value';

export const WATCH_PRICE_TYPES: readonly WatchPriceType[] = [
  'flea',
  'flea-net',
  'trader',
  'best-value',
] as const;

export function isWatchPriceType(value: unknown): value is WatchPriceType {
  return (
    value === 'flea' ||
    value === 'flea-net' ||
    value === 'trader' ||
    value === 'best-value'
  );
}

export function priceForType(
  item: Pick<
    MarketItem,
    'avg24hPrice' | 'estimatedFleaNet' | 'bestVendorSellRUB' | 'referenceValue'
  >,
  priceType: WatchPriceType,
): number | null {
  switch (priceType) {
    case 'flea':
      return positivePrice(item.avg24hPrice);
    case 'flea-net':
      return positivePrice(item.estimatedFleaNet);
    case 'trader':
      return positivePrice(item.bestVendorSellRUB);
    case 'best-value':
      return positivePrice(item.referenceValue);
    default:
      return null;
  }
}

/** Prefer flea-net when flea exists, else trader, else best-value. */
export function defaultWatchPriceType(item: MarketItem): WatchPriceType {
  if (positivePrice(item.avg24hPrice) != null) return 'flea-net';
  if (positivePrice(item.bestVendorSellRUB) != null) return 'trader';
  return 'best-value';
}

function positivePrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function isSafeWatchPrice(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

export type WatchPriceDelta =
  | {
      kind: 'ok';
      absolute: number;
      percent: number | null;
      direction: 'up' | 'down' | 'flat';
    }
  | { kind: 'missing-baseline' }
  | { kind: 'missing-current' }
  | { kind: 'type-mismatch' }
  | { kind: 'baseline-zero' };

export function computeWatchPriceDelta(input: {
  baselinePrice: number | undefined;
  currentPrice: number | null | undefined;
  baselineType: WatchPriceType;
  currentType: WatchPriceType;
}): WatchPriceDelta {
  if (input.baselineType !== input.currentType) return { kind: 'type-mismatch' };
  if (input.baselinePrice == null || !isSafeWatchPrice(input.baselinePrice)) {
    return { kind: 'missing-baseline' };
  }
  if (input.currentPrice == null || !isSafeWatchPrice(input.currentPrice)) {
    return { kind: 'missing-current' };
  }
  if (input.baselinePrice === 0) return { kind: 'baseline-zero' };

  const absolute = input.currentPrice - input.baselinePrice;
  const percent = (absolute / input.baselinePrice) * 100;
  const direction = absolute > 0 ? 'up' : absolute < 0 ? 'down' : 'flat';
  return { kind: 'ok', absolute, percent, direction };
}

export function isWatchPriceStale(freshnessHours: number | null | undefined): boolean {
  return freshnessHours != null && freshnessHours > MARKET_PRICE_STALE_HOURS;
}

export function chunkIds(ids: string[], chunkSize: number): string[][] {
  const size = Math.max(1, Math.floor(chunkSize));
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    chunks.push(unique.slice(i, i + size));
  }
  return chunks;
}

/** Watchlist batch requests stay well under the API's 1000-id cap. */
export const WATCHLIST_FETCH_CHUNK = 100;
