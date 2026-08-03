import { MAX_QUERY_LENGTH } from './types';

const COMBINING = /[\u0300-\u036f]/g;
const MULTI_SPACE = /\s+/g;
const SEPARATORS = /[-_./\\]+/g;
const LATIN_PUNCT = /[!"#$%&'()*+,:;<=>?@[\\\]^`{|}~]/g;

/**
 * Normalize user or document text for matching. Keeps Hangul and CJK intact;
 * lowercases with an optional locale (defaults to a language-neutral fold).
 */
export function normalizeSearchText(raw: string, locale?: string): string {
  if (typeof raw !== 'string') return '';
  let text = raw.normalize('NFKC').trim();
  if (!text) return '';
  text = text.replace(COMBINING, '');
  text = locale ? text.toLocaleLowerCase(locale) : text.toLowerCase();
  text = text.replace(SEPARATORS, ' ');
  text = text.replace(LATIN_PUNCT, ' ');
  text = text.replace(MULTI_SPACE, ' ').trim();
  return text.slice(0, MAX_QUERY_LENGTH);
}

export function tokenizeSearchText(normalized: string): string[] {
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

export function truncateQuery(raw: string): { query: string; truncated: boolean } {
  if (typeof raw !== 'string') return { query: '', truncated: false };
  const trimmed = raw.trim();
  if (trimmed.length <= MAX_QUERY_LENGTH) {
    return { query: trimmed, truncated: false };
  }
  return { query: trimmed.slice(0, MAX_QUERY_LENGTH), truncated: true };
}

/** Bounded Levenshtein — returns null when distance would exceed `max`. */
export function editDistanceAtMost(a: string, b: string, max: number): number | null {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return null;
  if (la === 0) return lb <= max ? lb : null;
  if (lb === 0) return la <= max ? la : null;

  let prev = new Array<number>(lb + 1);
  let curr = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j += 1) prev[j] = j;

  for (let i = 1; i <= la; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j += 1) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return null;
    [prev, curr] = [curr, prev];
  }
  const distance = prev[lb];
  return distance <= max ? distance : null;
}

export function typoMaxDistance(normalizedQueryLength: number): number {
  if (normalizedQueryLength < 3) return 0;
  if (normalizedQueryLength <= 5) return 1;
  return 1;
}
