import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getMaps, getTraders } from '@/lib/tarkov';
import type { GameMap, TaskTrader } from '@/types/tarkov';
import { InGameClock } from '@/components/home/InGameClock';
import { TraderRestockBoard } from '@/components/home/TraderRestockBoard';
import { BossSpawnBoard } from '@/components/home/BossSpawnBoard';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'home' });
}

/**
 * The dashboard widgets (raid clock, trader restocks, boss spawn rates) sit
 * above the fold — see CLAUDE.md > "Home page dashboard" for the
 * section-ordering rationale (most actionable info first). Traders and maps
 * are both fetched for **both** PvP and PvE
 * (restock times and boss compositions genuinely differ between modes —
 * see CLAUDE.md > "Global PvP/PvE mode"); the widgets themselves read the
 * site-wide mode selection via `useGameMode()` rather than this page picking
 * one, so switching in the Header updates every widget with no refetch.
 */
export default async function HomePage({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('home');

  let pvpTraders: TaskTrader[] = [];
  let pveTraders: TaskTrader[] = [];
  let pvpMaps: GameMap[] = [];
  let pveMaps: GameMap[] = [];
  try {
    const [pvpTradersById, pveTradersById, pvpMapsList, pveMapsList] = await Promise.all([
      getTraders(locale, 'regular'),
      getTraders(locale, 'pve'),
      getMaps({ locale, gameMode: 'regular' }),
      getMaps({ locale, gameMode: 'pve' }),
    ]);
    // Keep service/quest-only characters available to the tasks data layer,
    // but omit them from this stock-restock UI because they sell no items.
    pvpTraders = Object.values(pvpTradersById).filter((trader) => trader.hasStore);
    pveTraders = Object.values(pveTradersById).filter((trader) => trader.hasStore);
    pvpMaps = pvpMapsList;
    pveMaps = pveMapsList;
  } catch {
    // Data-backed widgets are supplementary — on failure just hide them.
    // The client-only raid clock remains available.
  }

  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-10 space-y-2">
        <h1 className="text-2xl font-medium text-fg sm:text-3xl">{t('title')}</h1>
        <p className="text-sm text-muted sm:text-base">{t('subtitle')}</p>
      </div>

      <div className="space-y-10">
        <InGameClock />
        {pvpTraders.length > 0 || pveTraders.length > 0 ? (
          <TraderRestockBoard pvpTraders={pvpTraders} pveTraders={pveTraders} />
        ) : null}
        {pvpMaps.length > 0 || pveMaps.length > 0 ? (
          <BossSpawnBoard pvpMaps={pvpMaps} pveMaps={pveMaps} locale={locale} />
        ) : null}
      </div>
    </section>
  );
}
