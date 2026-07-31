import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { SITE_URL } from '@/lib/site';
import { HERO_ATMOSPHERE } from '@/lib/atmosphere';
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
    <>
      {/* Minimal WebSite structured data — see CLAUDE.md > Structured Data. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'TarkovDex',
            url: `${SITE_URL}/${locale}`,
            inLanguage: locale,
          }),
        }}
      />
      <section className="mx-auto max-w-content px-4 py-10 sm:px-6 sm:py-14">
        {/*
          Atmosphere hero. The image is decoration only — the two overlays below
          are what make the existing heading copy readable over it, so they are
          deliberately heavy (the site's no-gradient rule is about decorative
          surface treatment, not a contrast scrim). `fill` inside a fixed
          min-height box means no layout shift, and this is the one image on the
          site marked `priority`; everything else lazy-loads.
        */}
        {/* `isolate` so the `-z-10` decoration layers stack behind the copy but
            still in front of the page background. */}
        <header className="relative isolate mb-10 flex min-h-[260px] flex-col justify-end overflow-hidden rounded-lg border border-border px-6 py-8 sm:min-h-[380px] sm:px-10 sm:py-12">
          <Image
            src={HERO_ATMOSPHERE}
            alt=""
            fill
            priority
            sizes="(max-width: 80rem) 100vw, 1280px"
            className="-z-10 object-cover object-center"
          />
          {/* Heavier on mobile: below `sm` the copy spans nearly the full hero
              width, so the right edge of a line can otherwise land on the
              image's brightest area (measured ~3.9:1 for the muted subtitle
              before this). Desktop copy stops well inside the dark half. */}
          <div
            className="absolute inset-0 -z-10 bg-gradient-to-r from-bg via-bg/90 to-bg/75 sm:to-bg/55"
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 -z-10 bg-gradient-to-t from-bg via-bg/55 to-transparent sm:via-bg/45"
            aria-hidden="true"
          />

          <p className="text-xs font-medium uppercase tracking-widest text-accent">TarkovDex</p>
          <h1 className="mt-2 text-2xl font-medium tracking-tight text-fg sm:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
            {t('subtitle')}
          </p>
        </header>

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
    </>
  );
}
