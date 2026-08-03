import type {
  AffectedArea,
  EventStatus,
  LiveGameMode,
  NewsCategory,
  NewsSource,
  ReliabilityLevel,
  ReviewStatus,
} from '@/types/live';
import type { SqlExecutor } from './db/sql';

/**
 * Persistence for Tarkov Live. Raw source posts, their interpretations, and the
 * board items built from them are three separate tables on purpose:
 *
 *  - a raw post is a fact about the outside world and is never rewritten by us;
 *  - an interpretation is a derived, versioned, re-runnable artifact;
 *  - a board item is what a human published, and carries their edits.
 *
 * Collapsing them (the MVP's single in-memory `LiveEntry`) is what made manual
 * curation require a redeploy: there was nowhere to put an edit that a
 * re-collection wouldn't overwrite.
 */

export type InterpretStatus = 'pending' | 'done' | 'failed' | 'skipped';
export type EventSourceRole = 'initial' | 'confirmation' | 'update' | 'end' | 'correction';
export type LocaleKey = 'ko' | 'en' | 'zh';

export interface SourceState {
  sourceKey: string;
  sourceType: NewsSource;
  account: string;
  externalId: string | null;
  active: boolean;
  sinceId: string | null;
  cursor: string | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  consecutiveFailures: number;
  nextRetryAt: string | null;
}

export interface RawSourcePost {
  source: NewsSource;
  account: string | null;
  postId: string;
  url: string | null;
  title: string;
  content: string;
  publishedAt: string;
  contentHash: string;
  media?: unknown[];
  payload?: unknown;
}

export interface StoredRawPost extends RawSourcePost {
  id: string;
  account: string;
  collectedAt: string;
  lastSeenAt: string;
  interpretStatus: InterpretStatus;
  interpretAttempts: number;
}

export interface UpsertResult {
  id: string;
  inserted: boolean;
  /** True when the text changed since we last saw this post id. */
  changed: boolean;
}

/** Per-locale prose. Nothing numeric or temporal lives here — see `interpret.ts`. */
export interface InterpretedText {
  summary: string | null;
  playerImpact: string | null;
  recommendedAction: string | null;
}

export interface StoredInterpretation {
  rawPostId: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  content: Partial<Record<LocaleKey, InterpretedText>>;
  gameModes: LiveGameMode[];
  category: NewsCategory | null;
  eventIntent: string | null;
  maps: string[];
  bosses: string[];
  traders: string[];
  items: string[];
  quests: string[];
  startsAt: string | null;
  startsAtEvidence: string | null;
  endsAt: string | null;
  endsAtEvidence: string | null;
  reliabilitySuggestion: ReliabilityLevel | null;
  requiresReview: boolean;
  reviewReason: string | null;
  ambiguity: string[];
}

export interface LocalizedText {
  title: string;
  content: string;
  translated: boolean;
  summary?: string | null;
  playerImpact?: string | null;
  recommendedAction?: string | null;
}

export interface EventContent {
  original: { title: string; content: string };
  ko?: LocalizedText;
  en?: LocalizedText;
  zh?: LocalizedText;
}

export interface EventUpsertInput {
  id: string;
  slug: string;
  category: NewsCategory;
  reliability: ReliabilityLevel;
  reviewStatus: ReviewStatus;
  status?: EventStatus;
  gameModes: LiveGameMode[];
  affects: AffectedArea[];
  maps?: string[];
  bosses?: string[];
  traders?: string[];
  items?: string[];
  quests?: string[];
  tags?: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  endConfirmed?: boolean;
  content: EventContent;
  primaryPostId: string | null;
  publishedAt?: string | null;
}

export interface LiveEventRow extends Omit<EventUpsertInput, 'status'> {
  status: EventStatus;
  endConfirmed: boolean;
  overrides: Record<string, unknown>;
  manualFields: string[];
  firstSeenAt: string;
  publishedAt: string | null;
  lastConfirmedAt: string | null;
  endedAt: string | null;
  reviewNote: string | null;
  updatedAt: string;
  /** Publish time of the newest linked post — what the feed sorts by. */
  postedAt: string;
  sources: Array<{
    source: NewsSource;
    account: string | null;
    postId: string;
    url: string | null;
    publishedAt: string;
    /** Carried so dedup can match an identical announcement without a second
     * query per candidate. */
    contentHash: string;
    role: EventSourceRole;
  }>;
}

export interface IngestionRun {
  id: number;
  source: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  requests: number;
  fetched: number;
  newPosts: number;
  duplicates: number;
  interpretations: number;
  eventsUpserted: number;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number | null;
}

export interface AuditEntry {
  targetType: string;
  targetId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  actor: string;
  note?: string | null;
}

export interface LiveRepository {
  transaction<T>(work: (repo: LiveRepository) => Promise<T>): Promise<T>;
  migrate(): Promise<string[]>;

  getSourceState(sourceKey: string): Promise<SourceState | null>;
  listSourceStates(): Promise<SourceState[]>;
  saveSourceState(state: Partial<SourceState> & { sourceKey: string; sourceType: NewsSource }): Promise<void>;

  upsertRawPost(post: RawSourcePost): Promise<UpsertResult>;
  getRawPost(id: string): Promise<StoredRawPost | null>;
  listRawPosts(limit: number): Promise<StoredRawPost[]>;
  getPendingInterpretations(limit: number): Promise<StoredRawPost[]>;
  setInterpretStatus(id: string, status: InterpretStatus, error?: string | null): Promise<void>;

  saveInterpretation(result: StoredInterpretation): Promise<void>;
  getInterpretation(rawPostId: string, promptVersion: string): Promise<StoredInterpretation | null>;

  createOrUpdateEvent(input: EventUpsertInput): Promise<LiveEventRow>;
  linkPostToEvent(eventId: string, rawPostId: string, role?: EventSourceRole): Promise<void>;
  findEventIdForPost(rawPostId: string): Promise<string | null>;
  getEvent(eventId: string): Promise<LiveEventRow | null>;
  listEvents(options?: { reviewStatus?: ReviewStatus[]; limit?: number }): Promise<LiveEventRow[]>;
  updateEventFields(
    eventId: string,
    patch: Record<string, unknown>,
    options: { manual: boolean; actor: string; note?: string | null },
  ): Promise<LiveEventRow | null>;
  clearEventOverride(eventId: string, field: string, actor: string): Promise<LiveEventRow | null>;
  deleteEvent(eventId: string, actor: string): Promise<void>;

  appendAudit(entry: AuditEntry): Promise<void>;
  listAudit(limit: number): Promise<Array<AuditEntry & { id: number; createdAt: string }>>;

  startRun(source: string, trigger: string): Promise<number>;
  finishRun(id: number, result: Partial<IngestionRun>): Promise<void>;
  listRuns(limit: number): Promise<IngestionRun[]>;

  acquireLock(key: string, ttlMs: number, holder: string): Promise<boolean>;
  releaseLock(key: string, holder: string): Promise<void>;
}

// --- helpers ---------------------------------------------------------------

const iso = (value: unknown): string | null =>
  value == null ? null : value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

const req = (value: unknown): string => iso(value) ?? new Date(0).toISOString();

const arr = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Postgres `jsonb` round-trips as an object through postgres.js but as a
 * string through some drivers; normalize once here rather than at 20 call
 * sites. */
function json(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toSourceState(row: SqlRowLike): SourceState {
  return {
    sourceKey: String(row.source_key),
    sourceType: row.source_type as NewsSource,
    account: String(row.account ?? ''),
    externalId: row.external_id == null ? null : String(row.external_id),
    active: Boolean(row.active),
    sinceId: row.since_id == null ? null : String(row.since_id),
    cursor: row.cursor == null ? null : String(row.cursor),
    lastSuccessAt: iso(row.last_success_at),
    lastAttemptAt: iso(row.last_attempt_at),
    lastError: row.last_error == null ? null : String(row.last_error),
    lastErrorAt: iso(row.last_error_at),
    consecutiveFailures: Number(row.consecutive_failures ?? 0),
    nextRetryAt: iso(row.next_retry_at),
  };
}

function toRawPost(row: SqlRowLike): StoredRawPost {
  return {
    id: String(row.id),
    source: row.source as NewsSource,
    account: String(row.source_account ?? ''),
    postId: String(row.source_post_id),
    url: row.url == null ? null : String(row.url),
    title: String(row.title),
    content: String(row.content),
    publishedAt: req(row.published_at),
    contentHash: String(row.content_hash),
    media: (json(row.media) as unknown[]) ?? [],
    payload: json(row.payload),
    collectedAt: req(row.collected_at),
    lastSeenAt: req(row.last_seen_at),
    interpretStatus: row.interpret_status as InterpretStatus,
    interpretAttempts: Number(row.interpret_attempts ?? 0),
  };
}

type SqlRowLike = Record<string, unknown>;

function toEventRow(row: SqlRowLike, sources: LiveEventRow['sources']): LiveEventRow {
  const overrides = obj(json(row.overrides));
  const base: LiveEventRow = {
    id: String(row.id),
    slug: String(row.slug),
    category: row.category as NewsCategory,
    status: row.status as EventStatus,
    reliability: row.reliability as ReliabilityLevel,
    reviewStatus: row.review_status as ReviewStatus,
    gameModes: arr(row.game_modes) as LiveGameMode[],
    affects: arr(row.affects) as AffectedArea[],
    maps: arr(row.maps),
    bosses: arr(row.bosses),
    traders: arr(row.traders),
    items: arr(row.items),
    quests: arr(row.quests),
    tags: arr(row.tags),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    endConfirmed: Boolean(row.end_confirmed),
    content: (json(row.content) as EventContent) ?? { original: { title: '', content: '' } },
    overrides,
    manualFields: arr(row.manual_fields),
    primaryPostId: row.primary_post_id == null ? null : String(row.primary_post_id),
    firstSeenAt: req(row.first_seen_at),
    publishedAt: iso(row.published_at),
    lastConfirmedAt: iso(row.last_confirmed_at),
    endedAt: iso(row.ended_at),
    reviewNote: row.review_note == null ? null : String(row.review_note),
    updatedAt: req(row.updated_at),
    postedAt: req(row.posted_at ?? row.first_seen_at),
    sources,
  };
  // Human edits win over everything derived, always — this is the single point
  // where that rule is enforced for reads.
  return { ...base, ...(overrides as Partial<LiveEventRow>), manualFields: base.manualFields };
}

const EVENT_COLUMNS = `e.*, coalesce(
  (select max(p.published_at) from live_event_sources s
     join live_raw_posts p on p.id = s.raw_post_id
    where s.event_id = e.id),
  e.first_seen_at
) as posted_at`;

export function createRepository(sql: SqlExecutor): LiveRepository {
  async function loadSources(eventIds: string[]): Promise<Map<string, LiveEventRow['sources']>> {
    const map = new Map<string, LiveEventRow['sources']>();
    if (eventIds.length === 0) return map;
    const rows = await sql<SqlRowLike>(
      `select s.event_id, s.role, p.source, p.source_account, p.source_post_id, p.url,
              p.published_at, p.content_hash
         from live_event_sources s
         join live_raw_posts p on p.id = s.raw_post_id
        where s.event_id = any($1)
        order by p.published_at desc`,
      [eventIds],
    );
    for (const row of rows) {
      const key = String(row.event_id);
      const list = map.get(key) ?? [];
      list.push({
        source: row.source as NewsSource,
        account: row.source_account ? String(row.source_account) : null,
        postId: String(row.source_post_id),
        url: row.url == null ? null : String(row.url),
        publishedAt: req(row.published_at),
        contentHash: String(row.content_hash ?? ''),
        role: row.role as EventSourceRole,
      });
      map.set(key, list);
    }
    return map;
  }

  async function hydrate(rows: SqlRowLike[]): Promise<LiveEventRow[]> {
    const sources = await loadSources(rows.map((row) => String(row.id)));
    return rows.map((row) => toEventRow(row, sources.get(String(row.id)) ?? []));
  }

  const repo: LiveRepository = {
    async transaction(work) {
      return sql.transaction((transactionSql) => work(createRepository(transactionSql)));
    },

    async migrate() {
      const { migrate } = await import('./db/migrations');
      return migrate(sql);
    },

    async getSourceState(sourceKey) {
      const [row] = await sql<SqlRowLike>('select * from live_source_states where source_key = $1', [
        sourceKey,
      ]);
      return row ? toSourceState(row) : null;
    },

    async listSourceStates() {
      const rows = await sql<SqlRowLike>('select * from live_source_states order by source_key');
      return rows.map(toSourceState);
    },

    async saveSourceState(state) {
      // Patch semantics matter here. An omitted cursor/error/retry field means
      // "leave it alone" while an explicit null means "clear it". Building the
      // INSERT from own properties preserves that distinction without sentinel
      // values that could leak into the stored row.
      const columns = ['source_key', 'source_type'];
      const params: unknown[] = [state.sourceKey, state.sourceType];
      const updates = ['source_type = excluded.source_type'];
      const fields: Array<[keyof SourceState, string]> = [
        ['account', 'account'],
        ['externalId', 'external_id'],
        ['active', 'active'],
        ['sinceId', 'since_id'],
        ['cursor', 'cursor'],
        ['lastSuccessAt', 'last_success_at'],
        ['lastAttemptAt', 'last_attempt_at'],
        ['lastError', 'last_error'],
        ['lastErrorAt', 'last_error_at'],
        ['consecutiveFailures', 'consecutive_failures'],
        ['nextRetryAt', 'next_retry_at'],
      ];
      for (const [key, column] of fields) {
        if (!Object.hasOwn(state, key) || state[key] === undefined) continue;
        columns.push(column);
        params.push(state[key]);
        updates.push(`${column} = excluded.${column}`);
      }
      const placeholders = params.map((_, index) => `$${index + 1}`);
      await sql(
        `insert into live_source_states (${columns.join(', ')})
         values (${placeholders.join(', ')})
         on conflict (source_key) do update set
           ${updates.join(', ')}, updated_at = now()`,
        params,
      );
    },

    async upsertRawPost(post) {
      const id = `${post.source}:${post.postId}`;
      const rows = await sql<SqlRowLike>(
        `insert into live_raw_posts
           (id, source, source_account, source_post_id, url, title, content, published_at,
            media, payload, content_hash)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
         on conflict (source, source_account, source_post_id) do update set
           last_seen_at = now(),
           url = excluded.url,
           title = excluded.title,
           content = excluded.content,
           media = excluded.media,
           payload = excluded.payload,
           content_hash = excluded.content_hash,
           edited = live_raw_posts.content_hash is distinct from excluded.content_hash,
           -- Edited upstream => re-interpret; otherwise keep whatever we had.
           interpret_status = case
             when live_raw_posts.content_hash is distinct from excluded.content_hash then 'pending'
             else live_raw_posts.interpret_status end,
           interpret_attempts = case
             when live_raw_posts.content_hash is distinct from excluded.content_hash then 0
             else live_raw_posts.interpret_attempts end,
           interpret_error = case
             when live_raw_posts.content_hash is distinct from excluded.content_hash then null
             else live_raw_posts.interpret_error end,
           processed_at = case
             when live_raw_posts.content_hash is distinct from excluded.content_hash then null
             else live_raw_posts.processed_at end
         returning id, (xmax = 0) as inserted, edited`,
        [
          id,
          post.source,
          post.account ?? '',
          post.postId,
          post.url,
          post.title,
          post.content,
          post.publishedAt,
          JSON.stringify(post.media ?? []),
          JSON.stringify(post.payload ?? null),
          post.contentHash,
        ],
      );
      const row = rows[0] ?? {};
      return {
        id: String(row.id ?? id),
        inserted: Boolean(row.inserted),
        changed: Boolean(row.inserted) || Boolean(row.edited),
      };
    },

    async getRawPost(id) {
      const [row] = await sql<SqlRowLike>('select * from live_raw_posts where id = $1', [id]);
      return row ? toRawPost(row) : null;
    },

    async listRawPosts(limit) {
      const rows = await sql<SqlRowLike>(
        'select * from live_raw_posts where revoked = false order by published_at desc limit $1',
        [limit],
      );
      return rows.map(toRawPost);
    },

    async getPendingInterpretations(limit) {
      const rows = await sql<SqlRowLike>(
        `select * from live_raw_posts
          where revoked = false and interpret_status in ('pending', 'failed') and interpret_attempts < 3
          order by published_at desc limit $1`,
        [limit],
      );
      return rows.map(toRawPost);
    },

    async setInterpretStatus(id, status, error = null) {
      await sql(
        `update live_raw_posts set
           interpret_status = $2,
           interpret_error = case when $2 in ('pending', 'done') then null else $3 end,
           interpret_attempts = case
             when $2 = 'pending' then 0
             when $2 = 'failed' then interpret_attempts + 1
             else interpret_attempts end,
           processed_at = case
             when $2 = 'done' then now()
             when $2 = 'pending' then null
             else processed_at end
         where id = $1`,
        [id, status, error],
      );
    },

    async saveInterpretation(result) {
      await sql(
        `insert into live_interpretations
           (raw_post_id, provider, model, prompt_version, schema_version, content, game_modes,
            category, event_intent, maps, bosses, traders, items, quests,
            starts_at, starts_at_evidence, ends_at, ends_at_evidence,
            reliability_suggestion, requires_review, review_reason, ambiguity)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         on conflict (raw_post_id, prompt_version) do update set
           content = excluded.content,
           game_modes = excluded.game_modes,
           category = excluded.category,
           event_intent = excluded.event_intent,
           maps = excluded.maps, bosses = excluded.bosses, traders = excluded.traders,
           items = excluded.items, quests = excluded.quests,
           starts_at = excluded.starts_at, starts_at_evidence = excluded.starts_at_evidence,
           ends_at = excluded.ends_at, ends_at_evidence = excluded.ends_at_evidence,
           reliability_suggestion = excluded.reliability_suggestion,
           requires_review = excluded.requires_review,
           review_reason = excluded.review_reason,
           ambiguity = excluded.ambiguity,
           created_at = now()`,
        [
          result.rawPostId,
          result.provider,
          result.model,
          result.promptVersion,
          result.schemaVersion,
          JSON.stringify(result.content),
          result.gameModes,
          result.category,
          result.eventIntent,
          result.maps,
          result.bosses,
          result.traders,
          result.items,
          result.quests,
          result.startsAt,
          result.startsAtEvidence,
          result.endsAt,
          result.endsAtEvidence,
          result.reliabilitySuggestion,
          result.requiresReview,
          result.reviewReason,
          result.ambiguity,
        ],
      );
    },

    async getInterpretation(rawPostId, promptVersion) {
      const [row] = await sql<SqlRowLike>(
        'select * from live_interpretations where raw_post_id = $1 and prompt_version = $2',
        [rawPostId, promptVersion],
      );
      if (!row) return null;
      return {
        rawPostId: String(row.raw_post_id),
        provider: String(row.provider),
        model: String(row.model),
        promptVersion: String(row.prompt_version),
        schemaVersion: String(row.schema_version),
        content: (json(row.content) as StoredInterpretation['content']) ?? {},
        gameModes: arr(row.game_modes) as LiveGameMode[],
        category: (row.category as NewsCategory) ?? null,
        eventIntent: row.event_intent == null ? null : String(row.event_intent),
        maps: arr(row.maps),
        bosses: arr(row.bosses),
        traders: arr(row.traders),
        items: arr(row.items),
        quests: arr(row.quests),
        startsAt: iso(row.starts_at),
        startsAtEvidence: row.starts_at_evidence == null ? null : String(row.starts_at_evidence),
        endsAt: iso(row.ends_at),
        endsAtEvidence: row.ends_at_evidence == null ? null : String(row.ends_at_evidence),
        reliabilitySuggestion: (row.reliability_suggestion as ReliabilityLevel) ?? null,
        requiresReview: Boolean(row.requires_review),
        reviewReason: row.review_reason == null ? null : String(row.review_reason),
        ambiguity: arr(row.ambiguity),
      };
    },

    async createOrUpdateEvent(input) {
      // Only ever writes derived columns; `overrides`/`manual_fields` are
      // untouched here, which is what makes a re-collection unable to clobber a
      // human edit.
      const rows = await sql<SqlRowLike>(
        `insert into live_events
           (id, slug, category, status, reliability, review_status, game_modes, affects,
            maps, bosses, traders, items, quests, tags, starts_at, ends_at, end_confirmed,
            content, primary_post_id, published_at, last_confirmed_at)
         values ($1,$2,$3,coalesce($4,'unknown'),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                 coalesce($17,false),$18::jsonb,$19,$20, now())
         on conflict (id) do update set
           category = excluded.category,
           reliability = excluded.reliability,
           review_status = case
             when live_events.review_status in ('reviewed','rejected') then live_events.review_status
             else excluded.review_status end,
           game_modes = excluded.game_modes,
           affects = excluded.affects,
           maps = excluded.maps, bosses = excluded.bosses, traders = excluded.traders,
           items = excluded.items, quests = excluded.quests, tags = excluded.tags,
           starts_at = coalesce(live_events.starts_at, excluded.starts_at),
           ends_at = coalesce(live_events.ends_at, excluded.ends_at),
           end_confirmed = live_events.end_confirmed or excluded.end_confirmed,
           content = excluded.content,
           primary_post_id = coalesce(excluded.primary_post_id, live_events.primary_post_id),
           published_at = coalesce(live_events.published_at, excluded.published_at),
           last_confirmed_at = now(),
           updated_at = now()
         returning *, first_seen_at as posted_at`,
        [
          input.id,
          input.slug,
          input.category,
          input.status ?? 'unknown',
          input.reliability,
          input.reviewStatus,
          input.gameModes,
          input.affects,
          input.maps ?? [],
          input.bosses ?? [],
          input.traders ?? [],
          input.items ?? [],
          input.quests ?? [],
          input.tags ?? [],
          input.startsAt ?? null,
          input.endsAt ?? null,
          input.endConfirmed ?? false,
          JSON.stringify(input.content),
          input.primaryPostId,
          input.publishedAt ?? null,
        ],
      );
      const [row] = await hydrate(rows);
      return row;
    },

    async linkPostToEvent(eventId, rawPostId, role = 'confirmation') {
      await sql(
        `insert into live_event_sources (event_id, raw_post_id, role)
         values ($1,$2,$3)
         on conflict (raw_post_id) do update set event_id = excluded.event_id, role = excluded.role`,
        [eventId, rawPostId, role],
      );
    },

    async findEventIdForPost(rawPostId) {
      const [row] = await sql<SqlRowLike>(
        'select event_id from live_event_sources where raw_post_id = $1',
        [rawPostId],
      );
      return row ? String(row.event_id) : null;
    },

    async getEvent(eventId) {
      const rows = await sql<SqlRowLike>(`select ${EVENT_COLUMNS} from live_events e where e.id = $1`, [
        eventId,
      ]);
      const [row] = await hydrate(rows);
      return row ?? null;
    },

    async listEvents(options = {}) {
      const filters: string[] = [];
      const params: unknown[] = [];
      if (options.reviewStatus?.length) {
        params.push(options.reviewStatus);
        filters.push(`e.review_status = any($${params.length})`);
      }
      params.push(options.limit ?? 100);
      const rows = await sql<SqlRowLike>(
        `select ${EVENT_COLUMNS} from live_events e
         ${filters.length ? `where ${filters.join(' and ')}` : ''}
         order by posted_at desc limit $${params.length}`,
        params,
      );
      return hydrate(rows);
    },

    async updateEventFields(eventId, patch, options) {
      if (!sql.inTransaction) {
        return repo.transaction((transactionRepo) =>
          transactionRepo.updateEventFields(eventId, patch, options),
        );
      }
      const [before] = await sql<SqlRowLike>('select * from live_events where id = $1 for update', [
        eventId,
      ]);
      if (!before) return null;

      if (options.manual) {
        // A human edit is stored as an override, never written over the derived
        // column — so "remove the override" can restore the automatic value.
        const merged = { ...obj(json(before.overrides)), ...patch };
        for (const [key, value] of Object.entries(patch)) if (value === undefined) delete merged[key];
        await sql(
          `update live_events set overrides = $2::jsonb, manual_fields = $3, updated_at = now()
           where id = $1`,
          [eventId, JSON.stringify(merged), Object.keys(merged)],
        );
      }

      // Review status, note and the terminal end stamp are real columns even
      // when set by hand: the read path and the queries filter on them.
      const columns: Record<string, string> = {
        reviewStatus: 'review_status',
        reviewNote: 'review_note',
        publishedAt: 'published_at',
        endedAt: 'ended_at',
        status: 'status',
        startsAt: 'starts_at',
        endsAt: 'ends_at',
        endConfirmed: 'end_confirmed',
      };
      const sets: string[] = [];
      const params: unknown[] = [eventId];
      for (const [key, column] of Object.entries(columns)) {
        if (!(key in patch)) continue;
        params.push(patch[key] ?? null);
        sets.push(`${column} = $${params.length}`);
      }
      if (sets.length > 0) {
        await sql(`update live_events set ${sets.join(', ')}, updated_at = now() where id = $1`, params);
      }

      await repo.appendAudit({
        targetType: 'event',
        targetId: eventId,
        action: options.manual ? 'update' : 'system_update',
        before: obj(json(before.overrides)),
        after: patch,
        actor: options.actor,
        note: options.note ?? null,
      });

      return repo.getEvent(eventId);
    },

    async clearEventOverride(eventId, field, actor) {
      if (!sql.inTransaction) {
        return repo.transaction((transactionRepo) =>
          transactionRepo.clearEventOverride(eventId, field, actor),
        );
      }
      const [before] = await sql<SqlRowLike>('select overrides from live_events where id = $1 for update', [
        eventId,
      ]);
      if (!before) return null;
      const overrides = obj(json(before.overrides));
      delete overrides[field];
      const resets: Record<string, Array<[string, unknown]>> = {
        reviewStatus: [['review_status', 'pending_review']],
        reviewNote: [['review_note', null]],
        publishedAt: [['published_at', null]],
        endedAt: [['ended_at', null]],
        status: [['status', 'unknown']],
        startsAt: [['starts_at', null]],
        endsAt: [
          ['ends_at', null],
          ['end_confirmed', false],
        ],
        endConfirmed: [['end_confirmed', false]],
      };
      const params: unknown[] = [eventId, JSON.stringify(overrides), Object.keys(overrides)];
      const assignments = ['overrides = $2::jsonb', 'manual_fields = $3', 'updated_at = now()'];
      for (const [column, value] of resets[field] ?? []) {
        params.push(value);
        assignments.push(`${column} = $${params.length}`);
      }
      await sql(
        `update live_events set ${assignments.join(', ')} where id = $1`,
        params,
      );
      await repo.appendAudit({
        targetType: 'event',
        targetId: eventId,
        action: 'clear_override',
        after: { field },
        actor,
      });
      return repo.getEvent(eventId);
    },

    async deleteEvent(eventId, actor) {
      if (!sql.inTransaction) {
        return repo.transaction((transactionRepo) => transactionRepo.deleteEvent(eventId, actor));
      }
      await sql('delete from live_events where id = $1', [eventId]);
      await repo.appendAudit({ targetType: 'event', targetId: eventId, action: 'delete', actor });
    },

    async appendAudit(entry) {
      await sql(
        `insert into live_audit_logs (target_type, target_id, action, before_value, after_value, actor, note)
         values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`,
        [
          entry.targetType,
          entry.targetId,
          entry.action,
          JSON.stringify(entry.before ?? null),
          JSON.stringify(entry.after ?? null),
          entry.actor,
          entry.note ?? null,
        ],
      );
    },

    async listAudit(limit) {
      const rows = await sql<SqlRowLike>(
        'select * from live_audit_logs order by created_at desc, id desc limit $1',
        [limit],
      );
      return rows.map((row) => ({
        id: Number(row.id),
        targetType: String(row.target_type),
        targetId: String(row.target_id),
        action: String(row.action),
        before: json(row.before_value),
        after: json(row.after_value),
        actor: String(row.actor),
        note: row.note == null ? null : String(row.note),
        createdAt: req(row.created_at),
      }));
    },

    async startRun(source, trigger) {
      const [row] = await sql<SqlRowLike>(
        'insert into live_ingestion_runs (source, trigger) values ($1,$2) returning id',
        [source, trigger],
      );
      return Number(row.id);
    },

    async finishRun(id, result) {
      await sql(
        `update live_ingestion_runs set
           finished_at = now(), ok = $2, requests = $3, fetched = $4, new_posts = $5,
           duplicates = $6, interpretations = $7, events_upserted = $8,
           error_code = $9, error_message = $10, duration_ms = $11
         where id = $1`,
        [
          id,
          result.ok ?? false,
          result.requests ?? 0,
          result.fetched ?? 0,
          result.newPosts ?? 0,
          result.duplicates ?? 0,
          result.interpretations ?? 0,
          result.eventsUpserted ?? 0,
          result.errorCode ?? null,
          result.errorMessage ?? null,
          result.durationMs ?? null,
        ],
      );
    },

    async listRuns(limit) {
      const rows = await sql<SqlRowLike>(
        'select * from live_ingestion_runs order by started_at desc, id desc limit $1',
        [limit],
      );
      return rows.map((row) => ({
        id: Number(row.id),
        source: String(row.source),
        trigger: String(row.trigger),
        startedAt: req(row.started_at),
        finishedAt: iso(row.finished_at),
        ok: row.ok == null ? null : Boolean(row.ok),
        requests: Number(row.requests ?? 0),
        fetched: Number(row.fetched ?? 0),
        newPosts: Number(row.new_posts ?? 0),
        duplicates: Number(row.duplicates ?? 0),
        interpretations: Number(row.interpretations ?? 0),
        eventsUpserted: Number(row.events_upserted ?? 0),
        errorCode: row.error_code == null ? null : String(row.error_code),
        errorMessage: row.error_message == null ? null : String(row.error_message),
        durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
      }));
    },

    /**
     * Cross-instance lock. A boolean in module scope would only stop a second
     * run *inside the same runtime* — Vercel can and does run two invocations
     * of the same cron on different instances. Expiry is what stops a crashed
     * run from wedging collection forever.
     */
    async acquireLock(key, ttlMs, holder) {
      const rows = await sql<SqlRowLike>(
        `insert into live_locks (lock_key, holder, expires_at)
         values ($1, $2, now() + ($3 || ' milliseconds')::interval)
         on conflict (lock_key) do update set
           holder = excluded.holder,
           acquired_at = now(),
           expires_at = excluded.expires_at
         where live_locks.expires_at < now()
         returning lock_key`,
        [key, holder, String(Math.max(1000, ttlMs))],
      );
      return rows.length > 0;
    },

    async releaseLock(key, holder) {
      await sql('delete from live_locks where lock_key = $1 and holder = $2', [key, holder]);
    },
  };

  return repo;
}
