import type { NewsStory } from '@/types/newsroom';

const DAY = 86_400_000;
const TERMINAL = new Set(['resolved', 'completed', 'cancelled']);

export function isPinnedStory(story: NewsStory, latestPatchId?: string): boolean {
  if (story.id === latestPatchId) return true;
  if (TERMINAL.has(story.status)) return false;
  return story.status === 'scheduled' || story.status === 'active' || story.status === 'extended' ||
    story.category === 'outage' || story.category === 'maintenance' || story.category === 'drops' ||
    story.category === 'contest' || story.category === 'sale' || story.category === 'expo';
}

export function lifecycleVisible(story: NewsStory, now: number, latestPatchId?: string): boolean {
  if (story.hiddenAt || story.archivedAt) return false;
  if (isPinnedStory(story, latestPatchId)) return true;
  const terminalAt = Date.parse(story.updatedAt || story.publishedAt);
  const age = now - terminalAt;
  if (story.category === 'maintenance' && story.status === 'completed') return age <= DAY;
  if (story.category === 'outage' && story.status === 'resolved') return age <= 2 * DAY;
  if (['event', 'drops', 'contest'].includes(story.category) && TERMINAL.has(story.status)) return age <= 3 * DAY;
  return now - Date.parse(story.publishedAt) <= 30 * DAY;
}

export function selectLifecycleFeed(stories: NewsStory[], now: number, limit = 50): NewsStory[] {
  const latestPatch = [...stories].filter((story) => story.category === 'patch')
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0]?.id;
  return [...stories].filter((story) => lifecycleVisible(story, now, latestPatch))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, Math.min(limit, 50));
}
