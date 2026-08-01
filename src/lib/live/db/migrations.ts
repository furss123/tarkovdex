import type { SqlExecutor } from './sql';

/**
 * Migrations as data, not as files on disk.
 *
 * A `.sql` file would need `fs` at runtime, which is exactly the thing that
 * breaks once Next traces a serverless bundle. Statements live here as strings,
 * get applied in order, and are recorded in `live_migrations` so re-running is
 * a no-op. Every statement is additionally written `if not exists`, so even a
 * database whose ledger was lost converges instead of erroring.
 *
 * Never edit a shipped migration — append a new one.
 */

export interface Migration {
  id: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    id: '0001_live_core',
    statements: [
      `create table if not exists live_source_states (
        source_key text primary key,
        source_type text not null,
        account text not null default '',
        external_id text,
        active boolean not null default true,
        since_id text,
        cursor text,
        last_success_at timestamptz,
        last_attempt_at timestamptz,
        last_error text,
        last_error_at timestamptz,
        consecutive_failures integer not null default 0,
        next_retry_at timestamptz,
        updated_at timestamptz not null default now()
      )`,

      `create table if not exists live_raw_posts (
        id text primary key,
        source text not null,
        source_account text not null default '',
        source_post_id text not null,
        url text,
        title text not null,
        content text not null,
        published_at timestamptz not null,
        media jsonb not null default '[]'::jsonb,
        payload jsonb,
        content_hash text not null,
        collected_at timestamptz not null default now(),
        last_seen_at timestamptz not null default now(),
        revoked boolean not null default false,
        edited boolean not null default false,
        interpret_status text not null default 'pending',
        interpret_attempts integer not null default 0,
        interpret_error text,
        processed_at timestamptz
      )`,
      `create unique index if not exists live_raw_posts_source_key
        on live_raw_posts (source, source_account, source_post_id)`,
      `create index if not exists live_raw_posts_pending
        on live_raw_posts (interpret_status, published_at desc)`,
      `create index if not exists live_raw_posts_hash on live_raw_posts (content_hash)`,
      `create index if not exists live_raw_posts_published on live_raw_posts (published_at desc)`,

      `create table if not exists live_interpretations (
        id bigserial primary key,
        raw_post_id text not null references live_raw_posts (id) on delete cascade,
        provider text not null,
        model text not null,
        prompt_version text not null,
        schema_version text not null,
        content jsonb not null default '{}'::jsonb,
        game_modes text[] not null default '{}',
        category text,
        event_intent text,
        maps text[] not null default '{}',
        bosses text[] not null default '{}',
        traders text[] not null default '{}',
        items text[] not null default '{}',
        quests text[] not null default '{}',
        starts_at timestamptz,
        starts_at_evidence text,
        ends_at timestamptz,
        ends_at_evidence text,
        reliability_suggestion text,
        requires_review boolean not null default true,
        review_reason text,
        ambiguity text[] not null default '{}',
        raw_response jsonb,
        is_current boolean not null default true,
        created_at timestamptz not null default now()
      )`,
      `create unique index if not exists live_interpretations_post_version
        on live_interpretations (raw_post_id, prompt_version)`,

      `create table if not exists live_events (
        id text primary key,
        slug text not null,
        category text not null default 'unknown',
        status text not null default 'unknown',
        reliability text not null default 'unverified',
        review_status text not null default 'pending_review',
        game_modes text[] not null default '{}',
        affects text[] not null default '{}',
        maps text[] not null default '{}',
        bosses text[] not null default '{}',
        traders text[] not null default '{}',
        items text[] not null default '{}',
        quests text[] not null default '{}',
        tags text[] not null default '{}',
        starts_at timestamptz,
        ends_at timestamptz,
        end_confirmed boolean not null default false,
        content jsonb not null default '{}'::jsonb,
        overrides jsonb not null default '{}'::jsonb,
        manual_fields text[] not null default '{}',
        primary_post_id text references live_raw_posts (id) on delete set null,
        first_seen_at timestamptz not null default now(),
        published_at timestamptz,
        last_confirmed_at timestamptz,
        ended_at timestamptz,
        review_note text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )`,
      `create unique index if not exists live_events_slug on live_events (slug)`,
      `create index if not exists live_events_review on live_events (review_status)`,
      `create index if not exists live_events_window on live_events (starts_at, ends_at)`,

      `create table if not exists live_event_sources (
        event_id text not null references live_events (id) on delete cascade,
        raw_post_id text not null references live_raw_posts (id) on delete cascade,
        role text not null default 'initial',
        linked_at timestamptz not null default now(),
        primary key (event_id, raw_post_id)
      )`,
      // A raw post belongs to exactly one board item — otherwise the same
      // announcement renders twice.
      `create unique index if not exists live_event_sources_post
        on live_event_sources (raw_post_id)`,

      `create table if not exists live_audit_logs (
        id bigserial primary key,
        target_type text not null,
        target_id text not null,
        action text not null,
        before_value jsonb,
        after_value jsonb,
        actor text not null default 'system',
        note text,
        created_at timestamptz not null default now()
      )`,
      `create index if not exists live_audit_logs_target
        on live_audit_logs (target_type, target_id, created_at desc)`,

      `create table if not exists live_ingestion_runs (
        id bigserial primary key,
        source text not null,
        trigger text not null default 'cron',
        started_at timestamptz not null default now(),
        finished_at timestamptz,
        ok boolean,
        requests integer not null default 0,
        fetched integer not null default 0,
        new_posts integer not null default 0,
        duplicates integer not null default 0,
        interpretations integer not null default 0,
        events_upserted integer not null default 0,
        error_code text,
        error_message text,
        duration_ms integer
      )`,
      `create index if not exists live_ingestion_runs_recent
        on live_ingestion_runs (started_at desc)`,

      `create table if not exists live_locks (
        lock_key text primary key,
        holder text not null,
        acquired_at timestamptz not null default now(),
        expires_at timestamptz not null
      )`,
    ],
  },
];

/**
 * Idempotent by construction: the ledger skips applied ids, and every
 * statement is `if not exists` anyway. Safe to call on every cold start.
 */
export async function migrate(sql: SqlExecutor): Promise<string[]> {
  await sql(`create table if not exists live_migrations (
    id text primary key,
    applied_at timestamptz not null default now()
  )`);

  const applied = new Set(
    (await sql<{ id: string }>('select id from live_migrations')).map((row) => row.id),
  );

  const ran: string[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    for (const statement of migration.statements) await sql(statement);
    await sql('insert into live_migrations (id) values ($1) on conflict do nothing', [migration.id]);
    ran.push(migration.id);
  }
  return ran;
}
