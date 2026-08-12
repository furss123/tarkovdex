import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getBoardData } from '@/lib/dashboard';
import { ADSENSE_SLOT_MAIN } from '@/lib/ads';
import { AdSlot } from '@/components/ads/AdSlot';
import { LiveBoards } from '@/components/boards/LiveBoards';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/** Same first-paint window as the dashboard — the live poll takes over once
 * the page is in the browser. See the home page for the full reasoning. */
export const revalidate = 600;

/** Load-bearing: `fetchTarkovJson` uses `cache: 'no-store'`, which without
 * this export opts the whole route into dynamic rendering and stops it being
 * prerendered at all. See the note on the home page. */
export const dynamic = 'force-static';

export async function generateMetadata({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'hideout', path: '/hideout' });
}

/**
 * The hideout craft board, in full: the single most profitable craft at every
 * station, ranked, plus the dated-price group the home summary deliberately
 * omits.
 *
 * This is the same board the home page shows a top-six slice of — the
 * projection happens server-side in `lib/dashboard.ts`, so the two can never
 * disagree about a number. What is different here is completeness, which is
 * the reason this page exists separately: a visitor searching for a specific
 * station's craft needs to find that station, not the six that happened to
 * rank highest today.
 */
export default async function HideoutPage({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('hideout');
  const board = await getBoardData(locale, 'hideout');

  return (
    <section className="mx-auto max-w-content px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="text-lg font-medium text-fg">{t('title')}</h1>
      <p className="mt-1 max-w-3xl text-xs text-muted">{t('description')}</p>

      <div className="mt-6">
        <LiveBoards
          initialData={board}
          locale={locale}
          slot={<AdSlot slot={ADSENSE_SLOT_MAIN} label={t('adRegionLabel')} />}
        />
      </div>
    </section>
  );
}
