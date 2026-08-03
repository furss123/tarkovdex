'use client';

import { History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatKst } from '@/lib/format';
import type { Locale } from '@/i18n/routing';
import type { OfflineResponseInfo } from '@/lib/offline-status';

/**
 * Near-data notice when a market/search/news payload was delivered from the
 * service-worker cache. Never labels cached prices as the live reading.
 */
export function CachedDataNotice({
  info,
  locale,
  variant = 'generic',
}: {
  info: OfflineResponseInfo | null | undefined;
  locale: Locale;
  variant?: 'generic' | 'price' | 'news';
}) {
  const t = useTranslations('offline');
  if (!info?.servedFromOfflineCache) return null;

  const title =
    variant === 'price'
      ? t('lastSavedPrice')
      : variant === 'news'
        ? t('lastSavedUpdate')
        : t('showingCached');

  return (
    <div
      role="status"
      className="mb-3 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-[14px] leading-5 text-fg"
    >
      <History className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="break-words">{title}</p>
        <p className="mt-1 break-words text-muted">{t('mayBeOutdated')}</p>
        {info.cachedAt ? (
          <p className="mt-1 break-words text-muted">
            {t('lastOfflineSave')}:{' '}
            <time dateTime={info.cachedAt}>
              {formatKst(info.cachedAt, locale) ?? info.cachedAt}
            </time>
          </p>
        ) : null}
        {variant === 'news' ? (
          <p className="mt-1 break-words text-muted">{t('eventStateMayDiffer')}</p>
        ) : null}
        {variant === 'price' ? (
          <p className="mt-1 break-words text-muted">{t('cannotConfirmCurrentPrice')}</p>
        ) : null}
      </div>
    </div>
  );
}
