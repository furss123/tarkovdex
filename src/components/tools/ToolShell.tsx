import { Database } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import type { DataHealth } from '@/lib/data-status';
import { domainPolicy, summarizeHealth } from '@/lib/data-status';
import {
  DataSourcePopover,
  DataStatusBadge,
  LastUpdated,
  StaleDataNotice,
} from '@/components/status/StatusUI';
import { GameModeBadge } from './GameModeBadge';

/**
 * Every tool page's header.
 *
 * The old `updatedAt` prop was dead (one caller, passing `null`) and formatted
 * with `new Date(x).toLocaleString(locale)` — no `timeZone`, rendered on the
 * server, so it would have printed Vercel's UTC rather than a zone any reader
 * chose. It is replaced by `health`, which routes every timestamp through the
 * shared, zone-pinned status components instead.
 */
export function ToolIntro({
  title,
  description,
  sourceLabel,
  locale,
  health,
  showMode = true,
}: {
  title: string;
  description: string;
  sourceLabel?: string;
  locale?: Locale;
  health?: DataHealth;
  showMode?: boolean;
}) {
  const t = useTranslations('status');
  const policy = health ? domainPolicy(health.domain) : null;

  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-[28px] font-medium leading-9 tracking-tight text-fg sm:text-[30px] sm:leading-10">
          {title}
        </h1>
        {showMode ? <GameModeBadge /> : null}
        {health ? <DataStatusBadge health={health} /> : null}
      </div>
      <p className="mt-2 max-w-3xl text-[16px] leading-6 text-muted">{description}</p>

      {sourceLabel || health ? (
        <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2 text-[14px] leading-5 text-muted">
          {sourceLabel ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Database className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{sourceLabel}</span>
            </span>
          ) : null}
          {health && locale ? (
            <>
              <LastUpdated
                label={t('label.sourceUpdatedAt')}
                iso={health.timestamps.sourceUpdatedAt}
                locale={locale}
                unknownLabel={
                  policy?.supportsSourceTimestamp ? undefined : t('noSourceTimestamp')
                }
              />
              <LastUpdated
                label={t('label.fetchedAt')}
                iso={health.timestamps.fetchedAt}
                locale={locale}
                unknownLabel={t('noObservation')}
              />
            </>
          ) : null}
          {policy ? (
            <DataSourcePopover
              provider={policy.provider}
              sourceUrl={policy.sourceUrl}
              cachePolicy={t(policy.cachePolicyKey)}
              fallbackBehavior={t(policy.fallbackBehaviorKey)}
            >
              <p className="mt-2 break-words">{t('instanceNotice')}</p>
            </DataSourcePopover>
          ) : null}
        </div>
      ) : null}

      {health && summarizeHealth(health) === 'previous' ? (
        <div className="mt-3">
          <StaleDataNotice />
        </div>
      ) : null}
    </header>
  );
}

export function DataError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-negative/40 bg-negative/5 p-6 text-sm text-negative">
      {message}
    </div>
  );
}
