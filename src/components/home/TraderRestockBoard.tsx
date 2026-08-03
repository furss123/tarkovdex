'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TaskTrader } from '@/types/tarkov';
import { useGameMode } from '@/contexts/GameModeContext';
import { useRouter } from '@/i18n/navigation';
import { formatDuration } from '@/lib/format';
import { EmptyState, ErrorState } from '@/components/status/StatusUI';

/** Below this remaining time, a trader's card gets the accent treatment —
 * the only urgency signal on this board, no new colors introduced. */
const URGENT_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Item-selling traders' next-restock countdown, ticking live client-side
 * from each trader's `resetTime` (already an absolute ISO timestamp from the
 * API and recomputed against Date.now() every second. When a timestamp passes,
 * the route is refreshed once for that expiry window so a new upstream reset
 * time can replace the elapsed one without creating a refresh loop.
 * Service/quest-only characters are filtered by the home server component
 * before reaching this board. Sorted soonest-first so the most actionable
 * restock is always top-left; already-restocked traders (remaining <= 0)
 * sink to the end since they're not time-sensitive anymore.
 *
 * Reads the site-wide PvP/PvE selection via `useGameMode()` — restock times
 * genuinely differ between modes (confirmed live: Prapor's next restock was
 * ~24 minutes apart between a regular and pve fetch at the same instant),
 * so both trader lists are passed in already-fetched. See CLAUDE.md >
 * "Global PvP/PvE mode".
 */
export function TraderRestockBoard({
  pvpTraders,
  pveTraders,
}: {
  pvpTraders: TaskTrader[] | null;
  pveTraders: TaskTrader[] | null;
}) {
  const t = useTranslations('home');
  const router = useRouter();
  const { gameMode } = useGameMode();
  const traders = gameMode === 'regular' ? pvpTraders : pveTraders;
  const [now, setNow] = useState<number | null>(null);
  const refreshedExpiryWindows = useRef(new Set<string>());

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const withRemaining = (traders ?? []).map((trader) => {
    const resetMs = trader.resetTime ? new Date(trader.resetTime).getTime() : null;
    const remaining =
      now != null && resetMs != null && Number.isFinite(resetMs)
        ? resetMs - now
        : null;
    return { trader, remaining };
  });

  const sorted = [...withRemaining].sort((a, b) => {
    const aKey = a.remaining != null && a.remaining > 0 ? a.remaining : Infinity;
    const bKey = b.remaining != null && b.remaining > 0 ? b.remaining : Infinity;
    return aKey - bKey;
  });

  const expiredResetTimes =
    now == null
      ? []
      : sorted
          .filter(({ trader, remaining }) => trader.resetTime && remaining != null && remaining <= 0)
          .map(({ trader }) => trader.resetTime as string)
          .sort();
  const expiryWindowKey = expiredResetTimes.length
    ? `${gameMode}:${expiredResetTimes.join('|')}`
    : null;

  useEffect(() => {
    if (!expiryWindowKey || refreshedExpiryWindows.current.has(expiryWindowKey)) return;
    refreshedExpiryWindows.current.add(expiryWindowKey);
    router.refresh();
  }, [expiryWindowKey, router]);

  return (
    <section aria-labelledby="trader-restock-heading">
      <h2 id="trader-restock-heading" className="text-base font-medium text-fg">
        {t('traderRestockTitle')}
      </h2>
      {traders === null ? (
        <div className="mt-3">
          <ErrorState title={t('traderDataError')} />
        </div>
      ) : sorted.length === 0 ? (
        <div className="mt-3">
          <EmptyState title={t('traderRestockEmpty')} />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map(({ trader, remaining }) => {
            const restocked = remaining != null && remaining <= 0;
            const urgent =
              remaining != null && remaining > 0 && remaining <= URGENT_THRESHOLD_MS;

            return (
              <article
                key={trader.id}
                className={`flex min-h-[92px] items-center gap-3 rounded-lg border bg-surface/20 p-3 transition-colors ${
                  urgent ? 'border-accent bg-accent/5' : 'border-border'
                }`}
              >
                {trader.imageLink ? (
                  <Image
                    src={trader.imageLink}
                    alt=""
                    width={56}
                    height={56}
                    className="size-12 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span
                    className="flex size-12 shrink-0 items-center justify-center rounded border border-border bg-bg/50 text-xs text-muted"
                    aria-hidden="true"
                  >
                    —
                  </span>
                )}
                <div className="min-w-0">
                  <h3 className="truncate text-sm text-fg">{trader.name}</h3>
                  {remaining == null ? (
                    <p className="text-xs leading-5 text-muted">
                      {t('restockUnavailable')}
                    </p>
                  ) : restocked ? (
                    <p className="text-xs text-accent">{t('restockRefreshing')}</p>
                  ) : (
                    <p
                      className={`font-mono text-sm tabular-nums ${
                        urgent ? 'text-accent' : 'text-muted'
                      }`}
                    >
                      {formatDuration(remaining)}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
