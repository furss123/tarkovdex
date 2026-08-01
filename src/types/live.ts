/**
 * Unified "Tarkov Live" content model — one shape every source adapter
 * (Steam RSS, X, Telegram, manual curation) normalizes into, so the page
 * renders one merged situation board instead of one list per source.
 *
 * Deliberately a plain module (no `server-only`): the client board imports
 * these types and the pure helpers in `lib/live/status.ts` that operate on
 * them. Anything that touches credentials or the network lives in
 * `lib/live/sources/*` instead, which is server-only.
 */

export type NewsSource =
  | 'steam'
  | 'official_x'
  | 'nikita_x'
  | 'official_telegram'
  | 'official_website'
  | 'manual';

export type NewsCategory =
  | 'event'
  | 'patch'
  | 'maintenance'
  | 'server_status'
  | 'developer_comment'
  | 'announcement'
  | 'sale'
  | 'community'
  | 'unknown';

export type EventStatus = 'scheduled' | 'active' | 'ending_soon' | 'ended' | 'unknown';

export type ReliabilityLevel =
  | 'official_confirmed'
  | 'official_statement'
  | 'developer_hint'
  | 'tarkovdex_inference'
  | 'unverified';

export type ReviewStatus = 'auto_published' | 'pending_review' | 'reviewed' | 'rejected';

/** Which part of the game a post applies to. Separate from `types/tarkov.ts`'s
 * `GameMode` ('regular' | 'pve'), which is the *data-fetching* mode for the
 * json.tarkov.dev API — Arena isn't a dataset there, only a subject a post can
 * be about. */
export type LiveGameMode = 'pvp' | 'pve' | 'arena' | 'unknown';

/** What an event changes. Drives the "영향을 받는 요소" chips. */
export type AffectedArea =
  | 'xp'
  | 'boss'
  | 'map'
  | 'quest'
  | 'trader'
  | 'item'
  | 'spawn'
  | 'server'
  | 'other';

/** A corroborating post for an entry that several sources published. */
export interface LiveSourceRef {
  source: NewsSource;
  account: string | null;
  postId: string;
  url: string;
  publishedAt: string;
}

/** Provenance for anything an LLM produced, so a bad prompt version can be
 * identified and re-run rather than silently living forever in cache. */
export interface InterpretationMeta {
  provider: string;
  model: string;
  promptVersion: string;
  generatedAt: string;
}

export interface LiveEntry {
  /** Stable internal id: `${source}:${sourcePostId}`. */
  id: string;
  source: NewsSource;
  /** Handle/channel the post came from, e.g. `@tarkov`. Null for Steam/manual. */
  account: string | null;
  sourcePostId: string;
  url: string | null;

  /** Display title/body — translated when a translation exists, otherwise
   * identical to the original. `translated` says which. */
  title: string;
  content: string;
  originalTitle: string;
  originalContent: string;
  translated: boolean;

  /** Interpretation layer. Null when no interpreter ran (no API key, failure,
   * or the entry predates it) — the UI then shows the original text only and
   * never invents a summary. */
  summary: string | null;
  playerImpact: string | null;
  recommendedAction: string | null;

  category: NewsCategory;
  reliability: ReliabilityLevel;
  reviewStatus: ReviewStatus;
  /** Only ever set by a human (an operator forcing an event ended or reopened).
   * When absent the status is derived from the window — see
   * `lib/live/status.ts`. */
  status?: EventStatus;
  gameModes: LiveGameMode[];
  affects: AffectedArea[];

  /** Related game entities, as display strings (never ids — these come from
   * free text, not the json.tarkov.dev catalog). */
  maps: string[];
  bosses: string[];
  traders: string[];
  items: string[];
  quests: string[];
  tags: string[];

  /** Event window. **Only ever set by human curation** (the manual store) —
   * no adapter and no LLM is allowed to infer these from prose, so a missing
   * value means "not officially confirmed", never "probably around then".
   * ISO-8601 UTC. */
  startsAt: string | null;
  endsAt: string | null;

  publishedAt: string;
  collectedAt: string;
  lastCheckedAt: string;

  imageUrl: string | null;

  /** FNV-1a hash of the normalized original text — the dedup key that catches
   * the same announcement copy-pasted across Steam/X/Telegram. */
  contentHash: string;

  /** Field names a human set by hand in the manual store. Re-collection must
   * never overwrite these. */
  manualFields: string[];

  interpretation: InterpretationMeta | null;

  /** Other sources that carried the same announcement. */
  confirmations: LiveSourceRef[];
}

/**
 * How current the board's data actually is. This is the difference between
 * "nothing is running" and "we haven't been able to check", which the MVP
 * could not tell apart — it reported the render time as the check time, so a
 * page rendered from a six-hour-old collection still claimed to have just
 * looked.
 */
export type FeedFreshness =
  | 'ok'
  | 'stale'
  | 'partial'
  | 'down'
  /** No successful collection has ever been recorded (fresh deployment). */
  | 'never'
  /** Running without a database — the Steam-only fallback path. */
  | 'unmanaged';

export interface LiveSourceHealth {
  key: string;
  source: NewsSource;
  account: string | null;
  enabled: boolean;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  errorCode: string | null;
  consecutiveFailures: number;
}

/** Server-computed view model handed to the client board. `status` is
 * recomputed client-side from the same pure function for the live countdown,
 * so the two can never disagree by construction. */
export interface LiveFeed {
  entries: LiveEntry[];
  /** Sources that are enabled and currently failing — surfaced as a quiet
   * notice instead of taking the page down. */
  degradedSources: NewsSource[];
  /** The last time collection actually succeeded — **not** the render time. */
  lastCheckedAt: string | null;
  /** Render instant. Used only as the client clock's first value, so server and
   * client markup match before the timer starts. */
  renderedAt: string;
  freshness: FeedFreshness;
  sources: LiveSourceHealth[];
}
