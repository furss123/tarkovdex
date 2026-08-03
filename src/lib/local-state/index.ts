/**
 * Public surface of the versioned local-state layer. Phase 3+ features
 * should import from here, not from the individual `schema`/`validate`/
 * `migrate`/`storage` modules directly.
 */

export type {
  LocalState,
  LocalStateExport,
  LocalStateMetadata,
  LocalStatePreferences,
  ModeState,
  QuestProgressState,
  RaidPlanEntry,
  RaidPlanCustomItem,
  RecentSearchEntry,
  RecentSearchDomain,
  WatchlistEntry,
  CraftPreferences,
  BudgetPreset,
  BudgetLine,
} from './schema';
export {
  SCHEMA_VERSION,
  DEFAULT_GAME_MODE,
  MAX_PLAN_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_CUSTOM_ITEM_LABEL_LENGTH,
  MAX_CUSTOM_ITEMS_PER_PLAN,
  MAX_RAID_PLANS_PER_MODE,
  MAX_RECENT_SEARCHES,
  MAX_RECENT_QUERY_LENGTH,
  MAX_WATCHLIST_PER_MODE,
  MAX_BUDGET_PRESETS_PER_MODE,
  MAX_BUDGET_LINES_PER_PRESET,
} from './schema';

export { useLocalState } from './use-local-state';
export {
  hydrateLocalState,
  subscribeLocalState,
  getLocalStateSnapshot,
  getLocalStateServerSnapshot,
  updatePreferences,
  setGameMode,
  setBeginnerMode,
  resetLocalState,
  importLocalState,
  isStorageAvailable,
  applyExternalStorageChange,
  resetLocalStateStoreForTests,
  getQuestProgress,
  getRaidPlans,
  getModeState,
  setQuestActive,
  setQuestCompleted,
  bulkSetQuestStatus,
  setOwnedItemCount,
  getOwnedItemCount,
  bulkSetOwnedItemCounts,
  resetQuestProgress,
  createRaidPlan,
  updateRaidPlan,
  deleteRaidPlan,
  duplicateRaidPlan,
  addCustomItem,
  updateCustomItem,
  removeCustomItem,
  toggleObjectiveChecked,
  recordRecentSearch,
  clearRecentSearches,
  removeRecentSearch,
  getWatchlist,
  isItemWatched,
  addToWatchlist,
  removeFromWatchlist,
  updateWatchlistObservation,
  resetWatchlistBaseline,
  clearWatchlist,
  getCraftPreferences,
  updateCraftPreferences,
  getBudgetPresets,
  createBudgetPreset,
  updateBudgetPreset,
  deleteBudgetPreset,
  duplicateBudgetPreset,
  addBudgetLine,
  updateBudgetLine,
  removeBudgetLine,
  clearBudgetPresets,
} from './store';
export type { WriteOutcome, ImportOutcome } from './store';
export type { QuestStatusUpdate, RaidPlanInput } from './quest-reducers';
export type {
  WatchlistEntryInput,
  WatchlistObservationUpdate,
} from './watchlist-reducers';
export type { BudgetPresetInput, BudgetLineInput } from './budget-reducers';

export {
  exportLocalState,
  serializeExport,
  exportFilename,
  validateImport,
} from './export-import';
export type { ImportErrorCode, ImportValidation } from './export-import';

export type { StorageErrorCode } from './storage';
