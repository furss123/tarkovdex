import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Info } from 'lucide-react';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import {
  DATA_DOMAINS,
  availabilityFromFeedFreshness,
  contentFreshness,
  summarizeHealth,
  type DataHealth,
  type DataDomainPolicy,
} from '@/lib/data-status';
import { cachePathsForDomain, readFetchObservation } from '@/lib/data-observations';
import { getLiveFeed } from '@/lib/live/feed';
import type { LiveFeed } from '@/types/live';
import {
  DataSourcePopover,
  DataStatusBadge,
  LastUpdated,
} from '@/components/status/StatusUI';
import { RetryAction } from '@/components/status/RetryAction';

type Props = { params: Promise<{ locale: string }> };

/**
 * Dynamic on purpose. This page reports what is true *now* on the instance
 * answering the request; caching it would turn an observation back into the
 * kind of stale claim Phase 1 exists to remove.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'status', path: '/status' });
}

/** Delivery values are hyphenated; message keys are not. */
function deliveryKey(delivery: DataHealth['delivery']): string {
  return delivery === 'stale-cache' ? 'staleCache' : delivery;
}

/**
 * Build health for a json.tarkov.dev domain **without fetching anything**.
 *
 * This page deliberately does not call the loaders: doing so would download
 * tens of megabytes just to render a status board, and would also make the
 * page report its own fetch rather than what the site actually served. It
 * therefore reads observations only, and says "no record on this instance"
 * where there is none — which is the honest answer for per-instance memory on
 * a platform that runs many instances.
 */
function observedHealth(
  policy: DataDomainPolicy,
  locale: Locale,
  now: number,
): DataHealth | null {
  const records = (['regular', 'pve'] as const)
    .flatMap((gameMode) => cachePathsForDomain(policy.id, gameMode, locale))
    .map(readFetchObservation)
    .filter((record): record is NonNullable<typeof record> => record !== null);

  if (records.length === 0) return null;

  const servedStale = records.some((record) => record.servedStale);
  const successes = records
    .map((record) => record.lastSuccessAt)
    .filter((value): value is number => value != null);
  const failed = records.find((record) => record.errorCode !== null);
  const usable = records.some((record) => record.lastSuccessAt != null);

  return {
    domain: policy.id,
    availability: usable
      ? successes.length === records.length
        ? 'available'
        : 'partial'
      : 'unavailable',
    // No upstream content stamp is reachable from here for any of these
    // domains, so content age stays unknown rather than borrowing the fetch
    // time and calling it a content time.
    freshness: 'unknown',
    delivery: servedStale
      ? 'stale-cache'
      : records.some((record) => record.lastServedFrom === 'network')
        ? 'network'
        : records.some((record) => record.lastServedFrom === 'cache')
          ? 'cache'
          : 'unknown',
    timestamps: {
      ...(successes.length ? { fetchedAt: new Date(Math.min(...successes)).toISOString() } : {}),
      observedAt: new Date(now).toISOString(),
    },
    retryable: failed?.retryable ?? true,
    ...(failed?.errorCode ? { internalErrorCode: failed.errorCode } : {}),
  };
}

/** Tarkov Live is the one domain whose state is stored, not per-instance — its
 * `lastCheckedAt` is a real, deployment-wide "last successful collection". */
function liveHealth(
  policy: DataDomainPolicy,
  feed: LiveFeed | null,
  now: number,
): DataHealth | null {
  if (!feed) return null;
  return {
    domain: policy.id,
    availability: availabilityFromFeedFreshness(feed.freshness),
    freshness: contentFreshness({
      sourceUpdatedAt: feed.lastCheckedAt,
      warningAfterMs: policy.warningAfterMs,
      staleAfterMs: policy.staleAfterMs,
      now,
    }),
    delivery: 'network',
    timestamps: {
      ...(feed.lastCheckedAt ? { sourceUpdatedAt: feed.lastCheckedAt } : {}),
      observedAt: new Date(now).toISOString(),
    },
    // Deliberately no count: the feed is one list covering both news and
    // events, so a per-domain total here would be a number nobody can act on.
    retryable: true,
  };
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <dt className="shrink-0 text-fg">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default async function StatusPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('status');
  const now = Date.now();

  let feed: LiveFeed | null = null;
  try {
    feed = await getLiveFeed(locale);
  } catch {
    // A live-feed outage must not take the trust centre down; the card below
    // reports "no record" instead.
  }

  const cards = DATA_DOMAINS.map((policy) => ({
    policy,
    health:
      policy.id === 'news' || policy.id === 'events'
        ? liveHealth(policy, feed, now)
        : observedHealth(policy, locale, now),
  }));

  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-[28px] font-medium leading-9 tracking-tight text-fg sm:text-[30px] sm:leading-10">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-3xl text-[16px] leading-6 text-muted">{t('description')}</p>
        <div
          role="note"
          className="mt-4 flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-[14px] leading-5 text-muted"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 break-words">{t('instanceNotice')}</p>
        </div>
        <div className="mt-4">
          <RetryAction />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {cards.map(({ policy, health }) => (
          <article
            key={policy.id}
            className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface/30 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="min-w-0 break-words text-base font-medium text-fg">
                {t(policy.displayNameKey)}
              </h2>
              {health ? (
                <DataStatusBadge health={health} />
              ) : (
                <DataStatusBadge summary="unknownAge" />
              )}
            </div>

            <dl className="space-y-1.5 text-[14px] leading-5 text-muted">
              <Row label={t('label.availability')}>
                {health ? t(`availability.${health.availability}`) : t('noObservation')}
              </Row>
              <Row label={t('label.freshness')}>
                {health ? t(`freshness.${health.freshness}`) : t('unknown')}
              </Row>
              <Row label={t('label.delivery')}>
                {health ? t(`delivery.${deliveryKey(health.delivery)}`) : t('unknown')}
              </Row>
              {health?.totalCount != null ? (
                <Row label={t('label.counts')}>
                  {t('counts.total', { count: health.totalCount })}
                </Row>
              ) : null}
              <Row label={t('label.impact')}>
                {t(`impact.${health ? summarizeHealth(health) : 'unknownAge'}`)}
              </Row>
            </dl>

            {/* Self-labelling, so these sit outside the definition list rather
                than repeating their own label inside a <dt>. */}
            <div className="flex flex-col gap-1">
              <LastUpdated
                label={t('label.sourceUpdatedAt')}
                iso={health?.timestamps.sourceUpdatedAt}
                locale={locale}
                unknownLabel={
                  policy.supportsSourceTimestamp ? t('unknownTime') : t('noSourceTimestamp')
                }
              />
              <LastUpdated
                label={t('label.fetchedAt')}
                iso={health?.timestamps.fetchedAt}
                locale={locale}
                unknownLabel={t('noObservation')}
              />
            </div>

            <DataSourcePopover
              provider={policy.provider}
              sourceUrl={policy.sourceUrl}
              cachePolicy={t(policy.cachePolicyKey)}
              fallbackBehavior={t(policy.fallbackBehaviorKey)}
            />
          </article>
        ))}
      </div>
    </section>
  );
}
