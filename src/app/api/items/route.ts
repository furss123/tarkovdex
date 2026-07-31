import { NextResponse } from 'next/server';
import { getItems } from '@/lib/tarkov';
import { isValidLocale } from '@/i18n/routing';
import type {
  GameMode,
  Item,
  MarketItem,
  MarketItemsResponse,
} from '@/types/tarkov';

const PAGE_SIZE = 50;
const VALID_MODES = new Set<GameMode>(['regular', 'pve']);
const VALID_SORTS = new Set([
  'valuePerSlot',
  'referenceValue',
  'change',
  'name',
  'freshness',
]);
const VALID_SALE_FILTERS = new Set(['all', 'flea', 'trader']);
const VALID_CATEGORIES = new Set([
  'all',
  'barter',
  'ammo',
  'gun',
  'armor',
  'provisions',
  'meds',
  'keys',
]);

function numberParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLocale = searchParams.get('locale') ?? 'ko';
  const locale = isValidLocale(rawLocale) ? rawLocale : 'ko';
  const rawMode = searchParams.get('mode') as GameMode | null;
  const gameMode = rawMode && VALID_MODES.has(rawMode) ? rawMode : 'regular';
  const query = (searchParams.get('q') ?? '').trim().toLocaleLowerCase(locale);
  const rawSort = searchParams.get('sort') ?? 'valuePerSlot';
  const sort = VALID_SORTS.has(rawSort) ? rawSort : 'valuePerSlot';
  const rawSale = searchParams.get('sale') ?? 'all';
  const sale = VALID_SALE_FILTERS.has(rawSale) ? rawSale : 'all';
  const rawCategory = searchParams.get('category') ?? 'all';
  const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'all';
  const direction = searchParams.get('direction') === 'asc' ? 'asc' : 'desc';
  const page = numberParam(searchParams.get('page'), 1, 1, 200);
  const feeRate = numberParam(searchParams.get('feeRate'), 5, 0, 25);
  const now = Date.now();

  try {
    const items = await getItems({ locale, gameMode });
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

    const start = (page - 1) * PAGE_SIZE;
    const pagedItems = marketItems.slice(start, start + PAGE_SIZE);
    const latestTimestamp = items.reduce((latest, item) => {
      const timestamp = item.updated ? Date.parse(item.updated) : Number.NaN;
      return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
    }, 0);

    const response: MarketItemsResponse = {
      items: pagedItems,
      total: marketItems.length,
      page,
      pageSize: PAGE_SIZE,
      hasMore: start + PAGE_SIZE < marketItems.length,
      meta: {
        source: 'json.tarkov.dev',
        sourceUpdatedAt: latestTimestamp ? new Date(latestTimestamp).toISOString() : null,
        generatedAt: new Date(now).toISOString(),
        gameMode,
        feeRate,
      },
    };
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to load market data.' },
      { status: 503 },
    );
  }
}
