/**
 * Content-age policy.
 *
 * Scope note (single-page redesign): this was a full domain registry backing
 * the `/status` page — availability, delivery and per-domain provider/cache
 * documentation across ten data domains. That page is gone; the one decision
 * still made from here is whether a craft's contributing prices are recent
 * enough to rank as actionable, so only that survives.
 *
 * The thresholds are unchanged from the registry's `crafts` entry: 12 hours to
 * a warning, 24 hours to stale — the same window the flea market itself uses.
 */

export type FreshnessStatus = 'fresh' | 'warning' | 'stale' | 'unknown';

const HOUR = 60 * 60 * 1000;

/** A stamp slightly ahead of us is clock skew, not a future document. Beyond
 * this we refuse to judge rather than report a negative age as "fresh". */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export interface FreshnessPolicy {
  warningAfterMs: number;
  staleAfterMs: number;
}

export const CRAFT_FRESHNESS: FreshnessPolicy = {
  warningAfterMs: 12 * HOUR,
  staleAfterMs: 24 * HOUR,
};

/**
 * Content age from an upstream timestamp. Returns `unknown` — never a guess —
 * when there is no timestamp, it does not parse, or it is implausibly in the
 * future. `unknown` is deliberately not treated as fresh by callers: an age we
 * cannot establish must not be presented as a current one.
 */
export function contentFreshness({
  sourceUpdatedAt,
  warningAfterMs,
  staleAfterMs,
  now,
}: {
  sourceUpdatedAt?: string | null;
  warningAfterMs?: number;
  staleAfterMs?: number;
  now: number;
}): FreshnessStatus {
  if (!sourceUpdatedAt) return 'unknown';
  if (warningAfterMs == null || staleAfterMs == null) return 'unknown';
  const parsed = Date.parse(sourceUpdatedAt);
  if (!Number.isFinite(parsed)) return 'unknown';
  const age = now - parsed;
  if (age < -FUTURE_TOLERANCE_MS) return 'unknown';
  if (age >= staleAfterMs) return 'stale';
  if (age >= warningAfterMs) return 'warning';
  return 'fresh';
}
