import type { ReactNode } from 'react';
import { Clock3, History, Inbox, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import { formatKst, formatRelativeTime } from '@/lib/format';

/**
 * Shared data-trust UI. No `'use client'` on purpose: none of these hold state,
 * and `useTranslations` resolves to next-intl's server implementation inside a
 * Server Component and its client one inside a Client Component, so the same
 * component works on both sides of the boundary and the site has exactly one
 * status vocabulary instead of one per surface.
 *
 * Design rules that are not negotiable here:
 * - status is never carried by colour alone; every state has an icon and text
 * - detail is never tooltip-only (`title=`), because touch has no hover
 * - times go through `formatKst` (pinned zone, hydration-safe) or through
 *   `formatRelativeTime` with a caller-supplied `now`, never `toLocaleString`
 *
 * Scope note (single-page redesign): the status badge, source popover, partial
 * notice and success notice were removed with the `/status` route that was
 * their only remaining consumer.
 */

/**
 * One labelled timestamp. `iso` being null is a first-class answer — it renders
 * "cannot be determined", never the current time and never a zero.
 *
 * Pass `now` (an instant both sides agree on) to get a relative string;
 * without it this stays on the absolute, timezone-pinned form so server and
 * client markup agree.
 */
export function LastUpdated({
  label,
  iso,
  locale,
  now,
  unknownLabel,
}: {
  label: string;
  iso?: string | null;
  locale: Locale;
  now?: number;
  unknownLabel?: string;
}) {
  const t = useTranslations('status');
  const absolute = formatKst(iso, locale);
  const value =
    absolute == null
      ? (unknownLabel ?? t('unknownTime'))
      : now != null
        ? `${formatRelativeTime(iso, locale, now)} · ${absolute}`
        : absolute;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[14px] leading-5 text-muted">
      <Clock3 className="size-[14px] shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">
        {label}: {iso && absolute ? <time dateTime={iso}>{value}</time> : value}
      </span>
    </span>
  );
}

function Notice({
  tone,
  icon: Icon,
  title,
  hint,
  action,
  alert = false,
}: {
  tone: string;
  icon: typeof XCircle;
  title: string;
  hint?: string;
  action?: ReactNode;
  alert?: boolean;
}) {
  return (
    <div
      {...(alert ? { role: 'alert' } : { role: 'status' })}
      className={`flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border px-4 py-3 text-[14px] leading-5 ${tone}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="break-words">{title}</p>
        {hint ? <p className="mt-1 break-words text-muted">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Shown when the value on screen rests on prices old enough that acting on
 * them is a different decision from acting on current ones. */
export function StaleDataNotice({
  message,
  hint,
  action,
}: {
  message?: string;
  hint?: string;
  action?: ReactNode;
}) {
  const t = useTranslations('status');
  return (
    <Notice
      tone="border-accent/40 bg-accent/5 text-fg"
      icon={History}
      title={message ?? t('previousNotice')}
      hint={hint ?? t('instanceNotice')}
      action={action}
    />
  );
}

/** A genuine "nothing matched" — neutral, never an alert, and visually distinct
 * from ErrorState so the two can never be confused. */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
}) {
  const t = useTranslations('status');
  return (
    <div className="rounded-lg border border-border px-4 py-10 text-center text-[14px] leading-5 text-muted">
      <Inbox className="mx-auto size-5 text-muted" aria-hidden="true" />
      <p className="mt-2 break-words text-fg">{title ?? t('emptyResult')}</p>
      {hint ? <p className="mt-1 break-words">{hint}</p> : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** A failure. Never receives an exception message — callers pass a translated
 * string only. */
export function ErrorState({
  title,
  hint,
  action,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
}) {
  const t = useTranslations('status');
  return (
    <Notice
      alert
      tone="border-negative/40 bg-negative/5 text-negative"
      icon={XCircle}
      title={title ?? t('loadFailed')}
      hint={hint}
      action={action}
    />
  );
}
