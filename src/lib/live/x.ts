import type { NewsSource } from '@/types/live';
import type { RawSourcePost } from './repository';

/**
 * X (Twitter) collector — the official API v2, never HTML scraping.
 *
 * Two things changed from the MVP and both matter:
 *
 *  - **the cursor is no longer in module memory.** `since_id` is passed in from
 *    (and handed back to) the database, so a cold start, a redeploy or a
 *    second Vercel instance all resume exactly where the last run stopped
 *    instead of re-pulling a full page. That was the single largest avoidable
 *    cost in the old design.
 *  - **the network call is injected.** Everything below is pure apart from the
 *    `request` function it is given, so pagination, filtering, cursor
 *    advancement and every error branch are exercised by the test suite
 *    without a token and without touching X.
 *
 * Cost control: `since_id`, a `max_results` cap, a page cap, and
 * `exclude=replies,retweets` server-side so we never pay to download and then
 * discard them. The token is read only in `liveRequest` below, never logged,
 * never returned, and never reaches a client bundle; failures raise the HTTP
 * status only — no body, no headers.
 */

const API_BASE = 'https://api.x.com/2';
/** X rejects max_results below 5 on the timeline endpoint. */
const MIN_RESULTS = 5;

export type XErrorCode = 'auth' | 'not_found' | 'rate_limited' | 'server' | 'timeout' | 'bad_response';

export class XApiError extends Error {
  constructor(
    readonly code: XErrorCode,
    readonly status: number | null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(`x_${code}${status ? `_${status}` : ''}`);
    this.name = 'XApiError';
  }
}

export interface XRequest {
  (path: string): Promise<unknown>;
}

export interface XFetchOptions {
  source: NewsSource;
  username: string;
  userId: string | null;
  sinceId: string | null;
  maxResults: number;
  maxPages: number;
  includeReplies: boolean;
  includeReposts: boolean;
  includeQuotes: boolean;
}

export interface XFetchResult {
  userId: string;
  posts: RawSourcePost[];
  /** Advance the stored cursor to this only after the posts are safely stored. */
  newestId: string | null;
  requests: number;
}

interface XTweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  conversation_id?: string;
  edit_history_tweet_ids?: string[];
  attachments?: { media_keys?: string[] };
  referenced_tweets?: Array<{ type: 'retweeted' | 'quoted' | 'replied_to'; id: string }>;
}

interface XMedia {
  media_key: string;
  type: string;
  url?: string;
  preview_image_url?: string;
}

interface XTimeline {
  data?: XTweet[];
  includes?: { media?: XMedia[] };
  meta?: { newest_id?: string; next_token?: string; result_count?: number };
}

/** Tweet ids are monotonically increasing decimal strings of varying length,
 * so "newest" is longest-then-lexicographically-largest, not `>` on strings. */
export function newerId(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  if (a.length !== b.length) return a.length > b.length ? a : b;
  return a > b ? a : b;
}

/** First line (or first 80 chars) as a title — X posts have no title field,
 * and inventing one would be exactly the fabrication the model rules forbid. */
function titleOf(text: string): string {
  const firstLine = text.split('\n').find((line) => line.trim().length > 0)?.trim() ?? text.trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 80).trim()}…` : firstLine;
}

function referenceKind(tweet: XTweet): 'retweeted' | 'quoted' | 'replied_to' | null {
  return tweet.referenced_tweets?.[0]?.type ?? null;
}

/**
 * Client-side filter for what the server-side `exclude` can't express. X only
 * supports excluding replies and retweets, so quote posts arrive either way and
 * are dropped here when the config says so.
 */
export function keepTweet(tweet: XTweet, options: Pick<XFetchOptions, 'includeReplies' | 'includeReposts' | 'includeQuotes'>): boolean {
  switch (referenceKind(tweet)) {
    case 'retweeted':
      return options.includeReposts;
    case 'quoted':
      return options.includeQuotes;
    case 'replied_to':
      return options.includeReplies;
    default:
      return true;
  }
}

function toRawPost(
  tweet: XTweet,
  source: NewsSource,
  username: string,
  media: Map<string, XMedia>,
  hash: (text: string) => string,
): RawSourcePost {
  const attached = (tweet.attachments?.media_keys ?? [])
    .map((key) => media.get(key))
    .filter((item): item is XMedia => Boolean(item))
    .map((item) => ({ type: item.type, url: item.url ?? item.preview_image_url ?? null }));

  return {
    source,
    account: `@${username}`,
    postId: tweet.id,
    url: `https://x.com/${username}/status/${tweet.id}`,
    title: titleOf(tweet.text),
    content: tweet.text,
    publishedAt: tweet.created_at ?? new Date().toISOString(),
    contentHash: hash(`${titleOf(tweet.text)} ${tweet.text}`),
    // Media metadata is stored but never rendered: showing arbitrary remote
    // images would mean opening the image config to user-posted content.
    media: attached,
    payload: {
      conversationId: tweet.conversation_id ?? null,
      authorId: tweet.author_id ?? null,
      referenced: tweet.referenced_tweets ?? [],
      edits: tweet.edit_history_tweet_ids?.length ?? 1,
    },
  };
}

/**
 * One account's incremental pull. Returns posts newest-first plus the id the
 * cursor should advance to — the caller advances it only after a successful
 * store, so a crash mid-write re-reads rather than silently skipping posts.
 */
export async function fetchXTimeline(
  options: XFetchOptions,
  request: XRequest,
  hash: (text: string) => string,
): Promise<XFetchResult> {
  let requests = 0;
  let userId = options.userId;

  if (!userId) {
    const user = (await (requests++, request(`/users/by/username/${encodeURIComponent(options.username)}`)))as {
      data?: { id?: string };
    };
    if (!user?.data?.id) throw new XApiError('not_found', 404);
    userId = String(user.data.id);
  }

  const exclude = [
    options.includeReplies ? null : 'replies',
    options.includeReposts ? null : 'retweets',
  ].filter(Boolean);

  const posts: RawSourcePost[] = [];
  const seen = new Set<string>();
  let newestId: string | null = null;
  let pageToken: string | undefined;
  // Only a run that already has a cursor may page: the very first sync must
  // stay bounded to one page, or a new deployment pulls an entire timeline.
  const maxPages = options.sinceId ? options.maxPages : 1;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      max_results: String(Math.max(MIN_RESULTS, options.maxResults)),
      'tweet.fields': 'created_at,author_id,conversation_id,referenced_tweets,attachments,edit_history_tweet_ids',
      expansions: 'attachments.media_keys',
      'media.fields': 'type,url,preview_image_url',
    });
    if (exclude.length > 0) params.set('exclude', exclude.join(','));
    if (options.sinceId) params.set('since_id', options.sinceId);
    if (pageToken) params.set('pagination_token', pageToken);

    requests++;
    const timeline = (await request(`/users/${userId}/tweets?${params.toString()}`)) as XTimeline;
    if (timeline == null || typeof timeline !== 'object') throw new XApiError('bad_response', null);

    const media = new Map((timeline.includes?.media ?? []).map((item) => [item.media_key, item]));
    for (const tweet of timeline.data ?? []) {
      if (!tweet?.id || typeof tweet.text !== 'string') continue;
      newestId = newerId(newestId, tweet.id);
      if (!keepTweet(tweet, options)) continue;
      if (seen.has(tweet.id)) continue;
      seen.add(tweet.id);
      posts.push(toRawPost(tweet, options.source, options.username, media, hash));
    }

    newestId = newerId(newestId, timeline.meta?.newest_id ?? null);
    pageToken = timeline.meta?.next_token;
    if (!pageToken) break;
  }

  posts.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return { userId, posts, newestId, requests };
}

/** The real network call. Everything above is testable without it. */
export function liveRequest(token: string, timeoutMs: number): XRequest {
  return async (path) => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      });
    } catch {
      // AbortError, DNS, TLS — all indistinguishable to us and all retryable.
      throw new XApiError('timeout', null);
    }

    if (!response.ok) throw errorForStatus(response.status, response.headers);

    try {
      return await response.json();
    } catch {
      throw new XApiError('bad_response', response.status);
    }
  };
}

/** Split out so the status → behaviour mapping is testable without a socket. */
export function errorForStatus(status: number, headers?: Headers): XApiError {
  if (status === 401 || status === 403) return new XApiError('auth', status);
  if (status === 404) return new XApiError('not_found', status);
  if (status === 429) return new XApiError('rate_limited', status, retryAfterMs(headers));
  if (status >= 500) return new XApiError('server', status);
  return new XApiError('bad_response', status);
}

/** Prefers the server's own `Retry-After`, then the rate-limit reset epoch.
 * Capped so a bad header can't park a source for a week. */
export function retryAfterMs(headers?: Headers): number | null {
  const MAX = 60 * 60 * 1000;
  const retryAfter = Number(headers?.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, MAX);
  const reset = Number(headers?.get('x-rate-limit-reset'));
  if (Number.isFinite(reset) && reset > 0) {
    const delta = reset * 1000 - Date.now();
    if (delta > 0) return Math.min(delta, MAX);
  }
  return null;
}
