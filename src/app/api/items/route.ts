import { NextResponse } from 'next/server';
import { getItems } from '@/lib/tarkov';
import { isValidLocale } from '@/i18n/routing';
import { queryMarketItems } from '@/lib/market-items-query';
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
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
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
    const response = queryMarketItems(items, gameMode, {
      query,
      locale,
      sort,
      sale,
      category,
      direction,
      page,
      feeRate,
    });
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
