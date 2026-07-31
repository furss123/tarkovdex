import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  ChartNoAxesColumn,
  House,
  ListChecks,
  Map,
  Newspaper,
  Shield,
  Store,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
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
        <section aria-labelledby="home-tools">
          <h2 id="home-tools" className="text-sm font-medium uppercase tracking-wide text-muted">{t('toolsTitle')}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: '/news', icon: Newspaper, title: 'newsTitle', body: 'newsBody' },
              { href: '/economy/items', icon: Store, title: 'fleaTitle', body: 'fleaBody' },
              { href: '/economy/barters', icon: House, title: 'hideoutTitle', body: 'hideoutBody' },
              { href: '/progression/tasks', icon: ListChecks, title: 'questsTitle', body: 'questsBody' },
              { href: '/combat/ammo', icon: ChartNoAxesColumn, title: 'ammoTitle', body: 'ammoBody' },
              { href: '/combat/armor', icon: Shield, title: 'armorTitle', body: 'armorBody' },
              { href: '/maps', icon: Map, title: 'mapsTitle', body: 'mapsBody' },
            ].map((tool) => (
              <Link key={tool.href} href={tool.href} className="group rounded-lg border border-border bg-surface/30 p-4 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                <tool.icon className="size-5 text-accent" aria-hidden="true" />
                <h3 className="mt-3 text-sm font-medium text-fg group-hover:text-accent">{t(tool.title)}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{t(tool.body)}</p>
              </Link>
            ))}
          </div>
        </section>

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
