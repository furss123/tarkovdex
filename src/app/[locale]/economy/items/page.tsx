import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getItems } from '@/lib/tarkov';
import { queryMarketItems } from '@/lib/market-items-query';
import { ItemsExplorer } from '@/components/items/ItemsExplorer';
import type { MarketItemsResponse } from '@/types/tarkov';

type Props = { params: Promise<{ locale: string }> };
export const revalidate = 900;
export const dynamic = 'force-static';

export async function generateMetadata({ params }: Props) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'items', path: '/economy/items' });
}

export default async function ItemsPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);

  // Server-render the same default first page ItemsExplorer would otherwise
  // fetch client-side on mount (regular/PvP mode, no search/filters, default
  // sort) — see CLAUDE.md > "items — client-side search" for why the full
  // ~5000-item catalog itself must never be sent to the client. Only this one
  // already-paginated 50-item response is serialized.
  let initialResponse: MarketItemsResponse | null = null;
  try {
    const items = await getItems({ locale, gameMode: 'regular' });
    initialResponse = queryMarketItems(items, 'regular', {
      query: '',
      locale,
      sort: 'valuePerSlot',
      sale: 'all',
      category: 'all',
      direction: 'desc',
      page: 1,
      feeRate: 5,
    });
  } catch {
    // Initial SSR fetch is a progressive enhancement — ItemsExplorer's own
    // client fetch (and its existing error/retry UI) still runs if this fails.
  }

  return (
    <section className="mx-auto max-w-content px-4 py-[20px] sm:px-6 sm:py-[24px]">
      <ItemsExplorer locale={locale} initialResponse={initialResponse} />
    </section>
  );
}
