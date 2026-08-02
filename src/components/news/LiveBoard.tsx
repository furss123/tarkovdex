'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import { formatDate, formatDuration, formatKst, formatLocalTime } from '@/lib/format';
import {
  computeEventStatus,
  isCurrentEvent,
  matchesFilter,
  remainingMs,
  situationEntries,
  sortLiveEntries,
  type FeedFilter,
} from '@/lib/live/status';
import type { EventStatus, FeedFreshness, LiveEntry, LiveFeed, ReliabilityLevel } from '@/types/live';

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

const FILTERS: FeedFilter[] = ['all', 'active_events', 'developer', 'official', 'status', 'ended'];

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
}: {
  entry: LiveEntry;
  now: number | null;
  locale: Locale;
  localTz: string | null;
}) {
  const t = useTranslations('live');
  const status = computeEventStatus(entry, now ?? Date.parse(entry.lastCheckedAt));
  const body =
    entry.summary ??
    (entry.content.length > PREVIEW_LENGTH
      ? `${entry.content.slice(0, PREVIEW_LENGTH).trim()}…`
      : entry.content);

  return (
    <article className="rounded-lg border border-border bg-surface p-4">
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
}: {
  entry: LiveEntry;
  now: number | null;
  locale: Locale;
  localTz: string | null;
}) {
  const t = useTranslations('live');
  const [open, setOpen] = useState(false);
  const status = computeEventStatus(entry, now ?? Date.parse(entry.lastCheckedAt));
  const preview =
    entry.content.length > PREVIEW_LENGTH
      ? `${entry.content.slice(0, PREVIEW_LENGTH).trim()}…`
      : entry.content;

  return (
    <div className="border-b border-border/60 last:border-0">
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
  const serverNow = Date.parse(feed.renderedAt);
  // When collection is behind, "no events" is not a finding — say which it is.
  const uncertain = feed.freshness === 'stale' || feed.freshness === 'down' || feed.freshness === 'never';
  // null until mount: the first client render must match the server's, so the
  // clock only starts ticking afterwards.
  const [now, setNow] = useState<number | null>(null);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const localTz = useLocalTimeZone();

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const effectiveNow = now ?? serverNow;
  const visible = useMemo(
    () => feed.entries.filter((entry) => entry.reviewStatus !== 'rejected'),
    [feed.entries],
  );
  const situation = useMemo(() => situationEntries(visible, effectiveNow), [visible, effectiveNow]);
  // Said explicitly even when the panel has cards: a patch card is not an
  // answer to "is anything running right now".
  const hasCurrentEvent = situation.some((entry) =>
    isCurrentEvent(computeEventStatus(entry, effectiveNow)),
  );
  const listed = useMemo(
    () => sortLiveEntries(visible.filter((entry) => matchesFilter(entry, filter, effectiveNow)), effectiveNow),
    [visible, filter, effectiveNow],
  );

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
              <SituationCard key={entry.id} entry={entry} now={now} locale={locale} localTz={localTz} />
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="text-sm font-medium text-fg">{t('feedTitle')}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`min-h-touch rounded-lg border px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                filter === value
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-muted hover:text-fg'
              }`}
            >
              {t(`filters.${value}`)}
            </button>
          ))}
        </div>

        {listed.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            {listed.map((entry) => (
              <FeedRow key={entry.id} entry={entry} now={now} locale={locale} localTz={localTz} />
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-border px-4 py-12 text-center text-sm text-muted">
            {t('empty')}
          </p>
        )}
      </section>
    </div>
  );
}
