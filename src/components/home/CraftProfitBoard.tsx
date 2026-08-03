'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { useGameMode } from '@/contexts/GameModeContext';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatSignedRoubles } from '@/lib/format';
import type { CraftProfitLeader } from '@/types/tools';
import { EmptyState, ErrorState } from '@/components/status/StatusUI';

function craftDuration(seconds: number, t: ReturnType<typeof useTranslations>): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return t('craftDurationHoursMinutes', { hours, minutes });
  }
  if (hours > 0) return t('craftDurationHours', { hours });
  return t('craftDurationMinutes', { minutes });
}

export function CraftProfitBoard({
  pvpLeaders,
  pveLeaders,
  locale,
}: {
  pvpLeaders: CraftProfitLeader[] | null;
  pveLeaders: CraftProfitLeader[] | null;
  locale: Locale;
}) {
  const t = useTranslations('home');
  const { gameMode } = useGameMode();
  const leaders = gameMode === 'regular' ? pvpLeaders : pveLeaders;

  return (
    <section aria-labelledby="craft-profit-heading">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 id="craft-profit-heading" className="text-base font-medium text-fg">
            {t('craftProfitTitle')}
          </h2>
          <p className="mt-1 text-xs text-muted">{t('craftProfitDescription')}</p>
        </div>
        <Link
          href="/economy/barters"
          className="flex min-h-touch shrink-0 items-center gap-1 self-start rounded text-xs text-muted underline-offset-4 transition-colors hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {t('viewAllCrafts')}
          <ArrowRight className="size-4 text-accent" aria-hidden="true" />
        </Link>
      </div>

      {leaders === null ? (
        <div className="mt-3">
          <ErrorState title={t('craftPriceError')} />
        </div>
      ) : leaders.length === 0 ? (
        <div className="mt-3">
          <EmptyState title={t('craftProfitEmpty')} />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {leaders.map((leader) => {
            const loss = leader.profit < 0;
            return (
              <article
                key={leader.station.id}
                className="flex min-w-0 flex-col rounded-lg border border-border bg-surface/30 p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-bg/60">
                    {leader.station.imageLink ? (
                      <Image
                        src={leader.station.imageLink}
                        alt=""
                        width={48}
                        height={48}
                        className="size-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-muted" aria-hidden="true">—</span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-fg">
                      {leader.station.name}
                    </h3>
                    <p className="text-xs text-muted">
                      {t('craftStationLevel', { level: leader.level })}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex min-w-0 items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-bg/60">
                    {leader.product.iconLink ? (
                      <Image
                        src={leader.product.iconLink}
                        alt=""
                        width={64}
                        height={64}
                        className="size-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-muted" aria-hidden="true">—</span>
                    )}
                  </span>
                  <p className="line-clamp-2 min-w-0 text-sm text-fg">
                    {leader.product.name}{' '}
                    <span className="whitespace-nowrap text-muted">× {leader.product.count}</span>
                  </p>
                </div>

                <div className="mt-5">
                  <p className="text-xs text-muted">
                    {loss ? t('estimatedLoss') : t('estimatedProfit')}
                  </p>
                  <p
                    className={`mt-1 text-xl font-medium tabular-nums ${
                      loss ? 'text-negative' : 'text-positive'
                    }`}
                  >
                    {formatSignedRoubles(leader.profit, locale)}
                  </p>
                </div>

                <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-border/70 pt-3 text-xs">
                  <div>
                    <dt className="text-muted">{t('craftDuration')}</dt>
                    <dd className="mt-1 tabular-nums text-fg">
                      {craftDuration(leader.duration, t)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('hourlyProfit')}</dt>
                    <dd className="mt-1 tabular-nums text-fg">
                      {leader.hourlyProfit === null
                        ? '—'
                        : t('craftPerHourValue', {
                            value: formatSignedRoubles(leader.hourlyProfit, locale),
                          })}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
