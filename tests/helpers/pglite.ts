import { PGlite } from '@electric-sql/pglite';
import type { SqlExecutor } from '../../src/lib/live/db/sql';
import { createRepository, type LiveRepository } from '../../src/lib/live/repository';

/**
 * A real Postgres for the test suite. PGlite is Postgres compiled to WASM, so
 * the migrations and every repository query below execute against genuine
 * Postgres semantics — unique constraints, `on conflict`, `xmax`, arrays,
 * `jsonb`, intervals — rather than against a hand-written fake that would
 * happily agree with a broken query.
 */
export interface TestDb {
  sql: SqlExecutor;
  repo: LiveRepository;
  close: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  const sql: SqlExecutor = async <T>(text: string, params: unknown[] = []) => {
    const result = await db.query(text, params as unknown[]);
    return result.rows as T[];
  };
  const repo = createRepository(sql);
  await repo.migrate();
  return { sql, repo, close: () => db.close() };
}
