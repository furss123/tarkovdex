export type {
  EnrichedSearchHit,
  ScoredSearchDocument,
  SearchDocument,
  SearchDocumentNumeric,
  SearchDocumentRelations,
  SearchDomain,
  SearchGroup,
  SearchIndexMeta,
  SearchIndexPayload,
  SearchResultSet,
  SearchUserState,
} from './types';
export {
  DEFAULT_DOMAIN_ORDER,
  MAX_QUERY_LENGTH,
  MAX_RESULTS_PER_DOMAIN,
  MAX_RESULTS_TOTAL,
  MIN_QUERY_LENGTH_FOR_TYPO,
  SEARCH_DOMAINS,
} from './types';
export {
  editDistanceAtMost,
  normalizeSearchText,
  tokenizeSearchText,
  truncateQuery,
  typoMaxDistance,
} from './normalize';
export { scoreSearchDocument } from './score';
export {
  deduplicateResults,
  groupSearchResults,
  isSearchDomain,
  searchDocuments,
} from './search';
export {
  buildRequiredItemIndex,
  emptySearchUserState,
  enrichSearchHit,
  enrichSearchResults,
  findRelatedDocuments,
} from './enrich';
export {
  MAX_RECENT_QUERY_LENGTH,
  MAX_RECENT_SEARCHES,
  MIN_RECENT_QUERY_LENGTH,
  clearRecentSearches,
  isValidRecentSearchEntry,
  pushRecentSearch,
  recoverRecentSearches,
  removeRecentSearch,
  type RecentSearchEntry,
} from './recent';
export {
  buildAmmoDocuments,
  buildArmorDocuments,
  buildCraftDocuments,
  buildGunsmithDocuments,
  buildItemDocuments,
  buildMapDocuments,
  buildTaskDocuments,
  collectItemTaskLinks,
  countByDomain,
  mergeDocumentsByMode,
} from './build-documents';
