'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TaskTrader } from '@/types/tarkov';
import { useGameMode } from '@/contexts/GameModeContext';
import { formatDuration } from '@/lib/format';

/** Below this remaining time, a trader's card gets the accent treatment —
 * the only urgency signal on this board, no new colors introduced. */
const URGENT_THRESHOLD_MS = 10 * 60 * 1000;

/** Cards shown before "show all" expands the board — one desktop row. */
const COLLAPSED_COUNT = 4;

/**
 * Item-selling traders' next-restock countdown, ticking live client-side
 * from each trader's `resetTime` (already an absolute ISO timestamp from the
 * API — no polling needed, just recomputed against Date.now() every second).
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
  pvpTraders: TaskTrader[];
  pveTraders: TaskTrader[];
}) {
  const t = useTranslations('home');
  const { gameMode } = useGameMode();
  const traders = gameMode === 'regular' ? pvpTraders : pveTraders;
  const [now, setNow] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const withRemaining = traders.map((trader) => {
    const resetMs = trader.resetTime ? new Date(trader.resetTime).getTime() : null;
    const remaining = now != null && resetMs != null ? resetMs - now : null;
    return { trader, remaining };
  });

  const sorted = [...withRemaining].sort((a, b) => {
    const aKey = a.remaining != null && a.remaining > 0 ? a.remaining : Infinity;
    const bKey = b.remaining != null && b.remaining > 0 ? b.remaining : Infinity;
    return aKey - bKey;
  });

  // Soonest few restocks are the actionable ones; the rest expand on demand.
  const shown = expanded ? sorted : sorted.slice(0, COLLAPSED_COUNT);

  return (
    <div>
      <h2 className="text-sm font-medium text-fg">{t('traderRestockTitle')}</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map(({ trader, remaining }) => {
          const restocked = remaining != null && remaining <= 0;
          const urgent = remaining != null && remaining > 0 && remaining <= URGENT_THRESHOLD_MS;

          return (
            <div
              key={trader.id}
              className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                urgent ? 'border-accent bg-accent/5' : 'border-border'
              }`}
            >
              {trader.imageLink ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={trader.imageLink}
                  alt=""
                  className="size-10 shrink-0 rounded object-cover"
                />
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-sm text-fg">{trader.name}</p>
                {remaining == null ? (
                  <p className="text-xs text-muted">—</p>
                ) : restocked ? (
                  <p className="text-xs text-accent">{t('restocked')}</p>
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
            </div>
          );
        })}
      </div>
      {sorted.length > COLLAPSED_COUNT ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-3 flex min-h-touch w-full items-center justify-center gap-1.5 rounded-md border border-border text-sm text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {expanded
            ? t('showFewerTraders')
            : t('showAllTraders', { count: sorted.length })}
          <ChevronDown
            className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </div>
  );
}
