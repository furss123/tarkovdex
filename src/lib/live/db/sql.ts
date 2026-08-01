import 'server-only';
import postgres from 'postgres';

/**
 * The one database seam.
 *
 * Everything downstream (migrations, repository) talks to a plain
 * `(text, params) => rows` function rather than to a driver object. That is
 * what lets `tests/live-repository.test.ts` run the *real* SQL against an
 * in-process Postgres (PGlite) instead of mocking the storage layer away — a
 * repository test that never executes its own SQL proves nothing.
 *
 * No ORM. The queries here are a couple of dozen statements over eight tables;
 * a schema DSL, a migration generator and a code-gen step would all be more
 * moving parts than the thing they'd be managing.
 */

export type SqlRow = Record<string, unknown>;
export type SqlExecutor = <T = SqlRow>(text: string, params?: unknown[]) => Promise<T[]>;

let pool: postgres.Sql | null = null;
let executor: SqlExecutor | null = null;

export function databaseUrl(): string | undefined {
  // POSTGRES_URL is what the Vercel/Neon integration injects; DATABASE_URL is
  // the portable name. Either works, neither is required.
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(databaseUrl());
}

/**
 * Null when no connection string is configured. Every caller must handle that:
 * a missing database degrades the site to its pre-existing Steam-only news
 * path, it never throws a page.
 */
export function getSql(): SqlExecutor | null {
  const url = databaseUrl();
  if (!url) return null;
  if (!executor) {
    pool = postgres(url, {
      // Serverless: one connection per invocation, and no prepared statements
      // because transaction-mode poolers (pgBouncer, Neon's pooler, Supabase's)
      // reject them.
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
    const sql = pool;
    executor = async <T>(text: string, params: unknown[] = []) =>
      (await sql.unsafe(text, params as never[])) as unknown as T[];
  }
  return executor;
}

/** Test seam — lets a suite install PGlite (or anything else) as the executor. */
export function setSqlExecutor(next: SqlExecutor | null): void {
  executor = next;
}

/** Redacts credentials before anything about the connection reaches a log or
 * an admin screen. */
export function describeDatabase(): string {
  const url = databaseUrl();
  if (!url) return 'not configured';
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return 'configured';
  }
}
