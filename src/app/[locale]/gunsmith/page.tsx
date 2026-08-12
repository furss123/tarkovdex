import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getGunsmithTasks } from '@/lib/tarkov-tools';
import { GAME_MODES, type GameMode } from '@/types/tarkov';
import type { GunsmithTask } from '@/types/tools';
import { ADSENSE_SLOT_MAIN } from '@/lib/ads';
import { AdSlot } from '@/components/ads/AdSlot';
import { GunsmithExplorer } from '@/components/gunsmith/GunsmithExplorer';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Six hours, not the dashboard's ten minutes. A solved build changes when the
 * shipped snapshot is regenerated or when a patch moves a quest's trader/level
 * gate — neither is a minute-to-minute event, and there is no price on this
 * page for a shorter window to keep current. This page therefore does not
 * poll at all: adding a live refresh here would spend requests redrawing
 * identical parts lists.
 */
export const revalidate = 21600;

/** Load-bearing — see the note on the home page. */
export const dynamic = 'force-static';

export async function generateMetadata({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'gunsmith', path: '/gunsmith' });
}

/**
 * Gunsmith build guide.
 *
 * All three game modes are resolved here so the Header's mode switch is a
 * re-render rather than a refetch, and each is settled independently: a mode
 * whose upstream documents fail must not take down the two that loaded. The
 * seasonal mode costs nothing extra when it has no solved builds —
 * `getGunsmithTasks` returns early before issuing a single request.
 */
export default async function GunsmithPage({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('gunsmith');

  const settled = await Promise.allSettled(
    GAME_MODES.map((gameMode) => getGunsmithTasks(locale, gameMode)),
  );
  const tasksByMode = Object.fromEntries(
    GAME_MODES.map((gameMode, index) => {
      const result = settled[index];
      return [gameMode, result.status === 'fulfilled' ? result.value : null];
    }),
  ) as Record<GameMode, GunsmithTask[] | null>;

  return (
    <section className="mx-auto max-w-content px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="text-lg font-medium text-fg">{t('title')}</h1>
      <p className="mt-1 max-w-3xl text-xs text-muted">{t('description')}</p>

      <div className="mt-6">
        <GunsmithExplorer tasksByMode={tasksByMode} />
      </div>

      <div className="mt-8">
        <AdSlot slot={ADSENSE_SLOT_MAIN} label={t('adRegionLabel')} />
      </div>
    </section>
  );
}
