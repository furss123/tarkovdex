import type { GameMode } from '@/types/tarkov';
import type { WatchPriceType } from '@/lib/watchlist';
import {
  createDefaultCraftPreferences,
  type CraftPreferences,
} from '@/lib/personalized-craft';
import type { BudgetPreset } from '@/lib/loadout-budget';

/**
 * The one versioned local-storage document for TarkovDex.
 *
 * V1 → V2 (Phase 3) added per-mode quest tracking and raid plans.
 * V2 → V3 (Phase 4) added shared `recentSearches` for unified search.
 * V3 → V4 (Phase 5) added per-mode `watchlist` and `preferences.beginnerMode`.
 * V4 → V5 (Phase 6) added per-mode crafting preferences and budget presets.
 * See `migrate.ts` and docs/architecture/tarkovdex-local-state.md.
 */

export const STORAGE_KEY = 'tarkovdex:v1';
export const LEGACY_GAME_MODE_KEY = 'tarkovdex:gameMode';
export const CORRUPT_BACKUP_KEY = 'tarkovdex:v1:corrupt';
export const SCHEMA_VERSION = 5 as const;
export const V4_SCHEMA_VERSION = 4 as const;
export const V3_SCHEMA_VERSION = 3 as const;
export const V2_SCHEMA_VERSION = 2 as const;
export const V1_SCHEMA_VERSION = 1 as const;

export const MAX_STORED_BYTES = 5_000_000;
export const MAX_IMPORT_BYTES = 5_000_000;

export const MAX_ACTIVE_QUESTS = 1000;
export const MAX_COMPLETED_QUESTS = 2000;
export const MAX_OWNED_ITEM_KEYS = 5000;
export const MAX_RAID_PLANS_PER_MODE = 100;
export const MAX_PLAN_NAME_LENGTH = 100;
export const MAX_NOTES_LENGTH = 5000;
export const MAX_CUSTOM_ITEMS_PER_PLAN = 200;
export const MAX_CUSTOM_ITEM_LABEL_LENGTH = 100;
export const MAX_ITEM_QUANTITY = 999_999;
export const MAX_PLAN_QUEST_IDS = 200;
export const MAX_CHECKED_OBJECTIVE_KEYS = 2000;
export const MAX_RECENT_SEARCHES = 10;
export const MAX_RECENT_QUERY_LENGTH = 100;
export const MAX_WATCHLIST_PER_MODE = 200;
export const MAX_BUDGET_PRESETS_PER_MODE = 100;
export const MAX_BUDGET_LINES_PER_PRESET = 200;

export type { CraftPreferences } from '@/lib/personalized-craft';
export type { BudgetLine, BudgetPreset } from '@/lib/loadout-budget';

export type RecentSearchDomain =
  | 'item'
  | 'ammo'
  | 'armor'
  | 'task'
  | 'craft'
  | 'gunsmith'
  | 'map';

export interface RecentSearchEntry {
  query: string;
  normalizedQuery: string;
  selectedDomain?: RecentSearchDomain;
  selectedId?: string;
  searchedAt: string;
}

/** Per-mode price watch entry — item ids only, never localized names. */
export interface WatchlistEntry {
  itemId: string;
  priceType: WatchPriceType;
  baselinePrice?: number;
  baselineUpdatedAt?: string;
  addedAt: string;
  lastSeenPrice?: number;
  lastSeenUpdatedAt?: string;
  lastViewedAt?: string;
}

export interface LocalStatePreferences {
  gameMode: GameMode;
  /** Display preference for beginner explanations — does not rewrite expert pages. */
  beginnerMode: boolean;
}

export interface LocalStateMetadata {
  createdAt: string;
  updatedAt: string;
}

export interface QuestProgressState {
  activeQuestIds: string[];
  completedQuestIds: string[];
  ownedItemCounts: Record<string, number>;
}

export interface RaidPlanCustomItem {
  id: string;
  label: string;
  quantity: number;
  checked: boolean;
}

export interface RaidPlanEntry {
  id: string;
  name: string;
  mapId: string | null;
  activeQuestIds: string[];
  checkedObjectiveKeys: string[];
  customItems: RaidPlanCustomItem[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModeState {
  quests: QuestProgressState;
  raidPlans: RaidPlanEntry[];
  watchlist: WatchlistEntry[];
  crafting: { preferences: CraftPreferences };
  budgetPresets: BudgetPreset[];
}

export interface LocalState {
  schemaVersion: typeof SCHEMA_VERSION;
  preferences: LocalStatePreferences;
  modeData: {
    regular: ModeState;
    pve: ModeState;
  };
  recentSearches: RecentSearchEntry[];
  metadata: LocalStateMetadata;
}

export interface LocalStateV1 {
  schemaVersion: typeof V1_SCHEMA_VERSION;
  preferences: { gameMode: GameMode };
  metadata: LocalStateMetadata;
}

export interface LocalStateV2 {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  preferences: { gameMode: GameMode };
  modeData: {
    regular: ModeStateV2;
    pve: ModeStateV2;
  };
  metadata: LocalStateMetadata;
}

export interface ModeStateV2 {
  quests: QuestProgressState;
  raidPlans: RaidPlanEntry[];
}

export interface LocalStateV3 {
  schemaVersion: typeof V3_SCHEMA_VERSION;
  preferences: { gameMode: GameMode };
  modeData: {
    regular: ModeStateV2;
    pve: ModeStateV2;
  };
  recentSearches: RecentSearchEntry[];
  metadata: LocalStateMetadata;
}

/** V4 document before Phase 6's crafting and budget fields. */
export interface ModeStateV4 {
  quests: QuestProgressState;
  raidPlans: RaidPlanEntry[];
  watchlist: WatchlistEntry[];
}

export interface LocalStateV4 {
  schemaVersion: typeof V4_SCHEMA_VERSION;
  preferences: LocalStatePreferences;
  modeData: {
    regular: ModeStateV4;
    pve: ModeStateV4;
  };
  recentSearches: RecentSearchEntry[];
  metadata: LocalStateMetadata;
}

export interface LocalStateExport {
  schemaVersion: typeof SCHEMA_VERSION;
  exportedAt: string;
  state: LocalState;
}

export const DEFAULT_GAME_MODE: GameMode = 'regular';

export function createDefaultQuestProgress(): QuestProgressState {
  return { activeQuestIds: [], completedQuestIds: [], ownedItemCounts: {} };
}

export function createDefaultModeState(): ModeState {
  return {
    quests: createDefaultQuestProgress(),
    raidPlans: [],
    watchlist: [],
    crafting: { preferences: createDefaultCraftPreferences() },
    budgetPresets: [],
  };
}

export function createDefaultState(now: string): LocalState {
  return {
    schemaVersion: SCHEMA_VERSION,
    preferences: { gameMode: DEFAULT_GAME_MODE, beginnerMode: false },
    modeData: { regular: createDefaultModeState(), pve: createDefaultModeState() },
    recentSearches: [],
    metadata: { createdAt: now, updatedAt: now },
  };
}

export const SERVER_DEFAULT_STATE: LocalState = createDefaultState(
  '1970-01-01T00:00:00.000Z',
);
