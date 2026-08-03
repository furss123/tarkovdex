import {
  editDistanceAtMost,
  normalizeSearchText,
  tokenizeSearchText,
  typoMaxDistance,
} from './normalize';
import type { ScoredSearchDocument, SearchDocument } from './types';
import { MIN_QUERY_LENGTH_FOR_TYPO } from './types';

const SCORE = {
  exactTitle: 1000,
  exactShort: 950,
  prefixTitle: 800,
  exactAlias: 750,
  wordPrefix: 650,
  substringTitle: 500,
  titleEn: 450,
  keyword: 300,
  typo: 150,
} as const;

function bestFieldScore(
  normalizedQuery: string,
  tokens: string[],
  fields: { value: string | undefined; kind: ScoredSearchDocument['matchKind']; score: number }[],
): { score: number; matchKind: ScoredSearchDocument['matchKind'] } | null {
  let best: { score: number; matchKind: ScoredSearchDocument['matchKind'] } | null = null;

  for (const field of fields) {
    if (!field.value) continue;
    const value = field.value;
    if (value === normalizedQuery) {
      const candidate = { score: field.score, matchKind: field.kind };
      if (!best || candidate.score > best.score) best = candidate;
      continue;
    }
    if (field.kind === 'prefix-title' && value.startsWith(normalizedQuery)) {
      const candidate = { score: SCORE.prefixTitle, matchKind: 'prefix-title' as const };
      if (!best || candidate.score > best.score) best = candidate;
      continue;
    }
    if (field.kind === 'substring-title' && value.includes(normalizedQuery)) {
      const candidate = { score: SCORE.substringTitle, matchKind: 'substring-title' as const };
      if (!best || candidate.score > best.score) best = candidate;
    }
  }

  if (tokens.length > 0) {
    for (const field of fields) {
      if (!field.value) continue;
      const words = tokenizeSearchText(field.value);
      if (words.some((word) => word.startsWith(normalizedQuery) || tokens.every((t) => word.startsWith(t) || word.includes(t)))) {
        const wordPrefix = words.some((word) => word.startsWith(normalizedQuery));
        if (wordPrefix) {
          const candidate = { score: SCORE.wordPrefix, matchKind: 'word-prefix' as const };
          if (!best || candidate.score > best.score) best = candidate;
        }
      }
    }
  }

  return best;
}

/**
 * Score one document against an already-normalized query. Returns null when
 * there is no usable match (callers should drop it).
 */
export function scoreSearchDocument(
  document: SearchDocument,
  normalizedQuery: string,
  locale?: string,
): ScoredSearchDocument | null {
  if (!normalizedQuery) return null;

  const title = normalizeSearchText(document.title, locale);
  const titleEn = document.titleEn ? normalizeSearchText(document.titleEn, locale) : '';
  const shortName = document.shortName
    ? normalizeSearchText(document.shortName, locale)
    : '';
  const aliases = document.aliases.map((alias) => normalizeSearchText(alias, locale)).filter(Boolean);
  const keywords = document.keywords.map((kw) => normalizeSearchText(kw, locale)).filter(Boolean);
  const tokens = tokenizeSearchText(normalizedQuery);

  if (title === normalizedQuery) {
    return { document, score: SCORE.exactTitle, matchKind: 'exact-title' };
  }
  if (shortName && shortName === normalizedQuery) {
    return { document, score: SCORE.exactShort, matchKind: 'exact-short' };
  }
  if (aliases.some((alias) => alias === normalizedQuery)) {
    return { document, score: SCORE.exactAlias, matchKind: 'exact-alias' };
  }
  if (title.startsWith(normalizedQuery)) {
    return { document, score: SCORE.prefixTitle, matchKind: 'prefix-title' };
  }

  const titleWords = tokenizeSearchText(title);
  if (titleWords.some((word) => word.startsWith(normalizedQuery))) {
    return { document, score: SCORE.wordPrefix, matchKind: 'word-prefix' };
  }

  if (title.includes(normalizedQuery) || shortName.includes(normalizedQuery)) {
    return { document, score: SCORE.substringTitle, matchKind: 'substring-title' };
  }

  if (titleEn && (titleEn === normalizedQuery || titleEn.startsWith(normalizedQuery) || titleEn.includes(normalizedQuery))) {
    return {
      document,
      score: titleEn === normalizedQuery ? SCORE.titleEn + 50 : SCORE.titleEn,
      matchKind: 'title-en',
    };
  }

  if (
    aliases.some((alias) => alias.startsWith(normalizedQuery) || alias.includes(normalizedQuery)) ||
    keywords.some((kw) => kw === normalizedQuery || kw.includes(normalizedQuery))
  ) {
    return { document, score: SCORE.keyword, matchKind: 'keyword' };
  }

  // Bounded typo check against title / shortName / aliases only — never the
  // whole keyword bag, and never for queries shorter than 3 normalized chars.
  if (normalizedQuery.length >= MIN_QUERY_LENGTH_FOR_TYPO) {
    const max = typoMaxDistance(normalizedQuery.length);
    if (max > 0) {
      const candidates = [title, shortName, ...aliases].filter(Boolean);
      for (const candidate of candidates) {
        // Only compare against similar-length tokens / full strings to keep
        // the work O(candidates), not O(catalog × query).
        if (Math.abs(candidate.length - normalizedQuery.length) > max) continue;
        if (candidate.length > 40) continue;
        const distance = editDistanceAtMost(normalizedQuery, candidate, max);
        if (distance !== null && distance > 0) {
          return {
            document,
            score: SCORE.typo - distance,
            matchKind: 'typo',
          };
        }
      }
    }
  }

  // Multi-token: every token must appear somewhere in the searchable text.
  if (tokens.length > 1) {
    const haystack = [title, titleEn, shortName, ...aliases, ...keywords].join(' ');
    if (tokens.every((token) => haystack.includes(token))) {
      return { document, score: SCORE.substringTitle - 50, matchKind: 'substring-title' };
    }
  }

  void bestFieldScore;
  return null;
}
