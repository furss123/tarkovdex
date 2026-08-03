import { NextResponse } from 'next/server';
import { getItems } from '@/lib/tarkov';
import { isValidLocale } from '@/i18n/routing';
import { marketItemsByIds, queryMarketItems } from '@/lib/market-items-query';
import { domainHealth } from '@/lib/data-observations';
import type { GameMode } from '@/types/tarkov';

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
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, Math.floor(parsed)))
    : fallback;
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

  try {
    const items = await getItems({ locale, gameMode });

    // Resolves a bounded set of item ids. Default: name/icon for quest
    // requirement labels. `detail=market` returns MarketItem rows for the
    // watchlist batch path (same feeRate as the flea page).
    const idsParam = searchParams.get('ids');
    if (idsParam !== null) {
      const ids = idsParam
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 1000);
      if (searchParams.get('detail') === 'market') {
        const found = marketItemsByIds(items, ids, feeRate);
        const { delivery } = domainHealth({
          domain: 'itemPrices',
          gameMode,
          locale,
          availability: 'available',
          sourceUpdatedAt: found.reduce<string | null>((latest, item) => {
            if (!item.updated) return latest;
            if (!latest) return item.updated;
            return Date.parse(item.updated) > Date.parse(latest) ? item.updated : latest;
          }, null),
        });
        return NextResponse.json(
          {
            items: found,
            meta: {
              gameMode,
              feeRate,
              delivery,
              generatedAt: new Date().toISOString(),
              requested: ids.length,
              found: found.length,
            },
          },
          { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } },
        );
      }
      const wanted = new Set(ids);
      const found = items
        .filter((item) => wanted.has(item.id))
        .map(({ id, name, shortName, iconLink }) => ({ id, name, shortName, iconLink }));
      return NextResponse.json(
        { items: found },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } },
      );
    }

    const base = queryMarketItems(items, gameMode, {
      query,
      locale,
      sort,
      sale,
      category,
      direction,
      page,
      feeRate,
    });
    const { delivery } = domainHealth({
      domain: 'itemPrices',
      gameMode,
      locale,
      availability: 'available',
      sourceUpdatedAt: base.meta.sourceUpdatedAt,
    });
    const response = { ...base, meta: { ...base.meta, delivery } };
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
