import type { NewsCategoryV2, NewsGame, OfficialSourcePost } from '@/types/newsroom';

export type DuplicateReason = 'same-id' | 'same-url' | 'same-text' | 'same-official-link' | 'none';

export function duplicateReason(a: OfficialSourcePost, b: OfficialSourcePost): DuplicateReason {
  if (a.id === b.id || (a.source === b.source && a.sourceMessageId === b.sourceMessageId)) return 'same-id';
  if (a.sourceUrl === b.sourceUrl) return 'same-url';
  if (a.textHash && a.textHash === b.textHash) return 'same-text';
  if (a.linkedOfficialUrls.some((url) => b.linkedOfficialUrls.includes(url))) return 'same-official-link';
  return 'none';
}

export function dedupeOfficialPosts(posts: OfficialSourcePost[]): OfficialSourcePost[] {
  const kept: OfficialSourcePost[] = [];
  for (const post of [...posts].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt))) {
    const index = kept.findIndex((candidate) => duplicateReason(candidate, post) !== 'none');
    if (index < 0) kept.push(post);
    else if (post.editedAt && (!kept[index].editedAt || Date.parse(post.editedAt) > Date.parse(kept[index].editedAt!))) kept[index] = post;
  }
  return kept;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export function canonicalStoryKey(input: {
  post: OfficialSourcePost; category: NewsCategoryV2; game: NewsGame; startsAt?: string;
}): string {
  const { post, category, game } = input;
  const patch = post.normalizedText.match(/(?:patch|патч)\s*(?:version\s*)?([0-9]+(?:\.[0-9]+){1,4})/i)?.[1];
  if (patch) return `patch:${patch}:${game}`;
  const official = post.linkedOfficialUrls[0];
  if (official) return `${category}:url:${slug(new URL(official).pathname)}:${game}`;
  const date = (input.startsAt ?? post.publishedAt).slice(0, 10);
  // Hash, not title similarity: uncertain stories remain separate for review.
  return `${category}:${date}:${game}:${post.textHash}`;
}
