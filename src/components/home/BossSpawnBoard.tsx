'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import { formatChance } from '@/lib/format';
import type { DashboardBossMap } from '@/types/dashboard';
import { EmptyState, ErrorState } from '@/components/status/StatusUI';

/**
 * Boss spawn rates for the popular mainline maps — a static card grid, no
 * click required. Every rate is visible at once, which is the whole point:
 * the one question this board exists to answer is "which bosses can I meet,
 * and how likely", and an accordion put that behind a click per map.
 *
 * Which maps appear, which spawns count as an actual boss, and the display
 * order are all decided server-side in `lib/dashboard.ts` — this component
 * renders whatever it is handed.
 *
 * Freshness note: spawn chances are structural data that changes with a game
 * patch or an event, not minute to minute. They ride the same refresh as the
 * craft ranking because they arrive in the same payload, but the visible age
 * on the status strip is the price stamp, since that is the number that
 * actually moves.
 */
export function BossSpawnBoard({
  maps,
  locale,
}: {
  maps: DashboardBossMap[] | null;
  locale: Locale;
}) {
  const t = useTranslations('home');

  return (
    <section aria-labelledby="boss-spawn-heading">
      <div className="flex flex-col gap-1">
        <h2 id="boss-spawn-heading" className="text-base font-medium text-fg">
          {t('bossSpawnTitle')}
        </h2>
        <p className="text-xs text-muted">{t('bossSpawnDescription')}</p>
      </div>

      {maps === null ? (
        <div className="mt-3">
          <ErrorState title={t('bossDataError')} />
        </div>
      ) : maps.length === 0 ? (
        <div className="mt-3">
          <EmptyState title={t('bossSpawnEmpty')} />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3">
          {maps.map((map) => (
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
                        <span
                          className="m-auto text-xs text-muted"
                          aria-hidden="true"
                        >
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
