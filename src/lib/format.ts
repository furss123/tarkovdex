import type { Locale } from '@/i18n/routing';

/** Map app locale to a BCP-47 tag for Intl formatters. */
const INTL_LOCALE: Record<Locale, string> = {
  ko: 'ko-KR',
  zh: 'zh-CN',
  en: 'en-US',
};

/**
 * Format a rouble amount. The number grouping follows the locale, but the ₽
 * symbol is fixed regardless of language (game currency, not the user's money).
 * Returns an em dash for missing values so tables stay aligned.
 */
export function formatRoubles(value: number | null | undefined, locale: Locale): string {
  if (value == null) return '—';
  const n = new Intl.NumberFormat(INTL_LOCALE[locale]).format(value);
  return `₽${n}`;
}

/** Signed whole-rouble value for profit/loss cards. Keeps the project's
 * currency-first convention while making positive and negative values
 * distinguishable without relying on color. */
export function formatSignedRoubles(
  value: number,
  locale: Locale,
): string {
  const n = new Intl.NumberFormat(INTL_LOCALE[locale], {
    signDisplay: 'always',
    maximumFractionDigits: 0,
  }).format(value);
  return `₽${n}`;
}

/** Format a signed percentage (e.g. price change over 48h). */
export function formatPercent(
  value: number | null | undefined,
  locale: Locale,
): string {
  if (value == null) return '—';
  const formatted = new Intl.NumberFormat(INTL_LOCALE[locale], {
    signDisplay: 'exceptZero',
    maximumFractionDigits: 1,
  }).format(value);
  return `${formatted}%`;
}

/**
 * Format a 0–1 fraction as a percentage (e.g. boss spawn chance: 0.14 → "14%").
 * Unlike formatPercent, this expects an unsigned ratio, not an already-scaled
 * signed percentage value.
 */
export function formatChance(value: number | null | undefined, locale: Locale): string {
  if (value == null) return '—';
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a non-negative duration in milliseconds as a digital "H:MM:SS"
 * countdown — deliberately locale-invariant (no translated units) so it reads
 * as a clock face rather than a sentence, for the homepage's live-ticking
 * trader restock countdowns.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/** Absolute "Jul 24, 2026" style date — for content like news/patch-note
 * posts where the exact publish date matters more than a rolling "N days
 * ago" figure. */
export function formatDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * Absolute date+time rendered in Korea Standard Time, whatever the reader's
 * own timezone is — for the Tarkov Live board, where "when does this event
 * end" is the question and a browser-local time would silently differ between
 * the server render and the client.
 *
 * Pinning the zone is also what makes this hydration-safe: `Intl` with an
 * explicit `timeZone` produces identical output on the server and in the
 * browser, unlike `toLocaleString()` with no zone.
 */
export function formatKst(iso: string | null | undefined, locale: Locale): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(date);
  return `${formatted} KST`;
}

/**
 * Absolute date+time in the reader's own browser timezone, with the zone's
 * abbreviation appended (e.g. "PDT", "GMT+9") so it doubles as the answer to
 * "what does that mean in my time". Companion to `formatKst()`: KST is the
 * board's one canonical time, this is a per-visitor convenience alongside it.
 *
 * Deliberately takes `timeZone` as a parameter rather than reading it itself
 * — the browser's zone is only knowable client-side, so callers must detect
 * it after mount (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and
 * render this only then, the same hydration-safe pattern `formatKst()`'s own
 * callers already use for the live countdown.
 */
export function formatLocalTime(
  iso: string | null | undefined,
  locale: Locale,
  timeZone: string,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // `dateStyle`/`timeStyle` cannot be combined with `timeZoneName` per the
  // Intl.DateTimeFormat spec (throws), so this spells out the equivalent
  // component options by hand instead of reusing formatKst's shorthand.
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(date);
}

/** Relative "updated N minutes ago" style string using Intl.RelativeTimeFormat. */
export function formatRelativeTime(
  iso: string | null | undefined,
  locale: Locale,
  now: number,
): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';

  const diffSeconds = Math.round((then - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: 'auto' });

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];

  for (const [unit, secondsInUnit] of units) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return rtf.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }
  return rtf.format(diffSeconds, 'second');
}
