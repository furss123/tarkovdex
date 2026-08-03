import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Database,
  History,
  Inbox,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import { formatKst, formatRelativeTime } from '@/lib/format';
import type { DataHealth, DataStatusSummary } from '@/lib/data-status';
import { summarizeHealth } from '@/lib/data-status';

/**
 * Shared data-trust UI. No `'use client'` on purpose: none of these hold state,
 * and `useTranslations` resolves to next-intl's server implementation inside a
 * Server Component and its client one inside a Client Component, so the same
 * component works on both sides of the boundary and the site has exactly one
 * status vocabulary instead of one per page.
 *
 * Design rules that are not negotiable here:
 * - status is never carried by colour alone; every state has an icon and text
 * - detail is never tooltip-only (`title=`), because touch has no hover
 * - times go through `formatKst` (pinned zone, hydration-safe) or through
 *   `formatRelativeTime` with a caller-supplied `now`, never `toLocaleString`
 */

const SUMMARY_ICON: Record<DataStatusSummary, typeof CheckCircle2> = {
  ok: CheckCircle2,
  partial: AlertTriangle,
  delayed: Clock3,
  stale: History,
  previous: History,
  unavailable: XCircle,
  unknownAge: CircleHelp,
};

/** Neutral by default; the accent is reserved for degradation and the negative
 * hue only for "cannot show you this", per the one-accent design rule. */
const SUMMARY_TONE: Record<DataStatusSummary, string> = {
  ok: 'border-border bg-surface text-muted',
  partial: 'border-accent/40 bg-accent/10 text-accent',
  delayed: 'border-accent/40 bg-accent/10 text-accent',
  stale: 'border-accent/40 bg-accent/10 text-accent',
  previous: 'border-accent/40 bg-accent/10 text-accent',
  unavailable: 'border-negative/40 bg-negative/10 text-negative',
  unknownAge: 'border-border bg-surface text-muted',
};

export function DataStatusBadge({
  summary,
  health,
}: {
  summary?: DataStatusSummary;
  health?: DataHealth;
}) {
  const t = useTranslations('status');
  const resolved = summary ?? (health ? summarizeHealth(health) : 'unknownAge');
  const Icon = SUMMARY_ICON[resolved];
  return (
    <span
      className={`inline-flex min-h-touch max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-[14px] leading-5 ${SUMMARY_TONE[resolved]}`}
    >
      <Icon className="size-[14px] shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{t(`summary.${resolved}`)}</span>
    </span>
  );
}

/**
 * One labelled timestamp. `iso` being null is a first-class answer — it renders
 * "cannot be determined", never the current time and never a zero.
 *
 * Pass `now` (a server-render instant the client also receives) to get a
 * relative string; without it this stays on the absolute, timezone-pinned form
 * so server and client markup agree.
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
  icon: typeof AlertTriangle;
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

/** Shown when the value on screen came from the stale-on-error path — the case
 * that was previously indistinguishable from a fresh render. */
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

export function PartialDataNotice({
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
      icon={AlertTriangle}
      title={message ?? t('partialNotice')}
      hint={hint}
      action={action}
    />
  );
}

/**
 * Confirms an action completed (import applied, reset finished, and similar
 * future one-shot confirmations). Deliberately not the green `positive`
 * token — that hue is reserved for signed price deltas only (see CLAUDE.md's
 * design system), not decoration — so this uses the same neutral/accent
 * family as every other notice, distinguished by its check icon and copy
 * rather than by color.
 */
export function SuccessNotice({ message, hint }: { message: string; hint?: string }) {
  return (
    <Notice
      tone="border-border bg-surface text-fg"
      icon={CheckCircle2}
      title={message}
      hint={hint}
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

/**
 * Provider / cache policy / fallback detail. A native `<details>` rather than a
 * hover tooltip or a JS popover: it works on touch, needs no client bundle, and
 * is keyboard reachable for free.
 */
export function DataSourcePopover({
  provider,
  cachePolicy,
  fallbackBehavior,
  sourceUrl,
  children,
}: {
  provider: string;
  cachePolicy: string;
  fallbackBehavior: string;
  sourceUrl?: string;
  children?: ReactNode;
}) {
  const t = useTranslations('status');
  return (
    <details className="group inline-block max-w-full align-top">
      <summary className="flex min-h-touch cursor-pointer list-none items-center gap-1.5 rounded text-[14px] leading-5 text-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
        <Database className="size-[14px] shrink-0" aria-hidden="true" />
        {t('sourceDetails')}
      </summary>
      <div className="mt-2 max-w-md rounded-lg border border-border bg-surface px-4 py-3 text-[14px] leading-5 text-muted">
        <dl className="space-y-1.5">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-fg">{t('label.provider')}</dt>
            <dd className="min-w-0 break-words">
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-touch items-center rounded underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  {provider}
                </a>
              ) : (
                provider
              )}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-fg">{t('label.cachePolicy')}</dt>
            <dd className="min-w-0 break-words">{cachePolicy}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-fg">{t('label.fallback')}</dt>
            <dd className="min-w-0 break-words">{fallbackBehavior}</dd>
          </div>
        </dl>
        {children}
      </div>
    </details>
  );
}
