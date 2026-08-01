import type { FeedFreshness, LiveSourceHealth } from '@/types/live';

/**
 * How current the board is, as a pure function of the stored source states —
 * separate from `feed.ts` (which is `server-only`) so the distinction that
 * matters most here is actually testable.
 *
 * The MVP could not tell these apart: it reported the render time as the check
 * time, so a page built from an hours-old collection still said it had just
 * looked, and then reported "no events running" as if that were a finding.
 */
export function freshnessOf(
  sources: LiveSourceHealth[],
  now: number,
  staleAfterMs: number,
): FeedFreshness {
  // A source that is switched off is a deployment choice, not a fault, and must
  // not be able to make the board look broken.
  const active = sources.filter((source) => source.enabled);
  if (active.length === 0) return 'never';

  const succeeded = active.filter((source) => source.lastSuccessAt != null);
  if (succeeded.length === 0) return 'never';

  const failing = active.filter((source) => source.consecutiveFailures > 0);
  if (failing.length === active.length) return 'down';

  const newest = Math.max(...succeeded.map((source) => Date.parse(source.lastSuccessAt as string)));
  if (!Number.isFinite(newest) || now - newest > staleAfterMs) return 'stale';
  return failing.length > 0 ? 'partial' : 'ok';
}
