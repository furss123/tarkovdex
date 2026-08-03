/**
 * Pure signal for the Latest News "새 공식 소식" banner. The board keeps the
 * user's scroll position and only prompts when a silent refresh brought a
 * newer official publication time than the one they have already seen.
 */
export function hasNewerOfficialPost(
  seenPublishedAt: string | null,
  newestPublishedAt: string | null,
): boolean {
  if (!seenPublishedAt || !newestPublishedAt) return false;
  const seen = Date.parse(seenPublishedAt);
  const newest = Date.parse(newestPublishedAt);
  if (!Number.isFinite(seen) || !Number.isFinite(newest)) return false;
  return newest > seen;
}
