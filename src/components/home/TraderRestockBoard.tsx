'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TaskTrader } from '@/types/tarkov';
import { useGameMode } from '@/contexts/GameModeContext';
import { useRouter } from '@/i18n/navigation';
import { formatDuration } from '@/lib/format';
import { selectActionableRestocks } from '@/lib/trader-restock';
import { EmptyState, ErrorState } from '@/components/status/StatusUI';

/** Below this remaining time, a trader's card gets the accent treatment —
 * the only urgency signal on this board, no new colors introduced. */
const URGENT_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Item-selling traders' next-restock countdown, ticking live client-side from
 * each trader's `resetTime` (an absolute ISO timestamp from the API) against
 * `Date.now()` every second. Service/quest-only characters are filtered by the
 * home server component before reaching this board.
 *
 * Only traders with a restock still ahead of them are rendered, soonest-first.
 * A trader whose `resetTime` is missing, unparseable or already past is left
 * out entirely and, when that is all of them, one empty-state line replaces the
 * whole grid — see `selectActionableRestocks()` for why nine "restocking now"
 * cards were worse than saying nothing.
 *
 * `renderedAt` is the server's own render instant and seeds `now`, so the first
 * client render reproduces the server markup exactly; the ticker takes over
 * after mount. This is the same hydration-safety pattern `LiveBoard` uses with
 * `lastCheckedAt`.
 *
 * Reads the site-wide PvP/PvE selection via `useGameMode()` — restock times
 * genuinely differ between modes (confirmed live: Prapor's next restock was
 * ~24 minutes apart between a regular and pve fetch at the same instant), so
 * both trader lists are passed in already-fetched. See CLAUDE.md >
 * "Global PvP/PvE mode".
 */
export function TraderRestockBoard({
  pvpTraders,
  pveTraders,
  renderedAt,
}: {
  pvpTraders: TaskTrader[] | null;
  pveTraders: TaskTrader[] | null;
  renderedAt: number;
}) {
  const t = useTranslations('home');
  const router = useRouter();
  const { gameMode } = useGameMode();
  const traders = gameMode === 'regular' ? pvpTraders : pveTraders;
  const [now, setNow] = useState(renderedAt);
  const refreshedExpiryWindows = useRef(new Set<string>());

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { actionable } = selectActionableRestocks(traders ?? [], now);

  // Only a countdown that was still running when this page was rendered can
  // expire while it is open. Watching the already-past ones instead would fire
  // a refresh on every single visit, since upstream's document is routinely
  // hours behind.
  const watched = useMemo(
    () =>
      selectActionableRestocks(traders ?? [], renderedAt)
        .actionable.map(({ trader }) => trader.resetTime)
        .filter((iso): iso is string => iso != null),
    [traders, renderedAt],
  );
  const expired = watched.filter((iso) => Date.parse(iso) <= now).sort();
  const expiryWindowKey = expired.length ? `${gameMode}:${expired.join('|')}` : null;

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
      ) : traders.length === 0 ? (
        <div className="mt-3">
          <EmptyState title={t('traderRestockEmpty')} />
        </div>
      ) : actionable.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title={t('restockAllUnavailable')}
            hint={t('restockAllUnavailableHint')}
          />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {actionable.map(({ trader, remaining }) => {
            const urgent = remaining <= URGENT_THRESHOLD_MS;
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
                  <p
                    className={`font-mono text-sm tabular-nums ${
                      urgent ? 'text-accent' : 'text-muted'
                    }`}
                  >
                    {formatDuration(remaining)}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
