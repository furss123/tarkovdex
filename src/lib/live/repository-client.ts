import 'server-only';
import { createRepository, type LiveRepository } from './repository';
import { getSql, isDatabaseConfigured } from './db/sql';

/**
 * One accessor so every caller handles "no database" the same way: `null`, not
 * a thrown page. Local development, CI and a preview deployment all run without
 * one, and the site is expected to keep working there — with the Steam-only
 * board it had before this system existed.
 */

let repository: LiveRepository | null = null;

export function getRepository(): LiveRepository | null {
  if (!isDatabaseConfigured()) return null;
  if (!repository) {
    const sql = getSql();
    if (!sql) return null;
    repository = createRepository(sql);
  }
  return repository;
}

/** Test seam — lets a suite drive the real pipeline against PGlite. */
export function setRepository(next: LiveRepository | null): void {
  repository = next;
}
