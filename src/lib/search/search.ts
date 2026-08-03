import { normalizeSearchText, truncateQuery } from './normalize';
import { scoreSearchDocument } from './score';
import {
  DEFAULT_DOMAIN_ORDER,
  MAX_RESULTS_PER_DOMAIN,
  MAX_RESULTS_TOTAL,
  type ScoredSearchDocument,
  type SearchDocument,
  type SearchDomain,
  type SearchGroup,
  type SearchResultSet,
} from './types';

export function deduplicateResults(hits: ScoredSearchDocument[]): ScoredSearchDocument[] {
  const seen = new Set<string>();
  const out: ScoredSearchDocument[] = [];
  for (const hit of hits) {
    const key = `${hit.document.domain}:${hit.document.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

function compareHits(a: ScoredSearchDocument, b: ScoredSearchDocument): number {
  return (
    b.score - a.score ||
    a.document.title.localeCompare(b.document.title) ||
    a.document.id.localeCompare(b.document.id)
  );
}

export function groupSearchResults(
  hits: ScoredSearchDocument[],
  options: {
    domainOrder?: readonly SearchDomain[];
    perDomainLimit?: number;
    totalLimit?: number;
  } = {},
): SearchResultSet['groups'] {
  const domainOrder = options.domainOrder ?? DEFAULT_DOMAIN_ORDER;
  const perDomain = options.perDomainLimit ?? MAX_RESULTS_PER_DOMAIN;
  const totalLimit = options.totalLimit ?? MAX_RESULTS_TOTAL;

  const byDomain = new Map<SearchDomain, ScoredSearchDocument[]>();
  for (const hit of hits) {
    const list = byDomain.get(hit.document.domain) ?? [];
    list.push(hit);
    byDomain.set(hit.document.domain, list);
  }

  for (const list of byDomain.values()) {
    list.sort(compareHits);
  }

  // Promote domains that have an exact-ish top hit.
  const rankedDomains = [...domainOrder].sort((a, b) => {
    const aTop = byDomain.get(a)?.[0];
    const bTop = byDomain.get(b)?.[0];
    const aBoost = aTop && aTop.score >= 750 ? aTop.score : 0;
    const bBoost = bTop && bTop.score >= 750 ? bTop.score : 0;
    return bBoost - aBoost || domainOrder.indexOf(a) - domainOrder.indexOf(b);
  });

  const groups: SearchGroup[] = [];
  let remaining = totalLimit;
  for (const domain of rankedDomains) {
    if (remaining <= 0) break;
    const list = byDomain.get(domain);
    if (!list?.length) continue;
    const slice = list.slice(0, Math.min(perDomain, remaining));
    remaining -= slice.length;
    groups.push({ domain, results: slice });
  }
  return groups;
}

export interface SearchDocumentsOptions {
  locale?: string;
  domain?: SearchDomain | null;
  gameMode?: 'regular' | 'pve' | null;
  perDomainLimit?: number;
  totalLimit?: number;
}

/**
 * Pure search over an already-built document list. Does not fetch, does not
 * touch storage, and does not invent missing numeric fields.
 */
export function searchDocuments(
  documents: readonly SearchDocument[],
  rawQuery: string,
  options: SearchDocumentsOptions = {},
): SearchResultSet {
  const { query, truncated: queryTruncated } = truncateQuery(rawQuery);
  const normalizedQuery = normalizeSearchText(query, options.locale);

  if (!normalizedQuery) {
    return {
      query,
      normalizedQuery: '',
      groups: [],
      total: 0,
      truncated: queryTruncated,
    };
  }

  const hits: ScoredSearchDocument[] = [];
  for (const document of documents) {
    if (options.domain && document.domain !== options.domain) continue;
    if (options.gameMode && !document.gameModes.includes(options.gameMode)) continue;
    const scored = scoreSearchDocument(document, normalizedQuery, options.locale);
    if (scored) hits.push(scored);
  }

  const deduped = deduplicateResults(hits).sort(compareHits);
  const groups = groupSearchResults(deduped, {
    perDomainLimit: options.perDomainLimit,
    totalLimit: options.totalLimit,
  });
  const total = groups.reduce((sum, group) => sum + group.results.length, 0);

  return {
    query,
    normalizedQuery,
    groups,
    total,
    truncated:
      queryTruncated ||
      deduped.length > total ||
      deduped.some((hit) => {
        const group = groups.find((g) => g.domain === hit.document.domain);
        return !group?.results.some((r) => r.document.id === hit.document.id);
      }),
  };
}

export function isSearchDomain(value: unknown): value is SearchDomain {
  return (
    value === 'item' ||
    value === 'ammo' ||
    value === 'armor' ||
    value === 'task' ||
    value === 'craft' ||
    value === 'gunsmith' ||
    value === 'map'
  );
}
