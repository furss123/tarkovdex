import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { SITE_URL } from '@/lib/site';
import { serializeJsonLd } from '@/lib/json-ld';
import { getMaps, getTraders } from '@/lib/tarkov';
import { getEconomyDataset } from '@/lib/tarkov-tools';
import {
  partitionCraftLeadersByFreshness,
  selectBestCraftsByStation,
} from '@/lib/tool-calculations';
import { getLiveFeed } from '@/lib/live/feed';
import { isPublishable, latestPublicFeedEntries } from '@/lib/live/status';
import { selectHomepageOfficialEntries } from '@/lib/newsroom/newsroom-projection';
import { InGameClock } from '@/components/home/InGameClock';
import { LatestNewsBoard } from '@/components/home/LatestNewsBoard';
import { CraftProfitBoard } from '@/components/home/CraftProfitBoard';
import { TraderRestockBoard } from '@/components/home/TraderRestockBoard';
import { BossSpawnBoard } from '@/components/home/BossSpawnBoard';

type PageProps = {
  params: Promise<{ locale: string }>;
};

// The news board's public route refreshes on the same cadence. Price-backed
// Tarkov documents keep their own 15-minute runtime cache; structural maps,
// traders and hideout documents keep six hours in lib/tarkov.ts.
export const revalidate = 600;
export const dynamic = 'force-static';

async function optional<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'home' });
}

/**
 * The dashboard widgets are ordered from live time and news through economy,
 * trader and boss data. Traders, crafts and maps are fetched for both PvP and
 * PvE
 * (restock times and boss compositions genuinely differ between modes —
 * see CLAUDE.md > "Global PvP/PvE mode"); the widgets themselves read the
 * site-wide mode selection via `useGameMode()` rather than this page picking
 * one, so switching in the Header updates every widget with no refetch.
 */
export default async function HomePage({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('home');

  const [
    pvpTradersById,
    pveTradersById,
    pvpMaps,
    pveMaps,
    pvpEconomy,
    pveEconomy,
    liveFeed,
  ] = await Promise.all([
    optional(getTraders(locale, 'regular')),
    optional(getTraders(locale, 'pve')),
    optional(getMaps({ locale, gameMode: 'regular' })),
    optional(getMaps({ locale, gameMode: 'pve' })),
    optional(getEconomyDataset(locale, 'regular')),
    optional(getEconomyDataset(locale, 'pve')),
    optional(getLiveFeed(locale)),
  ]);

  // Keep service/quest-only characters available to the tasks data layer,
  // but omit them from this stock-restock UI because they sell no items.
  const pvpTraders = pvpTradersById
    ? Object.values(pvpTradersById).filter((trader) => trader.hasStore)
    : null;
  const pveTraders = pveTradersById
    ? Object.values(pveTradersById).filter((trader) => trader.hasStore)
    : null;
  // One render instant for every age decision on this page, so the craft split
  // and the restock countdown cannot disagree about "now". Pure computation over
  // the datasets already loaded above — no extra fetch.
  const renderedAt = Date.now();
  const pvpCraftLeaders = pvpEconomy
    ? partitionCraftLeadersByFreshness(
        selectBestCraftsByStation(pvpEconomy.crafts),
        renderedAt,
      )
    : null;
  const pveCraftLeaders = pveEconomy
    ? partitionCraftLeadersByFreshness(
        selectBestCraftsByStation(pveEconomy.crafts),
        renderedAt,
      )
    : null;
  const pvpBossMaps =
    pvpMaps?.map(({ id, name, bosses }) => ({ id, name, bosses })) ?? null;
  const pveBossMaps =
    pveMaps?.map(({ id, name, bosses }) => ({ id, name, bosses })) ?? null;

  return (
    <>
      {/* Minimal WebSite structured data — see CLAUDE.md > Structured Data. */}
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
          <LatestNewsBoard
            entries={liveFeed
              ? selectHomepageOfficialEntries(latestPublicFeedEntries(liveFeed.entries.filter(isPublishable)))
              : null}
            locale={locale}
          />
          <CraftProfitBoard
            pvpLeaders={pvpCraftLeaders}
            pveLeaders={pveCraftLeaders}
            locale={locale}
          />
          <TraderRestockBoard
            pvpTraders={pvpTraders}
            pveTraders={pveTraders}
            renderedAt={renderedAt}
          />
          <BossSpawnBoard pvpMaps={pvpBossMaps} pveMaps={pveBossMaps} locale={locale} />
        </div>
      </section>
    </>
  );
}
