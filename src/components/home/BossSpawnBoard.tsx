'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { GameMap } from '@/types/tarkov';
import type { Locale } from '@/i18n/routing';
import { useGameMode } from '@/contexts/GameModeContext';
import { formatChance } from '@/lib/format';
import { EmptyState, ErrorState } from '@/components/status/StatusUI';

const INTL_LOCALE: Record<Locale, string> = {
  ko: 'ko-KR',
  zh: 'zh-CN',
  en: 'en-US',
};

// json.tarkov.dev's `maps.bosses` array also contains PMC, Raider, Rogue,
// and stationary-weapon spawn roles. BSG's source role ids reserve the
// `boss*` prefix for actual bosses, so use that upstream classification
// instead of maintaining a brittle map/name exclusion list here.
const ACTUAL_BOSS_ROLE = /^boss/i;
const HOME_MAP_LIMIT = 9;
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

export type HomeBossMap = Pick<GameMap, 'id' | 'name' | 'bosses'>;

/** Popular mainline maps with at least one real, positive, numeric boss spawn.
 * Variant/event maps have no reliable upstream flag, so the home summary uses
 * the explicit mainline ID list above; the full maps page still shows every
 * upstream map without guessing which variants are events. */
export function BossSpawnBoard({
  pvpMaps,
  pveMaps,
  locale,
}: {
  pvpMaps: HomeBossMap[] | null;
  pveMaps: HomeBossMap[] | null;
  locale: Locale;
}) {
  const t = useTranslations('home');
  const { gameMode } = useGameMode();
  const maps = gameMode === 'regular' ? pvpMaps : pveMaps;

  const shown = useMemo(() => {
    if (maps === null) return null;
    const topChance = (map: HomeBossMap) => map.bosses[0]?.spawnChance ?? -1;
    return maps
      .filter((map) => POPULAR_MAP_RANK.has(map.id))
      .map((map) => ({
        id: map.id,
        name: map.name,
        bosses: map.bosses.filter(
          (spawn) =>
            spawn.boss !== null &&
            ACTUAL_BOSS_ROLE.test(spawn.boss.id) &&
            typeof spawn.spawnChance === 'number' &&
            Number.isFinite(spawn.spawnChance) &&
            spawn.spawnChance > 0,
        ),
      }))
      .filter((map) => map.bosses.length > 0)
      .sort((a, b) => {
        const rankA = POPULAR_MAP_RANK.get(a.id) ?? Number.POSITIVE_INFINITY;
        const rankB = POPULAR_MAP_RANK.get(b.id) ?? Number.POSITIVE_INFINITY;
        return (
          rankA - rankB ||
          topChance(b) - topChance(a) ||
          a.name.localeCompare(b.name, INTL_LOCALE[locale]) ||
          a.id.localeCompare(b.id)
        );
      })
      .slice(0, HOME_MAP_LIMIT);
  }, [maps, locale]);

  return (
    <section aria-labelledby="boss-spawn-heading">
      <div className="flex items-center justify-between gap-4">
        <h2 id="boss-spawn-heading" className="text-base font-medium text-fg">
          {t('bossSpawnTitle')}
        </h2>
        <Link
          href="/maps"
          className="flex min-h-touch shrink-0 items-center gap-1 rounded text-xs text-muted underline-offset-4 transition-colors hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {t('viewAllMaps')}
          <ArrowRight className="size-4 text-accent" aria-hidden="true" />
        </Link>
      </div>

      {shown === null ? (
        <div className="mt-3">
          <ErrorState title={t('bossDataError')} />
        </div>
      ) : shown.length === 0 ? (
        <div className="mt-3">
          <EmptyState title={t('bossSpawnEmpty')} />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((map) => (
            <article
              key={map.id}
              className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface/20"
            >
              <h3 className="border-b border-border px-3 py-3 text-sm font-medium text-fg">
                {map.name}
              </h3>

              <ul className="flex-1 px-3 py-2">
                {map.bosses.map((spawn) => (
                  <li
                    key={spawn.boss?.id}
                    className="flex min-w-0 items-center gap-2 border-t border-border/60 py-2 first:border-t-0"
                  >
                    <span className="flex size-[36px] shrink-0 overflow-hidden rounded border border-border bg-surface-2">
                      {spawn.boss?.imageLink ? (
                        <Image
                          src={spawn.boss.imageLink}
                          alt=""
                          width={36}
                          height={36}
                          className="size-full object-cover object-top"
                        />
                      ) : (
                        <span className="m-auto text-xs text-muted" aria-hidden="true">
                          —
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">
                      {spawn.boss?.name}
                    </span>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-fg">
                      {formatChance(spawn.spawnChance, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
