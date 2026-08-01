import type { Locale } from '@/i18n/routing';
import type { NewsSource } from '@/types/live';
import type { RawPost } from './normalize';

/**
 * Per-source failure isolation, kept separate from `feed.ts` (which is
 * `server-only`) so the rule that matters most here — one dead source must
 * never remove another source's posts — is actually testable.
 */
export interface CollectableAdapter {
  source: NewsSource;
  enabled: () => boolean;
  fetch: (locale: Locale) => Promise<RawPost[]>;
}

export interface Collected {
  posts: RawPost[];
  /**
   * Sources that were *enabled and failed* this run — surfaced as a quiet
   * notice, never as an error page.
   *
   * A source that is simply switched off is deliberately **not** listed: an
   * integration nobody configured is a deployment choice, not a fault, and
   * banner-ing "X is unavailable" forever on a site that never enabled X is
   * noise pretending to be information.
   */
  degraded: NewsSource[];
}

export async function collectFrom(
  adapters: CollectableAdapter[],
  locale: Locale,
): Promise<Collected> {
  const degraded = new Set<NewsSource>();

  const results = await Promise.all(
    adapters.map(async (adapter) => {
      if (!adapter.enabled()) return [];
      try {
        return await adapter.fetch(locale);
      } catch {
        // Deliberately not logged: adapter errors can carry request context
        // (including auth headers on some fetch implementations), and one
        // source being down is an expected state here, not an incident.
        degraded.add(adapter.source);
        return [];
      }
    }),
  );

  const posts = results.flat();
  // A source that actually produced posts isn't degraded, even if a sibling
  // adapter sharing its label failed (fixtures vs. the manual store).
  for (const post of posts) degraded.delete(post.source);

  return { posts, degraded: [...degraded] };
}
