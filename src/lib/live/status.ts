import type { EventStatus, LiveEntry, NewsCategory, NewsSource } from '@/types/live';

/**
 * Pure event-state logic — no I/O, no `server-only`, so the server render and
 * the client countdown call the exact same functions and can't drift.
 */

/** How close to `endsAt` counts as "종료 임박". Configurable in one place
 * rather than sprinkled as a literal through the UI. */
export const ENDING_SOON_MS = 6 * 60 * 60 * 1000;

/** How recent a maintenance/server-status/patch post stays worth showing in
 * the top situation panel. */
export const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function timestamp(iso: string | null): number | null {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? null : value;
}

/**
 * Event status from the entry's (human-curated, never inferred) window.
 *
 * Rules, in order:
 *  - a human-set `status` in the manual store wins outright;
 *  - unparseable/absent start *and* end → `unknown` (never guessed);
 *  - `now < startsAt` → `scheduled`;
 *  - past `endsAt` → `ended`; within `ENDING_SOON_MS` of it → `ending_soon`;
 *  - started with no known end → `active`, and the UI says the end time is
 *    unconfirmed rather than inventing one.
 */
export function computeEventStatus(
  entry: Pick<LiveEntry, 'startsAt' | 'endsAt' | 'manualFields'> & { status?: EventStatus },
  now: number,
  endingSoonMs: number = ENDING_SOON_MS,
): EventStatus {
  if (entry.manualFields.includes('status') && entry.status) return entry.status;

  const start = timestamp(entry.startsAt);
  const end = timestamp(entry.endsAt);

  if (start == null && end == null) return 'unknown';
  if (start != null && now < start) return 'scheduled';
  if (end != null) {
    if (now >= end) return 'ended';
    if (end - now <= endingSoonMs) return 'ending_soon';
    return 'active';
  }
  // Started (or start unknown but an end exists and hasn't passed — handled
  // above), no confirmed end: active, end unconfirmed.
  return start != null ? 'active' : 'unknown';
}

/**
 * `<input type="datetime-local">` gives a wall-clock string with no zone. On
 * this site that field is labelled KST and is typed by a person, which is the
 * *only* path allowed to resolve a timezone — no adapter and no model may.
 * Anything unparseable returns null rather than a guess.
 */
export function kstInputToInstant(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed)
    ? trimmed
    : `${trimmed}${/T\d{2}:\d{2}:\d{2}/.test(trimmed) ? '' : ':00'}+09:00`;
  const parsed = Date.parse(withZone);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/** The inverse, for pre-filling that same input from a stored instant. */
export function instantToKstInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

/** Milliseconds until the next state change, or null when there's nothing to
 * count down to (no confirmed end / already ended / unknown window). */
export function remainingMs(
  entry: Pick<LiveEntry, 'startsAt' | 'endsAt'>,
  status: EventStatus,
  now: number,
): number | null {
  const target = status === 'scheduled' ? timestamp(entry.startsAt) : timestamp(entry.endsAt);
  if (target == null) return null;
  const diff = target - now;
  return diff > 0 ? diff : null;
}

/** Publishable = safe to present as fact on the situation panel. Anything a
 * human hasn't signed off on and that isn't a plain official post stays in
 * the feed with its reliability badge instead. */
export function isPublishable(entry: LiveEntry): boolean {
  return entry.reviewStatus === 'auto_published' || entry.reviewStatus === 'reviewed';
}

const CATEGORY_RANK: Record<NewsCategory, number> = {
  event: 0,
  maintenance: 1,
  server_status: 1,
  patch: 2,
  announcement: 3,
  sale: 4,
  developer_comment: 5,
  community: 6,
  unknown: 7,
};

const STATUS_RANK: Record<EventStatus, number> = {
  active: 0,
  ending_soon: 0,
  scheduled: 1,
  unknown: 2,
  ended: 3,
};

/**
 * Feed ordering, per the product brief: running events first, then imminent
 * ends, then upcoming, then outages, then official posts, then dev talk, then
 * anything already over. Within a bucket, newest first.
 */
export function sortLiveEntries(entries: LiveEntry[], now: number): LiveEntry[] {
  const bucket = (entry: LiveEntry): number => {
    const status = computeEventStatus(entry, now);
    if (status === 'ending_soon') return 0;
    if (status === 'active') return 1;
    if (status === 'scheduled') return 2;
    if (entry.category === 'maintenance' || entry.category === 'server_status') return 3;
    if (status === 'ended') return 7;
    if (entry.category === 'patch' || entry.category === 'announcement' || entry.category === 'sale') return 4;
    if (entry.category === 'developer_comment') return 5;
    return 6;
  };

  return [...entries].sort((a, b) => {
    const delta = bucket(a) - bucket(b);
    if (delta !== 0) return delta;
    const statusDelta =
      STATUS_RANK[computeEventStatus(a, now)] - STATUS_RANK[computeEventStatus(b, now)];
    if (statusDelta !== 0) return statusDelta;
    const categoryDelta = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
    if (categoryDelta !== 0) return categoryDelta;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

/** True for the three states that mean "something is happening (or about to)". */
export function isCurrentEvent(status: EventStatus): boolean {
  return status === 'active' || status === 'ending_soon' || status === 'scheduled';
}

/**
 * Entries the top situation panel may present as current fact:
 *  - anything running, ending, or scheduled;
 *  - a recent outage or maintenance notice;
 *  - the newest patch post, regardless of age — "which patch am I on" is a
 *    current-situation question, and the post's own date is shown, so an old
 *    one reads as history rather than as news.
 */
export function situationEntries(entries: LiveEntry[], now: number): LiveEntry[] {
  const publishable = entries.filter(isPublishable);
  const latestPatch = publishable
    .filter((entry) => entry.category === 'patch')
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0];

  return sortLiveEntries(
    publishable.filter((entry) => {
      if (isCurrentEvent(computeEventStatus(entry, now))) return true;
      if (entry === latestPatch) return true;
      const age = now - new Date(entry.publishedAt).getTime();
      return (
        age >= 0 &&
        age <= RECENT_WINDOW_MS &&
        (entry.category === 'maintenance' || entry.category === 'server_status')
      );
    }),
    now,
  );
}

/** Feed tabs. `all` is handled by the caller. */
export type FeedFilter =
  | 'all'
  | 'active_events'
  | 'developer'
  | 'official'
  | 'status'
  | 'ended';

export function matchesFilter(entry: LiveEntry, filter: FeedFilter, now: number): boolean {
  const status = computeEventStatus(entry, now);
  switch (filter) {
    case 'all':
      return true;
    case 'active_events':
      return status === 'active' || status === 'ending_soon' || status === 'scheduled';
    case 'developer':
      return entry.category === 'developer_comment' || entry.source === 'nikita_x';
    case 'official':
      return entry.category === 'patch' || entry.category === 'announcement' || entry.category === 'sale';
    case 'status':
      return entry.category === 'maintenance' || entry.category === 'server_status';
    case 'ended':
      return status === 'ended';
  }
}

/** Display priority when the same announcement arrives from several places —
 * an official patch note outranks a dev's offhand tweet. */
export const SOURCE_PRIORITY: Record<NewsSource, number> = {
  manual: 0,
  steam: 1,
  official_website: 1,
  official_x: 2,
  official_telegram: 3,
  nikita_x: 4,
};
