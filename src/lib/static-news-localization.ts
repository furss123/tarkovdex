import 'server-only';
import type { Locale } from '@/i18n/routing';
import type { NewsItem, SteamNewsFeed } from './steam-news';
import newsKo from './news-ko.json';
import newsZh from './news-zh.json';

/**
 * File-only news localization for public render fallbacks.
 *
 * This module intentionally has no provider SDK, environment access, or
 * network call. A newly published Steam post that has not been translated
 * offline remains in its original English until the ingestion/offline path
 * stores a reviewed translation.
 */

export interface StoredNewsTranslation {
  title: string;
  content: string;
}

const STORED_TRANSLATIONS: Record<'ko' | 'zh', Record<string, StoredNewsTranslation>> = {
  ko: newsKo,
  zh: newsZh,
};

export function getStoredNewsTranslation(
  locale: Locale,
  id: string,
): StoredNewsTranslation | null {
  if (locale === 'en') return null;
  return STORED_TRANSLATIONS[locale][id] ?? null;
}

export function localizeNewsFromFiles(
  feed: SteamNewsFeed,
  locale: Locale,
): SteamNewsFeed {
  if (locale === 'en') return feed;

  const localize = (item: NewsItem): NewsItem => {
    const stored = getStoredNewsTranslation(locale, item.id);
    return stored ? { ...item, ...stored } : item;
  };

  return {
    patchNotes: feed.patchNotes.map(localize),
    events: feed.events.map(localize),
  };
}
