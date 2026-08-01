import 'server-only';
import type { Locale } from '@/i18n/routing';
import type { NewsSource } from '@/types/live';
import { getSteamNews } from '../steam-news';
import { getLocalizedNews } from '../translate-news';
import { liveConfig } from './config';
import { fixturePosts } from './fixtures';
import { contentHash } from './normalize';
import type { RawSourcePost, SourceState } from './repository';
import { fetchXTimeline, liveRequest, XApiError } from './x';

/**
 * What each source contributes to one ingestion run.
 *
 * A collector is handed its own persisted state and returns posts plus the
 * state to write back. Nothing here writes to the database and nothing here
 * runs during a page render — that is what keeps "the news page never calls X
 * or Gemini" a property of the wiring rather than a promise.
 */

export interface CollectorResult {
  posts: RawSourcePost[];
  requests: number;
  /** Merged into the stored state after the posts are safely written. */
  nextState?: Partial<SourceState>;
  /** Throttled or backing off — not an error, and not a reason to alarm anyone. */
  skipped?: 'interval' | 'backoff' | 'disabled';
}

export interface SourceCollector {
  key: string;
  source: NewsSource;
  account: string;
  enabled(): boolean;
  collect(state: SourceState | null): Promise<CollectorResult>;
}

const LOCALES: Locale[] = ['ko', 'en', 'zh'];

/** Per-locale display text carried alongside the original, so the board can
 * show a Korean post without re-translating it at render time. */
async function steamLocalizedText(): Promise<Map<string, Record<string, { title: string; content: string }>>> {
  const map = new Map<string, Record<string, { title: string; content: string }>>();
  const feeds = await Promise.all(LOCALES.map(async (locale) => [locale, await getLocalizedNews(locale)] as const));
  for (const [locale, feed] of feeds) {
    for (const item of [...feed.patchNotes, ...feed.events]) {
      const existing = map.get(item.id) ?? {};
      existing[locale] = { title: item.title, content: item.content };
      map.set(item.id, existing);
    }
  }
  return map;
}

/**
 * Steam RSS — unchanged as a source, deliberately. It is still the primary
 * official feed and still uses the committed ko/zh translations
 * (`news-ko.json`/`news-zh.json`), so no post that reads Korean today starts
 * reading English after this change. What changed is only *when* it runs: in
 * the cron, not in the render.
 */
const steamCollector: SourceCollector = {
  key: 'steam',
  source: 'steam',
  account: '',
  enabled: () => true,
  collect: async () => {
    const [feed, localized] = await Promise.all([getSteamNews(), steamLocalizedText()]);
    const posts = [...feed.patchNotes, ...feed.events].map<RawSourcePost>((item) => ({
      source: 'steam',
      account: null,
      postId: item.id,
      url: item.url,
      title: item.title,
      content: item.content,
      publishedAt: item.publishedAt,
      contentHash: contentHash(`${item.title} ${item.content}`),
      payload: { localized: localized.get(item.id) ?? {} },
    }));
    return { posts, requests: 1, nextState: { lastSuccessAt: new Date().toISOString() } };
  },
};

function xCollector(source: NewsSource, username: string): SourceCollector {
  return {
    key: `${source}:${username}`,
    source,
    account: username,
    enabled: () => liveConfig.x.enabled,
    collect: async (state) => {
      const now = Date.now();
      // Per-account spend control, independent of how often the cron fires.
      const lastAttempt = state?.lastAttemptAt ? Date.parse(state.lastAttemptAt) : 0;
      if (now - lastAttempt < liveConfig.x.fetchIntervalMinutes * 60_000) {
        return { posts: [], requests: 0, skipped: 'interval' };
      }
      if (state?.nextRetryAt && Date.parse(state.nextRetryAt) > now) {
        return { posts: [], requests: 0, skipped: 'backoff' };
      }

      const result = await fetchXTimeline(
        {
          source,
          username,
          userId: state?.externalId ?? null,
          sinceId: state?.sinceId ?? null,
          maxResults: liveConfig.x.maxPostsPerFetch,
          maxPages: liveConfig.x.maxPagesPerFetch,
          includeReplies: liveConfig.x.includeReplies,
          includeReposts: liveConfig.x.includeReposts,
          includeQuotes: liveConfig.x.includeQuotes,
        },
        liveRequest(liveConfig.x.bearerToken ?? '', liveConfig.requestTimeoutMs),
        contentHash,
      );

      return {
        posts: result.posts,
        requests: result.requests,
        nextState: {
          externalId: result.userId,
          // Only advanced by the caller once the posts are written.
          sinceId: result.newestId ?? state?.sinceId ?? null,
          lastSuccessAt: new Date().toISOString(),
        },
      };
    },
  };
}

/**
 * Telegram — seam and flag only, no collector.
 *
 * The Bot API cannot read an arbitrary public channel's history: a bot only
 * receives updates for chats it has been added to, and BSG's channel is not
 * ours to add a bot to. MTProto with a personal user session is an
 * account-credential liability for a static fan site, and `t.me/s/<channel>` is
 * exactly the fragile HTML scrape this project has already rejected twice. It
 * stays off; Telegram announcements are entered by hand like any other curated
 * item. See docs/tarkov-live.md > Telegram.
 */
const telegramCollector: SourceCollector = {
  key: 'official_telegram',
  source: 'official_telegram',
  account: '',
  enabled: () => liveConfig.telegram.enabled,
  collect: async () => {
    throw new Error('telegram_not_implemented');
  },
};

/** Seed data so the whole pipeline can be exercised — including a real cron
 * run — with no credentials at all. Never on in production (`config.ts`). */
const fixtureCollector: SourceCollector = {
  key: 'fixtures',
  source: 'manual',
  account: '',
  enabled: () => liveConfig.fixtures,
  collect: async () => {
    const byLocale = new Map(LOCALES.map((locale) => [locale, fixturePosts(locale)]));
    const base = byLocale.get('en') ?? [];
    const posts = base.map<RawSourcePost>((post, index) => {
      const localized: Record<string, { title: string; content: string }> = {};
      for (const locale of LOCALES) {
        const match = byLocale.get(locale)?.[index];
        if (match) localized[locale] = { title: match.title, content: match.content };
      }
      return {
        source: post.source,
        account: post.account,
        postId: post.postId,
        url: post.url,
        title: post.title,
        content: post.content,
        publishedAt: post.publishedAt,
        contentHash: contentHash(`${post.title} ${post.content}`),
        payload: { localized, overrides: post.overrides ?? null, fixture: true },
      };
    });
    return { posts, requests: 0 };
  },
};

export function allCollectors(): SourceCollector[] {
  return [
    steamCollector,
    xCollector('official_x', liveConfig.x.officialUsername),
    xCollector('nikita_x', liveConfig.x.nikitaUsername),
    telegramCollector,
    fixtureCollector,
  ];
}

/** Backoff for a failed source: doubling, capped at an hour, and honouring the
 * server's own retry hint when there is one (a 429 says when it resets). */
export function backoffMs(consecutiveFailures: number, error: unknown): number {
  const HOUR = 60 * 60 * 1000;
  if (error instanceof XApiError && error.retryAfterMs) return Math.min(error.retryAfterMs, HOUR);
  return Math.min(5 * 60_000 * 2 ** Math.max(0, consecutiveFailures - 1), HOUR);
}

/**
 * Codes this project raises deliberately. Anything else — including an upstream
 * library's message — collapses to `collector_error`.
 *
 * An allowlist rather than a shape check on purpose: a pattern like
 * "looks like an identifier" happily passes `Unauthorized` or a message
 * containing a token fragment straight through into the run log and the admin
 * screen, which is exactly what this function exists to prevent.
 */
const KNOWN_CODES = new Set([
  'telegram_not_implemented',
  'interpret_timeout',
  'database_not_configured',
  'already_running',
]);

/** Error code for the run log. Never a raw message. */
export function errorCode(error: unknown): string {
  if (error instanceof XApiError) return error.message;
  if (error instanceof Error) {
    if (KNOWN_CODES.has(error.message)) return error.message;
    if (/^x_[a-z_]+(_\d{3})?$/.test(error.message)) return error.message;
  }
  return 'collector_error';
}
