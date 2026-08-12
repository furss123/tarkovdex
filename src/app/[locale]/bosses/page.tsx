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

/**
 * Boss tables are structural: they change with a patch or an event, not minute
 * to minute. The longer window matches how the data actually behaves, and the
 * poll still picks up a change within a minute of the server having it.
 */
export const revalidate = 3600;

/** Load-bearing — see the note on the home page. */
export const dynamic = 'force-static';

export async function generateMetadata({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'bosses', path: '/bosses' });
}

/**
 * Every map's boss spawn rates, not just the mainline nine the home page
 * summarises.
 *
 * Order is the curated popularity sequence first (so the maps most people are
 * looking for are at the top in every locale and every game mode), then the
 * remainder by highest spawn chance and name — decided server-side, so this
 * page renders whatever it is handed.
 */
export default async function BossesPage({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('bosses');
  const board = await getBoardData(locale, 'bosses');

  return (
    <section className="mx-auto max-w-content px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="text-lg font-medium text-fg">{t('title')}</h1>
      <p className="mt-1 max-w-3xl text-xs text-muted">{t('description')}</p>

      <div className="mt-6">
        <LiveBoards initialData={board} locale={locale} />
      </div>

      <div className="mt-8">
        <AdSlot slot={ADSENSE_SLOT_MAIN} label={t('adRegionLabel')} />
      </div>
    </section>
  );
}
