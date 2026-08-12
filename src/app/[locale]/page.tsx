import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { SITE_URL } from '@/lib/site';
import { serializeJsonLd } from '@/lib/json-ld';
import { getBoardData } from '@/lib/dashboard';
import { ADSENSE_SLOT_MAIN } from '@/lib/ads';
import { AdSlot } from '@/components/ads/AdSlot';
import { InGameClock } from '@/components/home/InGameClock';
import { LiveBoards } from '@/components/boards/LiveBoards';
import { SupportCallout } from '@/components/home/SupportCallout';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * ISR window for the *first paint only*. Once the page is in the browser the
 * live poll in `useLiveDashboard` takes over and talks to `/api/dashboard`
 * directly, so this number governs how stale a cold visitor's first frame can
 * be, not how current the board stays. Ten minutes keeps the served HTML
 * roughly in step with json.tarkov.dev's own price cadence without rebuilding
 * on every request.
 */
export const revalidate = 600;

/**
 * `force-static` is load-bearing, not decoration. `fetchTarkovJson` issues its
 * upstream requests with `cache: 'no-store'` (the documents are far past Next's
 * 2MB Data Cache limit, so it keeps its own per-runtime promise cache instead).
 * Without this export, that single option opts the whole route into dynamic
 * rendering — verified: the build stopped emitting `ko/index.html` entirely and
 * every visitor paid a full server render. With it, the route prerenders and
 * regenerates on the window above, which is what the client poll is layered on
 * top of.
 */
export const dynamic = 'force-static';

export async function generateMetadata({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'home' });
}

/**
 * The dashboard.
 *
 * Three things, ordered by how fast they change: the raid clock (continuous,
 * client-side, no data dependency), then the most profitable hideout crafts
 * and the popular maps' boss spawn rates (both live-refreshed together from
 * one payload).
 *
 * The two data sections are summaries, not copies: the craft board shows the
 * six best crafts across all stations, the boss board the nine mainline maps.
 * The per-station board and the complete map list live on `/hideout` and
 * `/bosses`, which each link from their section heading. Splitting them that
 * way is what lets those pages carry a full answer for a search query while
 * the home page stays a glance.
 *
 * The data is fetched here for the first paint so the page is useful before
 * any JavaScript runs and crawlable without it, then handed to the client as
 * `initialData` — the poll replaces it wholesale rather than fetching a second
 * copy on mount.
 */
export default async function HomePage({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const board = await getBoardData(locale, 'home');

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'TarkovDex',
            url: `${SITE_URL}/${locale}`,
            inLanguage: locale,
          }),
        }}
      />
      <section className="mx-auto max-w-content px-4 py-4 sm:px-6 sm:py-6">
        <h1 className="sr-only">{t('title')}</h1>
        <div className="space-y-8 sm:space-y-10">
          <InGameClock />
          <LiveBoards
            initialData={board}
            locale={locale}
            craftHref="/hideout"
            bossHref="/bosses"
            slot={
              <AdSlot slot={ADSENSE_SLOT_MAIN} label={t('adRegionLabel')} />
            }
          />
          <SupportCallout />
        </div>
      </section>
    </>
  );
}
