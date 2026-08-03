import type { GameMode } from '@/types/tarkov';

export type SearchDomain =
  | 'item'
  | 'ammo'
  | 'armor'
  | 'task'
  | 'craft'
  | 'gunsmith'
  | 'map';

export const SEARCH_DOMAINS: readonly SearchDomain[] = [
  'item',
  'ammo',
  'armor',
  'task',
  'craft',
  'gunsmith',
  'map',
] as const;

export const DEFAULT_DOMAIN_ORDER: readonly SearchDomain[] = SEARCH_DOMAINS;

export const MAX_RESULTS_TOTAL = 30;
export const MAX_RESULTS_PER_DOMAIN = 5;
export const MAX_QUERY_LENGTH = 100;
export const MIN_QUERY_LENGTH_FOR_TYPO = 3;

export interface SearchDocumentNumeric {
  price?: number;
  traderPrice?: number;
  valuePerSlot?: number;
  freshnessHours?: number;
  penetration?: number;
  damage?: number;
  armorDamage?: number;
  armorClass?: number;
  weight?: number;
  profit?: number;
  profitPerHour?: number;
  level?: number;
  raidDuration?: number;
  bossCount?: number;
  questCount?: number;
  duration?: number;
}

export interface SearchDocumentRelations {
  itemIds?: string[];
  taskIds?: string[];
  mapIds?: string[];
  traderIds?: string[];
  craftIds?: string[];
}

/**
 * Minimal searchable unit. Built server-side from loaders; never carries full
 * API payloads, long descriptions, or React nodes.
 */
export interface SearchDocument {
  id: string;
  domain: SearchDomain;
  title: string;
  titleEn?: string;
  shortName?: string;
  aliases: string[];
  keywords: string[];
  href: string;
  gameModes: GameMode[];
  category?: string;
  subtitle?: string;
  numeric?: SearchDocumentNumeric;
  relations?: SearchDocumentRelations;
}

export interface ScoredSearchDocument {
  document: SearchDocument;
  score: number;
  matchKind:
    | 'exact-title'
    | 'exact-short'
    | 'prefix-title'
    | 'exact-alias'
    | 'word-prefix'
    | 'substring-title'
    | 'title-en'
    | 'keyword'
    | 'typo'
    | 'none';
}

export interface SearchGroup {
  domain: SearchDomain;
  results: ScoredSearchDocument[];
}

export interface SearchResultSet {
  query: string;
  normalizedQuery: string;
  groups: SearchGroup[];
  total: number;
  truncated: boolean;
}

export interface SearchUserState {
  activeQuestIds: ReadonlySet<string>;
  completedQuestIds: ReadonlySet<string>;
  ownedItemCounts: Readonly<Record<string, number>>;
  /** itemId → task ids that currently require it (from active quests). */
  requiredItemTaskIds: ReadonlyMap<string, readonly string[]>;
}

export interface EnrichedSearchHit extends ScoredSearchDocument {
  ownedCount?: number;
  questStatus?: 'active' | 'completed' | null;
  requiredByActiveQuests?: boolean;
  requiredByTaskIds?: string[];
  otherModeOnly?: boolean;
}

export interface SearchIndexMeta {
  locale: string;
  gameMode: GameMode;
  generatedAt: string;
  documentCount: number;
  domainCounts: Partial<Record<SearchDomain, number>>;
  /** Domains that failed to load when the index was built. */
  failedDomains: SearchDomain[];
  partial: boolean;
}

export interface SearchIndexPayload {
  meta: SearchIndexMeta;
  documents: SearchDocument[];
}
