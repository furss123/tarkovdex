import type { NewsCategoryV2, NewsGame, NewsSection, NewsStory, NewsStoryStatus } from '@/types/newsroom';

export interface NewsFeedFilters { section: NewsSection | 'all'; category: NewsCategoryV2 | 'all'; game: NewsGame | 'all'; status: NewsStoryStatus | 'all'; }
const SECTIONS = new Set(['game', 'media-promo', 'all']);
const GAMES = new Set(['eft', 'arena', 'both', 'unknown', 'all']);
const STATUSES = new Set(['scheduled', 'active', 'extended', 'resolved', 'completed', 'cancelled', 'unknown', 'all']);

export function parseNewsFeedFilters(input: Record<string, string | null | undefined>, categories: readonly string[]): NewsFeedFilters {
  const section = SECTIONS.has(input.section ?? '') ? input.section as NewsFeedFilters['section'] : 'game';
  const category = input.category === 'all' || categories.includes(input.category ?? '') ? input.category as NewsFeedFilters['category'] : 'all';
  const game = GAMES.has(input.game ?? '') ? input.game as NewsFeedFilters['game'] : 'all';
  const status = STATUSES.has(input.status ?? '') ? input.status as NewsFeedFilters['status'] : 'all';
  return { section, category, game, status };
}

export function matchesNewsFilters(story: NewsStory, filters: NewsFeedFilters): boolean {
  return (filters.section === 'all' || story.section === filters.section) &&
    (filters.category === 'all' || story.category === filters.category) &&
    (filters.game === 'all' || story.game === filters.game || story.game === 'both') &&
    (filters.status === 'all' || story.status === filters.status);
}
