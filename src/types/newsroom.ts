export type OfficialNewsSource = 'telegram-en' | 'telegram-ru' | 'official-web';
export type NewsSection = 'game' | 'media-promo';

export type GameNewsCategory =
  | 'patch' | 'hotfix' | 'maintenance' | 'outage' | 'event' | 'quest'
  | 'trader' | 'economy' | 'item' | 'ammo' | 'armor' | 'gameplay' | 'map'
  | 'boss' | 'spawn' | 'xp-reward' | 'season-wipe' | 'account-security'
  | 'other-game';

export type MediaPromoCategory =
  | 'video' | 'trailer' | 'teaser' | 'broadcast' | 'expo' | 'tournament'
  | 'esports' | 'contest' | 'drops' | 'sale' | 'merchandise' | 'community'
  | 'company' | 'other-promo';

export type NewsCategoryV2 = GameNewsCategory | MediaPromoCategory;
export type NewsStoryStatus =
  | 'scheduled' | 'active' | 'extended' | 'resolved' | 'completed'
  | 'cancelled' | 'unknown';
export type NewsReviewStatus = 'unreviewed' | 'needs-review' | 'reviewed' | 'rejected';
export type NewsTranslationStatus = 'source' | 'machine-draft' | 'reviewed' | 'fallback';
export type NewsGame = 'eft' | 'arena' | 'both' | 'unknown';

export interface OfficialSourcePost {
  id: string;
  source: OfficialNewsSource;
  sourceMessageId: string;
  sourceUrl: string;
  channelId?: string;
  channelUsername?: string;
  sourceLanguage: 'en' | 'ru';
  publishedAt: string;
  editedAt?: string;
  rawText?: string;
  normalizedText: string;
  textHash: string;
  linkedOfficialUrls: string[];
  mediaKinds: Array<'image' | 'video' | 'document' | 'link'>;
  fetchedAt?: string;
  importedAt: string;
}

export interface NewsStory {
  id: string;
  canonicalKey: string;
  section: NewsSection;
  category: NewsCategoryV2;
  tags: string[];
  game: NewsGame;
  gameModes: Array<'regular' | 'pve'>;
  status: NewsStoryStatus;
  importance: 'critical' | 'high' | 'normal' | 'low';
  startsAt?: string;
  endsAt?: string;
  sourcePostIds: string[];
  sourceUrls: string[];
  publishedAt: string;
  updatedAt: string;
  hiddenAt?: string;
  archivedAt?: string;
}

export interface NewsStoryTranslation {
  storyId: string;
  locale: 'ko' | 'en' | 'zh';
  title: string;
  summary: string;
  facts: string[];
  actionLabel?: string;
  actionUrl?: string;
  translationStatus: NewsTranslationStatus;
  translatedAt?: string;
  reviewedAt?: string;
  sourceLanguage: 'en' | 'ru';
}

export interface NewsTranslationDraft {
  title: string;
  summary: string;
  facts: string[];
  startsAt?: string;
  endsAt?: string;
  game?: NewsGame;
  gameModes?: Array<'regular' | 'pve'>;
  warnings: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface TranslationStyleCheck {
  hasLiteralTranslationPattern: boolean;
  hasAICliche: boolean;
  hasExcessiveHonorifics: boolean;
  hasMarketingLanguage: boolean;
  hasRepeatedSentencePattern: boolean;
  hasUnsupportedFact: boolean;
  hasMissingImportantFact: boolean;
  hasTerminologyMismatch: boolean;
  isOverlongForSource: boolean;
  requiresReview: boolean;
}

export interface OfficialNewsSourceAdapter {
  readonly source: OfficialNewsSource;
  fetchSince(input: { after?: string; limit: number }): Promise<OfficialSourcePost[]>;
}

export interface NewsTranslationProvider {
  translate(input: {
    sourceLanguage: 'en' | 'ru';
    locale: 'ko' | 'en' | 'zh';
    text: string;
    category: string;
    section: NewsSection;
    sourceUrl: string;
    linkedOfficialText?: string;
    glossary: TranslationGlossaryEntry[];
  }): Promise<NewsTranslationDraft>;
}

export interface TranslationGlossaryEntry {
  sourceTerms: string[];
  ko: string;
  en?: string;
  zh?: string;
  preserveOriginal?: boolean;
  notes?: string;
}
