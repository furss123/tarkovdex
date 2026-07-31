'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { GameMap } from '@/types/tarkov';
import type { Locale } from '@/i18n/routing';
import { useGameMode } from '@/contexts/GameModeContext';
import { formatChance } from '@/lib/format';

const INTL_LOCALE: Record<Locale, string> = {
  ko: 'ko-KR',
  zh: 'zh-CN',
  en: 'en-US',
};

/**
 * How many maps the home board shows. Nine fills exactly three rows of the
 * 3-column desktop grid.
 *
 * This cap is measured, not guessed: rendering all 17 maps produced a
 * 1415px section at 1280px wide and a 2944px one at 375px — roughly seven
 * phone screens of a single home-page section, which defeats the "at a
 * glance" point of removing the accordion in the first place. Nine keeps the
 * board curated while adding one complete desktop row, and `/maps` (which
 * lists every map with
 * its full boss list, spawn rates and wiki link) is one click away via the
 * heading link.
 */
const HOME_MAP_LIMIT = 9;

/**
 * Curated popularity order for the home dashboard. Stable map ids keep the
 * sequence identical across locales and game modes:
 *
 *   1 2 3
 *   4 5 6
 *   7 8 9
 *
 * Any future map not listed here falls back behind these nine, ordered by its
 * highest boss spawn chance and then localized name.
 */
const POPULAR_MAP_IDS = [
  '56f40101d2720b2a4d8b45d6', // Customs
  '5714dc692459777137212e12', // Streets of Tarkov
  '5714dbc024597771384a510d', // Interchange
  '5704e5fad2720bc05b8b4567', // Reserve
  '5704e3c2d2720bac5b8b4567', // Woods
  '5704e554d2720bac5b8b456e', // Shoreline
  '55f2d3fd4bdc2d5f408b4567', // Factory
  '653e6760052c01c1c805532f', // Ground Zero
  '5704e4dad2720bb55b8b4567', // Lighthouse
] as const;

const POPULAR_MAP_RANK = new Map<string, number>(
  POPULAR_MAP_IDS.map((id, index) => [id, index]),
);

/**
 * Nine popular maps and their full spawn rates, all visible at once — no
 * click required.
 *
 * This replaced a click-to-expand accordion (see CLAUDE.md > "Boss spawn
 * board"). The accordion listed all 17 maps but showed only a map name and
 * its single top boss until you opened each row, so the one thing the board
 * exists to answer — "which bosses can I meet, and how likely" — sat behind
 * 17 separate clicks. Each map is now a static card listing every one of its
 * bosses with spawn chances.
 *
 * The trade that makes that fit: this board now shows the top
 * `HOME_MAP_LIMIT` maps instead of all 17 (see that constant for the
 * measurements that forced the cap), with `/maps` linked from the heading as
 * the complete reference. Breadth moved to /maps; depth-without-clicking
 * came to the home board.
 *
 * Boss portraits were restored later by request, but as compact 36px
 * thumbnails inside the existing data rows rather than the original large
 * portrait treatment. The image is supporting identification, while the
 * name and chance remain the primary information. The per-map wiki link
 * stays omitted; the single heading link leads to the complete map guide.
 *
 * The explicit popularity order is deliberately independent of live spawn
 * rates, so patches and PvP/PvE differences do not make cards jump between
 * grid positions. /maps remains the complete by-name lookup. The empty-state
 * branch below is kept because a popular map can temporarily have no bosses.
 *
 * Reads the site-wide PvP/PvE selection via `useGameMode()` — boss
 * compositions genuinely differ between modes (regular has 45 deduped boss
 * entries across 17 maps, pve has 71), so both maps lists are passed in
 * already-fetched. See CLAUDE.md > "Global PvP/PvE mode".
 */
export function BossSpawnBoard({
  pvpMaps,
  pveMaps,
  locale,
}: {
  pvpMaps: GameMap[];
  pveMaps: GameMap[];
  locale: Locale;
}) {
  const t = useTranslations('home');
  const tMaps = useTranslations('maps');
  const { gameMode } = useGameMode();
  const maps = gameMode === 'regular' ? pvpMaps : pveMaps;

  const shown = useMemo(() => {
    // `bosses` is already deduped and sorted by chance descending in
    // getMaps(), so [0] is the fallback map's highest spawn chance.
    const topChance = (map: GameMap) => map.bosses[0]?.spawnChance ?? -1;
    return [...maps]
      .sort(
        (a, b) => {
          const rankA = POPULAR_MAP_RANK.get(a.id) ?? Number.POSITIVE_INFINITY;
          const rankB = POPULAR_MAP_RANK.get(b.id) ?? Number.POSITIVE_INFINITY;
          return (
            rankA - rankB ||
            topChance(b) - topChance(a) ||
            a.name.localeCompare(b.name, INTL_LOCALE[locale])
          );
        },
      )
      .slice(0, HOME_MAP_LIMIT);
  }, [maps, locale]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-fg">{t('bossSpawnTitle')}</h2>
        <Link
          href="/maps"
          className="flex min-h-touch shrink-0 items-center gap-1 rounded text-xs text-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {t('viewAllMaps')}
          <ArrowRight className="size-4 text-accent" aria-hidden="true" />
        </Link>
      </div>

      {/* items-start keeps each card at its natural height instead of
          stretching it to the tallest in its row — boss counts range from 0
          to 8, so stretching would leave large dead space. */}
      <div className="mt-3 grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((map) => (
          <div
            key={map.id}
            className="rounded-lg border border-border bg-surface/30 px-3 py-2.5"
          >
            <h3 className="truncate text-sm font-medium text-fg">{map.name}</h3>

            {map.bosses.length > 0 ? (
              <ul className="mt-2">
                {map.bosses.map((spawn, i) => (
                  <li
                    key={spawn.boss?.id ?? i}
                    className="flex items-center gap-2 border-t border-border/60 py-1.5 first:border-t-0 first:pt-0 last:pb-0"
                  >
                    <span
                      className="flex size-6 shrink-0 overflow-hidden rounded border border-border bg-surface-2"
                      aria-hidden="true"
                    >
                      {spawn.boss?.imageLink ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={spawn.boss.imageLink}
                          alt=""
                          width={36}
                          height={36}
                          loading="lazy"
                          className="size-full object-cover object-top"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">
                      {spawn.boss?.name}
                    </span>
                    {/* The number is the scannable datum, so it gets the
                        brighter foreground and medium weight while the name
                        stays muted — emphasis via the existing two weights
                        and gray scale, no new colour. */}
                    <span className="shrink-0 text-xs font-medium tabular-nums text-fg">
                      {formatChance(spawn.spawnChance, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-xs text-muted">{tMaps('noBosses')}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
