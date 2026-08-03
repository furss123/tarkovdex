import postgres from 'postgres';
import { MIGRATIONS, migrate } from '../src/lib/live/db/migrations';
import type { SqlExecutor } from '../src/lib/live/db/sql';

const REQUIRED_TABLES = [
  'live_migrations',
  'live_source_states',
  'live_raw_posts',
  'live_interpretations',
  'live_events',
  'live_event_sources',
  'live_audit_logs',
  'live_ingestion_runs',
  'live_locks',
] as const;

const REQUIRED_INDEXES = [
  'live_raw_posts_source_key',
  'live_raw_posts_pending',
  'live_raw_posts_hash',
  'live_raw_posts_published',
  'live_interpretations_post_version',
  'live_events_slug',
  'live_events_review',
  'live_events_window',
  'live_event_sources_post',
  'live_audit_logs_target',
  'live_ingestion_runs_recent',
] as const;

const REQUIRED_FOREIGN_KEYS = [
  'live_interpretations_raw_post_id_fkey',
  'live_events_primary_post_id_fkey',
  'live_event_sources_event_id_fkey',
  'live_event_sources_raw_post_id_fkey',
] as const;

function migrationUrl(): string {
  const url =
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;

  if (!url) throw new Error('database_url_not_configured');

  const parsed = new URL(url);
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('database_url_protocol_invalid');
  }
  if (parsed.searchParams.get('sslmode') !== 'require') {
    throw new Error('database_sslmode_must_be_require');
  }
  return url;
}

function executorFor(client: postgres.Sql): SqlExecutor {
  const sql = (async <T>(text: string, params: unknown[] = []) =>
    (await client.unsafe(text, params as never[])) as unknown as T[]) as SqlExecutor;
  sql.inTransaction = false;
  sql.transaction = async <T>(work: (transactionSql: SqlExecutor) => Promise<T>) => {
    const reserved = await client.reserve();
    const transactionSql = (async <TRow>(text: string, params: unknown[] = []) =>
      (await reserved.unsafe(text, params as never[])) as unknown as TRow[]) as SqlExecutor;
    transactionSql.inTransaction = true;
    transactionSql.transaction = async () => {
      throw new Error('nested_transaction_not_supported');
    };

    let began = false;
    try {
      await transactionSql('begin');
      began = true;
      const result = await work(transactionSql);
      await transactionSql('commit');
      began = false;
      return result;
    } catch (error) {
      if (began) {
        try {
          await transactionSql('rollback');
        } catch {
          // Preserve the migration failure; the reserved connection will be
          // discarded by postgres.js if it is no longer usable.
        }
      }
      throw error;
    } finally {
      reserved.release();
    }
  };
  return sql;
}

function missing(required: readonly string[], actual: string[]): string[] {
  const names = new Set(actual);
  return required.filter((name) => !names.has(name));
}

async function main() {
  const client = postgres(migrationUrl(), {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 5,
    onnotice: () => {},
  });

  const sql = executorFor(client);

  try {
    const applied = await migrate(sql);
    const [database] = await sql<{
      database_name: string;
      postgres_version: string;
      schema_name: string;
    }>(`select current_database() as database_name,
              current_setting('server_version') as postgres_version,
              current_schema() as schema_name`);
    const [tables] = await sql<{ count: string }>(
      "select count(*)::text as count from information_schema.tables where table_schema = 'public' and table_name like 'live_%'",
    );
    const [indexes] = await sql<{ count: string }>(
      "select count(*)::text as count from pg_indexes where schemaname = 'public' and tablename like 'live_%'",
    );
    const [constraints] = await sql<{ count: string }>(
      `select count(*)::text as count
         from information_schema.table_constraints
        where table_schema = 'public' and table_name like 'live_%'`,
    );
    const tableRows = await sql<{ name: string }>(
      "select tablename as name from pg_tables where schemaname = 'public' and tablename like 'live_%' order by tablename",
    );
    const indexRows = await sql<{ name: string }>(
      "select indexname as name from pg_indexes where schemaname = 'public' and tablename like 'live_%' order by indexname",
    );
    const foreignKeyRows = await sql<{ name: string }>(
      `select constraint_name as name
         from information_schema.table_constraints
        where table_schema = 'public'
          and table_name like 'live_%'
          and constraint_type = 'FOREIGN KEY'
        order by constraint_name`,
    );
    const migrationRows = await sql<{ id: string }>('select id from live_migrations order by id');
    const missingTables = missing(REQUIRED_TABLES, tableRows.map((row) => row.name));
    const missingIndexes = missing(REQUIRED_INDEXES, indexRows.map((row) => row.name));
    const missingForeignKeys = missing(REQUIRED_FOREIGN_KEYS, foreignKeyRows.map((row) => row.name));
    const missingMigrations = missing(
      MIGRATIONS.map((migration) => migration.id),
      migrationRows.map((row) => row.id),
    );

    if (missingTables.length || missingIndexes.length || missingForeignKeys.length || missingMigrations.length) {
      throw new Error(
        `schema_drift:${JSON.stringify({ missingTables, missingIndexes, missingForeignKeys, missingMigrations })}`,
      );
    }

    console.log(
      JSON.stringify({
        ok: true,
        applied,
        database: database.database_name,
        postgresVersion: database.postgres_version,
        schema: database.schema_name,
        tables: Number(tables.count),
        indexes: Number(indexes.count),
        constraints: Number(constraints.count),
        migrations: migrationRows.map((row) => row.id),
        missingTables,
        missingIndexes,
        missingForeignKeys,
      }),
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : 'migration_failed';
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
});
