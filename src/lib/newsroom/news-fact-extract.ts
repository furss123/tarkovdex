const TIME_OR_NUMBER = /\b(?:\d+(?:[.:]\d+)*(?:\s*(?:hours?|minutes?|days?|%|€|\$))?|approximately|may|expected|planned|temporarily)\b/i;

/** Conservative extraction: retain only source sentences carrying a date,
 * duration, quantity, availability statement, or explicit game scope. */
export function extractNewsFacts(sourceText: string, limit = 7): string[] {
  return sourceText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => TIME_OR_NUMBER.test(item) || /unavailable|available|extended|completed|resolved|#?tarkov/i.test(item))
    .slice(0, Math.max(0, Math.min(limit, 7)));
}
