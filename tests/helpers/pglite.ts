import { PGlite } from '@electric-sql/pglite';
import {
  NESTED_TRANSACTION_ERROR,
  type SqlExecutor,
  type SqlRow,
} from '../../src/lib/live/db/sql';
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

function pgliteExecutor(db: PGlite, inTransaction = false): SqlExecutor {
  const sql = (async <T = SqlRow>(text: string, params: unknown[] = []) => {
    const result = await db.query(text, params as unknown[]);
    return result.rows as T[];
  }) as SqlExecutor;
  sql.inTransaction = inTransaction;
  sql.transaction = async <T>(work: (transactionSql: SqlExecutor) => Promise<T>) => {
    if (inTransaction) throw new Error(NESTED_TRANSACTION_ERROR);
    await sql('begin');
    try {
      const result = await work(pgliteExecutor(db, true));
      await sql('commit');
      return result;
    } catch (error) {
      await sql('rollback');
      throw error;
    }
  };
  return sql;
}

/** Wraps the real PGlite executor while preserving its transaction semantics. */
export function withQueryHook(
  base: SqlExecutor,
  beforeQuery: (text: string, params: unknown[]) => void | Promise<void>,
): SqlExecutor {
  const wrap = (current: SqlExecutor): SqlExecutor => {
    const sql = (async <T = SqlRow>(text: string, params: unknown[] = []) => {
      await beforeQuery(text, params);
      return current<T>(text, params);
    }) as SqlExecutor;
    sql.inTransaction = current.inTransaction;
    sql.transaction = async <T>(work: (transactionSql: SqlExecutor) => Promise<T>) =>
      current.transaction((transactionSql) => work(wrap(transactionSql)));
    return sql;
  };
  return wrap(base);
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  const sql = pgliteExecutor(db);
  const repo = createRepository(sql);
  await repo.migrate();
  return { sql, repo, close: () => db.close() };
}
