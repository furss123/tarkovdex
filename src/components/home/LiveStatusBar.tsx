'use client';

import { useTranslations } from 'next-intl';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import type { Locale } from '@/i18n/routing';
import { formatKst, formatRelativeTime } from '@/lib/format';
import type { LiveStatus } from './useLiveDashboard';

/**
 * The board's honesty strip.
 *
 * It reports two different times on purpose, because they answer two different
 * questions and conflating them is how a dashboard ends up lying:
 *
 * - **price stamp** — how current the underlying data is. This is upstream's
 *   number and is the one that decides whether acting on the ranking is sane.
 * - **last sync** — when *we* last asked. A recent sync over a day-old price
 *   stamp is still day-old data, and the strip shows both so that is visible
 *   rather than implied.
 *
 * Before the first client tick both render as absolute, timezone-pinned text
 * so server and client markup agree during hydration.
 */
export function LiveStatusBar({
  locale,
  priceUpdatedAt,
  now,
  lastSyncedAt,
  status,
  onRefresh,
}: {
  locale: Locale;
  priceUpdatedAt: string | null;
  now: number | null;
  lastSyncedAt: number | null;
  status: LiveStatus;
  onRefresh: () => void;
}) {
  const t = useTranslations('home');
  const absolute = formatKst(priceUpdatedAt, locale);
  const priceAge =
    absolute == null
      ? t('priceAgeUnknown')
      : now != null
        ? `${formatRelativeTime(priceUpdatedAt, locale, now)} · ${absolute}`
        : absolute;

  const syncLabel =
    status === 'error'
      ? t('liveError')
      : lastSyncedAt != null && now != null
        ? t('liveSyncedAt', {
            time: formatRelativeTime(
              new Date(lastSyncedAt).toISOString(),
              locale,
              now,
            ),
          })
        : t('liveAuto');

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-surface/30 px-3 py-2 text-[14px] leading-5"
    >
      <p className="min-w-0 break-words text-muted">
        {t('priceAgeLabel')}:{' '}
        {priceUpdatedAt && absolute ? (
          <time dateTime={priceUpdatedAt} className="text-fg">
            {priceAge}
          </time>
        ) : (
          <span className="text-fg">{priceAge}</span>
        )}
      </p>

      <div className="flex shrink-0 items-center gap-2">
        <span
          className={
            status === 'error'
              ? 'inline-flex items-center gap-1.5 text-negative'
              : 'inline-flex items-center gap-1.5 text-muted'
          }
        >
          {status === 'error' ? (
            <TriangleAlert className="size-[14px] shrink-0" aria-hidden="true" />
          ) : (
            <RefreshCw
              className={`size-[14px] shrink-0 ${
                status === 'refreshing' ? 'animate-spin text-accent' : ''
              }`}
              aria-hidden="true"
            />
          )}
          {syncLabel}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="flex min-h-touch items-center rounded px-2 text-muted underline-offset-4 transition-colors hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {t('liveRefreshNow')}
        </button>
      </div>
    </div>
  );
}
