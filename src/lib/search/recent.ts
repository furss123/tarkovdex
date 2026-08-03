import { normalizeSearchText, truncateQuery } from './normalize';
import { isSearchDomain } from './search';
import type { SearchDomain } from './types';

export const MAX_RECENT_SEARCHES = 10;
export const MAX_RECENT_QUERY_LENGTH = 100;
export const MIN_RECENT_QUERY_LENGTH = 1;

export interface RecentSearchEntry {
  query: string;
  normalizedQuery: string;
  selectedDomain?: SearchDomain;
  selectedId?: string;
  searchedAt: string;
}

export function isValidRecentSearchEntry(value: unknown): value is RecentSearchEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.query !== 'string' || entry.query.length === 0) return false;
  if (entry.query.length > MAX_RECENT_QUERY_LENGTH) return false;
  if (typeof entry.normalizedQuery !== 'string' || entry.normalizedQuery.length === 0) {
    return false;
  }
  if (typeof entry.searchedAt !== 'string' || !Number.isFinite(Date.parse(entry.searchedAt))) {
    return false;
  }
  if (entry.selectedDomain !== undefined && !isSearchDomain(entry.selectedDomain)) return false;
  if (entry.selectedId !== undefined) {
    if (typeof entry.selectedId !== 'string' || entry.selectedId.length === 0) return false;
    if (entry.selectedId.length > 200) return false;
  }
  return true;
}

export function recoverRecentSearches(value: unknown): RecentSearchEntry[] {
  if (!Array.isArray(value)) return [];
  const kept: RecentSearchEntry[] = [];
  for (const entry of value.slice(0, MAX_RECENT_SEARCHES * 2)) {
    if (!isValidRecentSearchEntry(entry)) continue;
    kept.push({
      query: entry.query.slice(0, MAX_RECENT_QUERY_LENGTH),
      normalizedQuery: entry.normalizedQuery.slice(0, MAX_RECENT_QUERY_LENGTH),
      selectedDomain: entry.selectedDomain,
      selectedId: entry.selectedId,
      searchedAt: entry.searchedAt,
    });
    if (kept.length >= MAX_RECENT_SEARCHES) break;
  }
  return kept;
}

/**
 * Insert or promote a recent search. Empty / whitespace-only queries are
 * rejected. Same normalized query collapses to one entry at the front.
 */
export function pushRecentSearch(
  existing: readonly RecentSearchEntry[],
  input: {
    query: string;
    locale?: string;
    selectedDomain?: SearchDomain;
    selectedId?: string;
    searchedAt: string;
  },
): RecentSearchEntry[] {
  const { query } = truncateQuery(input.query);
  if (query.length < MIN_RECENT_QUERY_LENGTH) return [...existing];
  if (query.length > MAX_RECENT_QUERY_LENGTH) return [...existing];

  const normalizedQuery = normalizeSearchText(query, input.locale);
  if (!normalizedQuery) return [...existing];

  const entry: RecentSearchEntry = {
    query: query.slice(0, MAX_RECENT_QUERY_LENGTH),
    normalizedQuery,
    searchedAt: input.searchedAt,
  };
  if (input.selectedDomain) entry.selectedDomain = input.selectedDomain;
  if (input.selectedId) entry.selectedId = input.selectedId;

  const rest = existing.filter((row) => row.normalizedQuery !== normalizedQuery);
  return [entry, ...rest].slice(0, MAX_RECENT_SEARCHES);
}

export function clearRecentSearches(): RecentSearchEntry[] {
  return [];
}

export function removeRecentSearch(
  existing: readonly RecentSearchEntry[],
  normalizedQuery: string,
): RecentSearchEntry[] {
  return existing.filter((row) => row.normalizedQuery !== normalizedQuery);
}
