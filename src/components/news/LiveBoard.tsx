'use client';

import Script from 'next/script';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import { usePathname, useRouter } from '@/i18n/navigation';
import { formatDate, formatDuration, formatKst, formatLocalTime } from '@/lib/format';
import {
  filterPatchImpacts,
  parsePatchImpactFilters,
  projectLiveEntriesToPatchImpacts,
  selectCurrentPatchImpact,
  type PatchImpact,
  type PatchImpactArea,
  type PatchImpactFilters,
} from '@/lib/live/patch-impact';
import {
  computeEventStatus,
  isCurrentEvent,
  latestPublicFeedEntries,
  matchesFilter,
  newsEntryAnchorId,
  publicFeedEntries,
  remainingMs,
  situationEntries,
  type FeedFilter,
} from '@/lib/live/status';
import type { EventStatus, FeedFreshness, LiveEntry, LiveFeed, ReliabilityLevel } from '@/types/live';
import {
  CurrentPatchSummaryCard,
  ImpactAreaFilterRow,
  PatchImpactBlock,
} from '@/components/news/PatchImpactBlock';

/**
 * The Tarkov Live board: a "what is happening right now" panel over a
 * filtered feed.
 *
 * Time handling is the tricky part and is deliberately boring here. The
 * server passes `feed.renderedAt`; the first client render uses that same
 * instant, so server and client markup are identical and hydration can't
 * mismatch. Only after mount does a 1s timer start moving the clock — and
 * even then, status comes from the same pure `computeEventStatus` the server
 * used, so the badge and the countdown can never tell different stories.
 *
 * `lastCheckedAt` is a separate value on purpose: it is when collection last
 * *succeeded*, not when this page was rendered. The two used to be the same
 * number, which meant a board built from an hours-old collection still claimed
 * to have just checked — and then reported "no events running" as if that were
 * a finding rather than a gap.
 */

const FILTERS: FeedFilter[] = ['all', 'active_events', 'twitter', 'official', 'status', 'ended'];
const TWITTER_PAGE_SIZE = 5;
const LIVE_REFRESH_MS = 5 * 60 * 1000;
const TWITTER_WIDGET_LANGUAGE: Record<Locale, string> = {
  ko: 'ko',
  en: 'en',
  zh: 'zh-cn',
};

/** The reader's own timezone, detected client-side only — the server has no
 * way to know it. Null until mount so the first client render still matches
 * the server's (KST-only) markup; the local-time line simply appears a beat
 * after hydration instead of ever mismatching it. */
function useLocalTimeZone(): string | null {
  const [zone, setZone] = useState<string | null>(null);
  useEffect(() => {
    try {
      setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      // Some environments (very old browsers) don't support this — the local
      // time line just never appears, KST remains the source of truth.
    }
  }, []);
  return zone;
}

const STATUS_CLASS: Record<EventStatus, string> = {
  ending_soon: 'border-accent bg-accent/10 text-accent',
  active: 'border-accent/50 text-accent',
  scheduled: 'border-border text-fg',
  ended: 'border-border text-muted',
  unknown: 'border-border text-muted',
};

const RELIABILITY_CLASS: Record<ReliabilityLevel, string> = {
  official_confirmed: 'border-accent/50 text-accent',
  official_statement: 'border-border text-fg',
  developer_hint: 'border-border text-muted',
  tarkovdex_inference: 'border-border text-muted',
  unverified: 'border-border text-muted',
};

function Chip({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs ${className || 'border-border text-muted'}`}
    >
      {children}
    </span>
  );
}

function SourceLink({ entry, label }: { entry: LiveEntry; label: string }) {
  if (!entry.url) return null;
  return (
    <a
      href={entry.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-touch items-center gap-1.5 text-xs text-muted underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <ExternalLink className="size-3.5" aria-hidden="true" />
      {label}
    </a>
  );
}

/** Countdown / window line. Never renders a guessed end time: when `endsAt`
 * is unconfirmed it says so in words instead. */
function Timing({
  entry,
  status,
  now,
  locale,
  localTz,
}: {
  entry: LiveEntry;
  status: EventStatus;
  now: number | null;
  locale: Locale;
  localTz: string | null;
}) {
  const t = useTranslations('live');
  const startsAt = formatKst(entry.startsAt, locale);
  const endsAt = formatKst(entry.endsAt, locale);
  // Only shown once mounted and only when it says something KST doesn't
  // already say — a KST reader doesn't need their own time repeated back.
  const showLocal = Boolean(localTz && localTz !== 'Asia/Seoul');
  const startsAtLocal = showLocal ? formatLocalTime(entry.startsAt, locale, localTz as string) : null;
  const endsAtLocal = showLocal ? formatLocalTime(entry.endsAt, locale, localTz as string) : null;
  const remaining = now == null ? null : remainingMs(entry, status, now);
  // Only count down toward a time that actually exists. Without this, an event
  // whose end was never announced would show "남은 시간: 시간 확인 중", which
  // reads as "loading" when the truth is "nobody said" — already stated one
  // line above.
  const hasTarget = Boolean(status === 'scheduled' ? entry.startsAt : entry.endsAt);

  if (!startsAt && !endsAt) return null;

  return (
    <dl className="mt-3 space-y-1 text-xs text-muted">
      {startsAt ? (
        <div className="flex flex-wrap gap-x-2">
          <dt className="shrink-0">{t('startsAt')}</dt>
          <dd className="text-fg">
            {startsAt}
            {startsAtLocal ? <span className="text-muted"> · {startsAtLocal}</span> : null}
          </dd>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-x-2">
        <dt className="shrink-0">{t('endsAt')}</dt>
        <dd className={endsAt ? 'text-fg' : 'text-muted'}>
          {endsAt ?? t('endUnknown')}
          {endsAtLocal ? <span className="text-muted"> · {endsAtLocal}</span> : null}
        </dd>
      </div>
      {hasTarget && status !== 'ended' && status !== 'unknown' ? (
        <div className="flex flex-wrap gap-x-2">
          <dt className="shrink-0">{status === 'scheduled' ? t('startsIn') : t('remaining')}</dt>
          <dd className="min-w-[9ch] tabular-nums text-fg">
            {remaining == null ? t('checkingTime') : formatDuration(remaining)}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function Badges({ entry, status }: { entry: LiveEntry; status: EventStatus }) {
  const t = useTranslations('live');
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip className={STATUS_CLASS[status]}>{t(`status.${status}`)}</Chip>
      {entry.gameModes.map((mode) => (
        <Chip key={mode}>{t(`modes.${mode}`)}</Chip>
      ))}
      <Chip className={RELIABILITY_CLASS[entry.reliability]}>
        <span title={t(`reliabilityHint.${entry.reliability}`)} className="inline-flex items-center gap-1">
          {t(`reliability.${entry.reliability}`)}
          <Info className="size-3" aria-hidden="true" />
        </span>
      </Chip>
      {entry.reviewStatus === 'pending_review' ? <Chip>{t('pendingReview')}</Chip> : null}
    </div>
  );
}

const PREVIEW_LENGTH = 160;

function SituationCard({
  entry,
  now,
  locale,
  localTz,
  impact,
}: {
  entry: LiveEntry;
  now: number | null;
  locale: Locale;
  localTz: string | null;
  impact: PatchImpact | null;
}) {
  const t = useTranslations('live');
  const status = computeEventStatus(entry, now ?? Date.parse(entry.lastCheckedAt));
  const body =
    entry.summary ??
    (entry.content.length > PREVIEW_LENGTH
      ? `${entry.content.slice(0, PREVIEW_LENGTH).trim()}…`
      : entry.content);

  return (
    <article
      id={newsEntryAnchorId(entry.id)}
      className="scroll-mt-24 rounded-lg border border-border bg-surface p-4 target:border-accent/50"
    >
      <Badges entry={entry} status={status} />
      <h3 className="mt-3 text-sm text-fg">{entry.title}</h3>
      {body ? <p className="mt-1.5 whitespace-pre-line text-xs text-muted">{body}</p> : null}

      <Timing entry={entry} status={status} now={now} locale={locale} localTz={localTz} />

      {entry.affects.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.affects.map((area) => (
            <Chip key={area}>{t(`affects.${area}`)}</Chip>
          ))}
        </div>
      ) : null}

      {impact ? <PatchImpactBlock impact={impact} /> : null}

      {entry.playerImpact ? (
        <p className="mt-3 text-xs text-muted">
          <span className="text-fg">{t('playerImpact')}</span> {entry.playerImpact}
        </p>
      ) : null}
      {entry.recommendedAction ? (
        <p className="mt-1 text-xs text-muted">
          <span className="text-fg">{t('recommendedAction')}</span> {entry.recommendedAction}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4">
        <span className="text-xs text-muted">
          {t(`sourceLabel.${entry.source}`)}
          {entry.account ? ` ${entry.account}` : ''}
          {entry.confirmations.length > 0
            ? ` · ${t('alsoReportedBy', { count: entry.confirmations.length })}`
            : ''}
        </span>
        <SourceLink entry={entry} label={t('viewSource')} />
      </div>
    </article>
  );
}

function FeedRow({
  entry,
  now,
  locale,
  localTz,
  impact,
}: {
  entry: LiveEntry;
  now: number | null;
  locale: Locale;
  localTz: string | null;
  impact: PatchImpact | null;
}) {
  const t = useTranslations('live');
  const [open, setOpen] = useState(false);
  const anchorId = newsEntryAnchorId(entry.id);
  const status = computeEventStatus(entry, now ?? Date.parse(entry.lastCheckedAt));
  const preview =
    entry.content.length > PREVIEW_LENGTH
      ? `${entry.content.slice(0, PREVIEW_LENGTH).trim()}…`
      : entry.content;

  useEffect(() => {
    if (window.location.hash === `#${anchorId}`) setOpen(true);
  }, [anchorId]);

  return (
    <div
      id={anchorId}
      className="scroll-mt-24 border-b border-border/60 target:bg-accent/5 last:border-0"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <div className="min-w-0 flex-1">
          <Badges entry={entry} status={status} />
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-sm text-fg">{entry.title}</span>
            <span className="shrink-0 text-xs text-muted">{formatDate(entry.publishedAt, locale)}</span>
          </div>
          {!open && preview ? <p className="mt-1.5 text-xs text-muted">{preview}</p> : null}
        </div>
        <ChevronDown
          className={`mt-0.5 size-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="px-4 pb-4">
          {entry.summary ? <p className="text-sm text-fg">{entry.summary}</p> : null}
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{entry.content}</p>
          {!entry.translated && locale !== 'en' ? (
            <p className="mt-2 text-xs text-muted">{t('translationPending')}</p>
          ) : null}

          <Timing entry={entry} status={status} now={now} locale={locale} localTz={localTz} />
          {impact ? <PatchImpactBlock impact={impact} /> : null}

          {entry.playerImpact ? (
            <p className="mt-3 text-xs text-muted">
              <span className="text-fg">{t('playerImpact')}</span> {entry.playerImpact}
            </p>
          ) : null}
          {entry.recommendedAction ? (
            <p className="mt-1 text-xs text-muted">
              <span className="text-fg">{t('recommendedAction')}</span> {entry.recommendedAction}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4">
            <span className="text-xs text-muted">
              {t(`sourceLabel.${entry.source}`)}
              {entry.account ? ` ${entry.account}` : ''}
            </span>
            <SourceLink entry={entry} label={t('viewSource')} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** X posts are short and stay expanded; linked YouTube trailers can be played
 * directly without a second disclosure click. */
function TwitterFeedCard({
  entry,
  locale,
  now,
}: {
  entry: LiveEntry;
  locale: Locale;
  now: number | null;
}) {
  const t = useTranslations('live');
  const status = computeEventStatus(entry, now ?? Date.parse(entry.lastCheckedAt));
  const youtubeId = entry.youtubeVideoId && /^[A-Za-z0-9_-]{11}$/.test(entry.youtubeVideoId)
    ? entry.youtubeVideoId
    : null;

  return (
    <article
      id={newsEntryAnchorId(entry.id)}
      className="scroll-mt-24 border-b border-border/60 p-4 target:bg-accent/5 last:border-0"
    >
      <Badges entry={entry} status={status} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span
            className="inline-flex size-6 items-center justify-center rounded bg-fg font-semibold text-bg"
            aria-hidden="true"
          >
            X
          </span>
          <span className="font-medium text-fg">{t(`sourceLabel.${entry.source}`)}</span>
          <span className="text-muted">{entry.account ?? '@tarkov'}</span>
        </div>
        <time dateTime={entry.publishedAt} className="text-xs text-muted">
          {formatDate(entry.publishedAt, locale)}
        </time>
      </div>

      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-fg">{entry.content}</p>
      {!entry.translated && locale !== 'en' ? (
        <p className="mt-2 text-xs text-muted">{t('translationPending')}</p>
      ) : null}

      {youtubeId ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
            title={`${entry.title} - ${t('youtubeVideo')}`}
            className="aspect-video w-full"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4">
        <span className="text-xs text-muted">{t(`sourceLabel.${entry.source}`)}</span>
        <SourceLink entry={entry} label={t('viewSource')} />
      </div>
    </article>
  );
}

/** Official client-side timeline fallback. X sometimes blocks its public
 * syndication response from data-center IPs; the official widget still loads
 * in the reader's browser and keeps the latest five posts live without a
 * metered API token or a server-side scraping proxy. */
function OfficialTwitterTimeline({ locale }: { locale: Locale }) {
  const t = useTranslations('live');
  const containerRef = useRef<HTMLDivElement>(null);
  const loadWidget = () => {
    const twitter = (window as typeof window & {
      twttr?: { widgets?: { load: (element?: HTMLElement) => void } };
    }).twttr;
    twitter?.widgets?.load(containerRef.current ?? undefined);
  };

  return (
    <div ref={containerRef} className="mt-3 overflow-hidden rounded-lg border border-border bg-surface p-3">
      <a
        className="twitter-timeline"
        data-lang={TWITTER_WIDGET_LANGUAGE[locale]}
        data-dnt="true"
        data-theme="dark"
        data-tweet-limit="5"
        href="https://twitter.com/tarkov"
      >
        {t('officialTwitter')}
      </a>
      <Script
        id="official-twitter-timeline"
        src="https://platform.twitter.com/widgets.js"
        strategy="lazyOnload"
        onReady={loadWidget}
      />
      <div className="mt-3 border-t border-border/60 pt-3 text-center">
        <a
          href="https://x.com/tarkov"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-touch items-center gap-1.5 rounded-lg border border-border px-4 text-xs text-muted hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {t('loadMoreTwitterProfile')}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

/** Collection health, shown only when there is something to say. `ok` and
 * `unmanaged` render nothing — a banner that is always there is wallpaper. */
function FreshnessNotice({ freshness, sources }: { freshness: FeedFreshness; sources: string[] }) {
  const t = useTranslations('live');
  if (freshness === 'ok' || freshness === 'unmanaged') return null;
  return (
    <p className="mt-3 rounded-lg border border-border px-4 py-3 text-xs text-muted">
      {freshness === 'partial'
        ? t('degradedNotice', { sources: sources.join(', ') })
        : t(`freshness.${freshness}`)}
    </p>
  );
}

export function LiveBoard({ feed, locale }: { feed: LiveFeed; locale: Locale }) {
  const t = useTranslations('live');
  const tImpact = useTranslations('patchImpact');
  const router = useRouter();
  const pathname = usePathname();
  const serverNow = Date.parse(feed.renderedAt);
  // When collection is behind, "no events" is not a finding — say which it is.
  const uncertain = feed.freshness === 'stale' || feed.freshness === 'down' || feed.freshness === 'never';
  // null until mount: the first client render must match the server's, so the
  // clock only starts ticking afterwards.
  const [now, setNow] = useState<number | null>(null);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [twitterLimit, setTwitterLimit] = useState(TWITTER_PAGE_SIZE);
  const localTz = useLocalTimeZone();
  // URL filters are applied after mount so this ISR page can still SSR the
  // impact UI. useSearchParams() would force a client-only Suspense fallback.
  const [urlFilters, setUrlFilters] = useState<PatchImpactFilters>({
    area: 'all',
    mode: 'all',
    kind: 'all',
    state: 'all',
    review: 'all',
  });
  const [areaFilter, setAreaFilter] = useState<PatchImpactArea | 'all'>('all');

  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      const parsed = parsePatchImpactFilters({
        area: params.get('area'),
        mode: params.get('mode'),
        type: params.get('type'),
        kind: params.get('kind'),
        state: params.get('state'),
        review: params.get('review'),
      });
      setUrlFilters(parsed);
      setAreaFilter(parsed.area ?? 'all');
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = setInterval(refresh, LIVE_REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);

  const effectiveNow = now ?? serverNow;
  const impacts = useMemo(
    () =>
      projectLiveEntriesToPatchImpacts(feed.entries, {
        now: effectiveNow,
        // News render does not fetch price catalogs; never invent reflection.
        observations: [],
      }),
    [feed.entries, effectiveNow],
  );
  const impactByEntryId = useMemo(() => {
    const map = new Map<string, PatchImpact>();
    for (const impact of impacts) map.set(impact.liveEntryId, impact);
    return map;
  }, [impacts]);
  const currentPatch = useMemo(() => selectCurrentPatchImpact(impacts), [impacts]);

  const visible = useMemo(
    () => publicFeedEntries(feed.entries, effectiveNow),
    [feed.entries, effectiveNow],
  );
  const situation = useMemo(() => situationEntries(visible, effectiveNow), [visible, effectiveNow]);
  const situationIds = useMemo(
    () => new Set(situation.map((entry) => entry.id)),
    [situation],
  );
  // Said explicitly even when the panel has cards: a patch card is not an
  // answer to "is anything running right now".
  const hasCurrentEvent = situation.some((entry) =>
    isCurrentEvent(computeEventStatus(entry, effectiveNow)),
  );
  const availableFilters = useMemo(
    () => FILTERS.filter(
      (value) =>
        (value !== 'active_events' && value !== 'ended') ||
        visible.some((entry) => matchesFilter(entry, value, effectiveNow)),
    ),
    [visible, effectiveNow],
  );
  // If the last active event ends while its tab is selected, fall back to All
  // as derived render state. This avoids an effect-driven second render and
  // never leaves the reader stranded on a filter whose tab just disappeared.
  const selectedFilter = availableFilters.includes(filter) ? filter : 'all';

  const impactFilteredIds = useMemo(() => {
    const filtered = filterPatchImpacts(impacts, {
      ...urlFilters,
      area: areaFilter,
    });
    return new Set(filtered.map((item) => item.liveEntryId));
  }, [impacts, urlFilters, areaFilter]);

  const listed = useMemo(
    () => {
      const matching = visible.filter((entry) => matchesFilter(entry, selectedFilter, effectiveNow));
      const withoutFeatured = selectedFilter === 'all'
        ? matching.filter((entry) => !situationIds.has(entry.id))
        : matching;
      const impactScoped =
        areaFilter === 'all' && (!urlFilters.mode || urlFilters.mode === 'all')
          ? withoutFeatured
          : withoutFeatured.filter((entry) => impactFilteredIds.has(entry.id));
      return selectedFilter === 'all' || selectedFilter === 'twitter'
        ? latestPublicFeedEntries(impactScoped)
        : impactScoped;
    },
    [
      visible,
      selectedFilter,
      effectiveNow,
      situationIds,
      areaFilter,
      urlFilters.mode,
      impactFilteredIds,
    ],
  );
  const displayed = selectedFilter === 'twitter' ? listed.slice(0, twitterLimit) : listed;
  const hiddenTwitterCount = selectedFilter === 'twitter'
    ? Math.max(0, listed.length - displayed.length)
    : 0;
  const useOfficialTwitterWidget = selectedFilter === 'twitter' && listed.length === 0;

  const availableAreas = useMemo(() => {
    const areas = new Set<PatchImpactArea>();
    for (const impact of impacts) {
      for (const area of impact.impactAreas) areas.add(area);
    }
    return ['all' as const, ...[...areas].sort()];
  }, [impacts]);

  const replaceAreaQuery = (next: PatchImpactArea | 'all') => {
    setAreaFilter(next);
    const params = new URLSearchParams(window.location.search);
    if (next === 'all') params.delete('area');
    else params.set('area', next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-medium text-fg">{t('situationTitle')}</h2>
          <span className="text-xs text-muted">
            {t('lastChecked')} {formatKst(feed.lastCheckedAt, locale) ?? t('lastCheckedNever')}
          </span>
        </div>

        <FreshnessNotice
          freshness={feed.freshness}
          sources={feed.degradedSources.map((source) => t(`sourceLabel.${source}`))}
        />

        <CurrentPatchSummaryCard impact={currentPatch} />

        {hasCurrentEvent ? null : (
          <p
            className={`mt-3 rounded-lg border border-border px-4 text-center text-sm text-muted ${
              situation.length > 0 ? 'py-4' : 'py-12'
            }`}
          >
            {uncertain ? t('eventsUncertain') : t('noActiveEvents')}
          </p>
        )}

        {situation.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {situation.map((entry) => (
              <SituationCard
                key={entry.id}
                entry={entry}
                now={now}
                locale={locale}
                localTz={localTz}
                impact={impactByEntryId.get(entry.id) ?? null}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-fg">{t('feedTitle')}</h2>
          <a
            href="https://x.com/tarkov"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-touch items-center gap-1.5 text-xs text-muted underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {t('viewTwitterProfile')}
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </div>
        <p className="mt-1 text-xs text-muted">{tImpact('filterHint')}</p>
        <div className="mt-3">
          <ImpactAreaFilterRow
            value={areaFilter}
            onChange={replaceAreaQuery}
            available={availableAreas}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {availableFilters.map((value) => {
            const selected = selectedFilter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFilter(value);
                  if (value === 'twitter') setTwitterLimit(TWITTER_PAGE_SIZE);
                }}
                aria-pressed={selected}
                className={`inline-flex min-h-touch items-center rounded-lg border px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                  selected
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-muted hover:text-fg'
                }`}
              >
                {t(`filters.${value}`)}
              </button>
            );
          })}
        </div>

        {useOfficialTwitterWidget ? (
          <OfficialTwitterTimeline locale={locale} />
        ) : displayed.length === 0 ? (
          selectedFilter === 'all' && situation.length > 0 ? null : (
            <p className="mt-4 rounded-lg border border-border px-4 py-12 text-center text-sm text-muted">
              {t('empty')}
            </p>
          )
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
            {displayed.map((entry) =>
              entry.source === 'official_x' || entry.source === 'nikita_x' || selectedFilter === 'twitter' ? (
                <TwitterFeedCard key={entry.id} entry={entry} locale={locale} now={now} />
              ) : (
                <FeedRow
                  key={entry.id}
                  entry={entry}
                  now={now}
                  locale={locale}
                  localTz={localTz}
                  impact={impactByEntryId.get(entry.id) ?? null}
                />
              ),
            )}
            {hiddenTwitterCount > 0 ? (
              <div className="p-3 text-center">
                <button
                  type="button"
                  onClick={() => setTwitterLimit((value) => value + TWITTER_PAGE_SIZE)}
                  className="inline-flex min-h-touch items-center rounded-lg border border-border px-4 text-xs text-muted hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  {t('loadMoreTwitter', { count: hiddenTwitterCount })}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
