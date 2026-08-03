import 'server-only';

/**
 * Every knob for the Tarkov Live pipeline, read from the environment in one
 * place, with a safe default for every malformed value. Account handles live
 * here rather than in the adapters so switching to a different official
 * account is a config change, not a code change.
 *
 * All of it is optional. With an empty environment the site still renders:
 * without `DATABASE_URL` the board falls back to the Steam-only path it had
 * before this system existed, without `X_BEARER_TOKEN` the X collectors are
 * skipped, without `GEMINI_API_KEY` posts show their original text, and
 * without `TARKOV_LIVE_ADMIN_SECRET` the admin screen refuses to log anyone in.
 */

function flag(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function int(name: string, fallback: number, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export const liveConfig = {
  x: {
    /** Master switch. Off => the X collectors report as disabled and the rest
     * of the pipeline runs normally. */
    get enabled(): boolean {
      return flag('X_API_ENABLED') && Boolean(process.env.X_BEARER_TOKEN);
    },
    get bearerToken(): string | undefined {
      return process.env.X_BEARER_TOKEN;
    },
    get officialUsername(): string {
      return (process.env.X_TARKOV_USERNAME || 'tarkov').replace(/^@/, '');
    },
    get nikitaUsername(): string {
      return (process.env.X_NIKITA_USERNAME || 'nikgeneburn').replace(/^@/, '');
    },
    /** Floor on how often a single account may be polled, independent of how
     * often the cron fires — the real per-account spend control. */
    get fetchIntervalMinutes(): number {
      return int('X_FETCH_INTERVAL_MINUTES', 10, { min: 1, max: 1440 });
    },
    get maxPostsPerFetch(): number {
      return int('X_MAX_POSTS_PER_FETCH', 10, { min: 5, max: 100 });
    },
    /** Catch-up pages per run, only used once a cursor exists. The very first
     * sync is always a single page so a new deployment can't pull a whole
     * timeline. */
    get maxPagesPerFetch(): number {
      return int('X_MAX_PAGES_PER_FETCH', 2, { min: 1, max: 10 });
    },
    get includeReplies(): boolean {
      return flag('X_INCLUDE_REPLIES');
    },
    get includeReposts(): boolean {
      return flag('X_INCLUDE_REPOSTS');
    },
    /** Official accounts quote-post real announcements often enough to be
     * worth keeping; plain reposts and replies are not. */
    get includeQuotes(): boolean {
      return flag('X_INCLUDE_QUOTES', true);
    },
  },
  telegram: {
    /** Currently always off unless forced — see `sources.ts` for why there is
     * no safe automated read path for a public channel we don't own. */
    get enabled(): boolean {
      return flag('TELEGRAM_ENABLED');
    },
    get channel(): string {
      return process.env.TELEGRAM_CHANNEL || 'escapefromtarkovEN';
    },
  },
  interpret: {
    /** Needs GEMINI_API_KEY (already used by the news translator). */
    get enabled(): boolean {
      return flag('LIVE_INTERPRET_ENABLED', true) && Boolean(process.env.GEMINI_API_KEY);
    },
    /** Bounds LLM spend: at most this many posts are interpreted per run. */
    get maxItems(): number {
      return int('LIVE_INTERPRET_MAX_ITEMS', 8, { min: 1, max: 50 });
    },
    get model(): string {
      return process.env.LIVE_INTERPRET_MODEL || 'gemini-3.5-flash-lite';
    },
  },
  ingestion: {
    /** Kill switch for the cron endpoint itself. */
    get enabled(): boolean {
      return flag('LIVE_INGESTION_ENABLED', true);
    },
    get cronSecret(): string | undefined {
      return process.env.CRON_SECRET;
    },
    /** After this long with no successful collection the board says so, rather
     * than presenting "no events" as a fact. Vercel Hobby invokes project
     * cron jobs daily, so the default allows one daily cycle plus two hours
     * of scheduling jitter. Faster external schedulers can lower this with
     * LIVE_STALE_AFTER_MINUTES. */
    get staleAfterMinutes(): number {
      return int('LIVE_STALE_AFTER_MINUTES', 26 * 60, { min: 5, max: 10080 });
    },
    get endingSoonHours(): number {
      return int('LIVE_ENDING_SOON_HOURS', 6, { min: 1, max: 168 });
    },
    /** Whole-run budget. Vercel's function timeout is the hard ceiling; this
     * keeps a slow source from eating it. */
    get maxRunMs(): number {
      return int('LIVE_MAX_RUN_MS', 50_000, { min: 5_000, max: 300_000 });
    },
  },
  admin: {
    get secret(): string | undefined {
      return process.env.TARKOV_LIVE_ADMIN_SECRET;
    },
    /** Falls back to the admin secret so a working deployment needs one value,
     * not two — but a separate signing key is supported and preferred. */
    get sessionSecret(): string | undefined {
      return process.env.TARKOV_LIVE_SESSION_SECRET || process.env.TARKOV_LIVE_ADMIN_SECRET;
    },
    get enabled(): boolean {
      return Boolean(process.env.TARKOV_LIVE_ADMIN_SECRET);
    },
    get sessionHours(): number {
      return int('TARKOV_LIVE_SESSION_HOURS', 12, { min: 1, max: 168 });
    },
  },
  /** Ships the seed dataset instead of live sources so the board can be
   * developed and reviewed with no credentials at all. Never defaults on in
   * production. */
  get fixtures(): boolean {
    return flag('LIVE_FIXTURES', process.env.NODE_ENV !== 'production');
  },
  /** External-call timeout. Any source that misses it is reported degraded. */
  requestTimeoutMs: 8000,
};
