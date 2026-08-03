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
  type DataStatusSummary,
} from '@/lib/data-status';
import {
  getDomainStatusSnapshot,
  type DomainStatus,
} from '@/lib/data-status-snapshot';
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

/** Tarkov Live is the one domain whose state is stored, not per-instance — its
 * `lastCheckedAt` is a real, deployment-wide "last successful collection". */
function liveStatus(
  policy: DataDomainPolicy,
  feed: LiveFeed | null,
  now: number,
): DomainStatus | null {
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
    observed: true,
  };
}

/**
 * The badge reduces the axes to one word. An undetermined availability can only
 * become `unknownAge` — never `ok`, which would claim an availability nobody
 * observed.
 */
function summarize(status: DomainStatus | null): DataStatusSummary {
  if (!status || status.availability === null) return 'unknownAge';
  return summarizeHealth({ ...status, availability: status.availability });
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

  // Bounded, cache-reusing read: one items document resolves the real content
  // stamp for the three price-backed domains. Everything else stays
  // observation-only. See lib/data-status-snapshot.ts.
  const snapshot = await getDomainStatusSnapshot({ locale, now });

  const cards = DATA_DOMAINS.map((policy) => {
    const live = policy.id === 'news' || policy.id === 'events';
    return {
      policy,
      perInstance: !live,
      status: live ? liveStatus(policy, feed, now) : (snapshot.get(policy.id) ?? null),
    };
  });

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
        {cards.map(({ policy, perInstance, status }) => (
          <article
            key={policy.id}
            className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface/30 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="min-w-0 break-words text-base font-medium text-fg">
                {t(policy.displayNameKey)}
              </h2>
              <DataStatusBadge summary={summarize(status)} />
            </div>

            <dl className="space-y-1.5 text-[14px] leading-5 text-muted">
              {/* Availability answers "can the site show this", so an absent
                  per-instance record reports an undetermined availability here
                  and states the absence in its own row below. */}
              <Row label={t('label.availability')}>
                {status?.availability
                  ? t(`availability.${status.availability}`)
                  : t('unknown')}
              </Row>
              <Row label={t('label.freshness')}>
                {status ? t(`freshness.${status.freshness}`) : t('unknown')}
              </Row>
              <Row label={t('label.delivery')}>
                {status ? t(`delivery.${deliveryKey(status.delivery)}`) : t('unknown')}
              </Row>
              {perInstance ? (
                <Row label={t('label.observation')}>
                  {status?.observed ? t('observationRecorded') : t('noObservation')}
                </Row>
              ) : null}
              <Row label={t('label.impact')}>{t(`impact.${summarize(status)}`)}</Row>
            </dl>

            {/* Self-labelling, so these sit outside the definition list rather
                than repeating their own label inside a <dt>. */}
            <div className="flex flex-col gap-1">
              <LastUpdated
                label={t('label.sourceUpdatedAt')}
                iso={status?.timestamps.sourceUpdatedAt}
                locale={locale}
                unknownLabel={
                  policy.supportsSourceTimestamp ? t('unknownTime') : t('noSourceTimestamp')
                }
              />
              <LastUpdated
                label={t('label.fetchedAt')}
                iso={status?.timestamps.fetchedAt}
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
