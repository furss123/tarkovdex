import type { GameMode } from '@/types/tarkov';
import { isSafeWatchPrice, isWatchPriceType } from '@/lib/watchlist';
import {
  isFuelCostInput,
  isManualFeeInput,
  isOwnedMaterialCostMode,
  type CraftPreferences,
} from '@/lib/personalized-craft';
import type { BudgetLine, BudgetPreset } from '@/lib/loadout-budget';
import {
  MAX_ACTIVE_QUESTS,
  MAX_CHECKED_OBJECTIVE_KEYS,
  MAX_COMPLETED_QUESTS,
  MAX_CUSTOM_ITEMS_PER_PLAN,
  MAX_CUSTOM_ITEM_LABEL_LENGTH,
  MAX_ITEM_QUANTITY,
  MAX_NOTES_LENGTH,
  MAX_OWNED_ITEM_KEYS,
  MAX_PLAN_NAME_LENGTH,
  MAX_PLAN_QUEST_IDS,
  MAX_RAID_PLANS_PER_MODE,
  MAX_RECENT_QUERY_LENGTH,
  MAX_RECENT_SEARCHES,
  MAX_WATCHLIST_PER_MODE,
  MAX_BUDGET_LINES_PER_PRESET,
  MAX_BUDGET_PRESETS_PER_MODE,
  SCHEMA_VERSION,
  V4_SCHEMA_VERSION,
  V1_SCHEMA_VERSION,
  V2_SCHEMA_VERSION,
  V3_SCHEMA_VERSION,
  createDefaultModeState,
  createDefaultQuestProgress,
  createDefaultState,
  type LocalState,
  type LocalStateMetadata,
  type LocalStatePreferences,
  type LocalStateV1,
  type LocalStateV2,
  type LocalStateV3,
  type LocalStateV4,
  type ModeState,
  type ModeStateV2,
  type ModeStateV4,
  type QuestProgressState,
  type RaidPlanCustomItem,
  type RaidPlanEntry,
  type RecentSearchDomain,
  type RecentSearchEntry,
  type WatchlistEntry,
} from './schema';

/**
 * Two strictness levels per version, same split Phase 2 established:
 *
 * - `recoverLocalState()` (current) / `recoverLocalStateV1()` — lenient,
 *   field-by-field, used only for the initial disk read.
 * - `isValidLocalState()` (current) / `isValidLocalStateV1()` /
 *   `isValidLocalStateV2()` / `isValidLocalStateV3()` — strict, whole-document
 *   pass/fail, used for cross-tab `storage` events and file import.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function hasDangerousKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => DANGEROUS_KEYS.has(key));
}

export function isValidGameMode(value: unknown): value is GameMode {
  return value === 'regular' || value === 'pve';
}

function isValidIsoString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

/** Current preferences: exactly `{ gameMode, beginnerMode }`. */
function isValidPreferences(value: unknown): value is LocalStatePreferences {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 2 &&
    isValidGameMode(value.gameMode) &&
    typeof value.beginnerMode === 'boolean'
  );
}

/** V1/V2/V3 preferences: exactly `{ gameMode }`. */
function isValidLegacyPreferences(value: unknown): value is { gameMode: GameMode } {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 1 &&
    isValidGameMode(value.gameMode)
  );
}

function isValidMetadata(value: unknown): value is LocalStateMetadata {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 2 &&
    isValidIsoString(value.createdAt) &&
    isValidIsoString(value.updatedAt)
  );
}

/** A non-empty string id, bounded so a single rogue value can't bloat the
 * document. 200 chars is generous headroom over any real Tarkov ObjectId
 * (24 hex chars) or composite key this schema uses. */
function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function isValidIdArray(value: unknown, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxLength && value.every(isValidId);
}

function isValidQuantity(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_ITEM_QUANTITY
  );
}

function isValidOwnedItemCounts(value: unknown, maxKeys: number): value is Record<string, number> {
  if (!isPlainObject(value) || hasDangerousKeys(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > maxKeys) return false;
  return entries.every(([key, count]) => isValidId(key) && isValidQuantity(count));
}

function isValidQuestProgress(value: unknown): value is QuestProgressState {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 3 &&
    isValidIdArray(value.activeQuestIds, MAX_ACTIVE_QUESTS) &&
    isValidIdArray(value.completedQuestIds, MAX_COMPLETED_QUESTS) &&
    isValidOwnedItemCounts(value.ownedItemCounts, MAX_OWNED_ITEM_KEYS)
  );
}

function isValidCustomItem(value: unknown): value is RaidPlanCustomItem {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 4 &&
    isValidId(value.id) &&
    typeof value.label === 'string' &&
    value.label.length > 0 &&
    value.label.length <= MAX_CUSTOM_ITEM_LABEL_LENGTH &&
    isValidQuantity(value.quantity) &&
    typeof value.checked === 'boolean'
  );
}

function isValidRaidPlan(value: unknown): value is RaidPlanEntry {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 9 &&
    isValidId(value.id) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    value.name.length <= MAX_PLAN_NAME_LENGTH &&
    (value.mapId === null || isValidId(value.mapId)) &&
    isValidIdArray(value.activeQuestIds, MAX_PLAN_QUEST_IDS) &&
    isValidIdArray(value.checkedObjectiveKeys, MAX_CHECKED_OBJECTIVE_KEYS) &&
    Array.isArray(value.customItems) &&
    value.customItems.length <= MAX_CUSTOM_ITEMS_PER_PLAN &&
    value.customItems.every(isValidCustomItem) &&
    typeof value.notes === 'string' &&
    value.notes.length <= MAX_NOTES_LENGTH &&
    isValidIsoString(value.createdAt) &&
    isValidIsoString(value.updatedAt)
  );
}

function isValidOptionalSafePrice(value: unknown): boolean {
  return value === undefined || isSafeWatchPrice(value);
}

function isValidOptionalIso(value: unknown): boolean {
  return value === undefined || isValidIsoString(value);
}

function isValidWatchlistEntry(value: unknown): value is WatchlistEntry {
  if (!isPlainObject(value) || hasDangerousKeys(value)) return false;
  if (!isValidId(value.itemId)) return false;
  if (!isWatchPriceType(value.priceType)) return false;
  if (!isValidIsoString(value.addedAt)) return false;
  if (!isValidOptionalSafePrice(value.baselinePrice)) return false;
  if (!isValidOptionalIso(value.baselineUpdatedAt)) return false;
  if (!isValidOptionalSafePrice(value.lastSeenPrice)) return false;
  if (!isValidOptionalIso(value.lastSeenUpdatedAt)) return false;
  if (!isValidOptionalIso(value.lastViewedAt)) return false;
  return true;
}

function isValidWatchlist(value: unknown): value is WatchlistEntry[] {
  if (!Array.isArray(value) || value.length > MAX_WATCHLIST_PER_MODE) return false;
  if (!value.every(isValidWatchlistEntry)) return false;
  const seen = new Set<string>();
  for (const entry of value) {
    const key = `${entry.itemId}\0${entry.priceType}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export function isValidCraftPreferences(value: unknown): value is CraftPreferences {
  if (!isPlainObject(value) || hasDangerousKeys(value) || Object.keys(value).length !== 6) return false;
  if (!isWatchPriceType(value.ingredientPriceMode) || !isWatchPriceType(value.outputSaleMode)) {
    return false;
  }
  if (!isOwnedMaterialCostMode(value.ownedMaterialCostMode)) return false;
  if (!isPlainObject(value.stationLevels) || hasDangerousKeys(value.stationLevels)) return false;
  if (
    !Object.entries(value.stationLevels).every(
      ([id, level]) =>
        isValidId(id) &&
        typeof level === 'number' &&
        Number.isInteger(level) &&
        level >= 0 &&
        level <= 100,
    )
  ) {
    return false;
  }
  return isFuelCostInput(value.fuelCost) && isManualFeeInput(value.manualFee);
}

export function isValidBudgetPreset(value: unknown): value is BudgetPreset {
  if (!isPlainObject(value) || hasDangerousKeys(value) || Object.keys(value).length !== 7) return false;
  if (!isValidId(value.id) || typeof value.name !== 'string' || !value.name.trim()) return false;
  if (value.name.length > MAX_PLAN_NAME_LENGTH || typeof value.notes !== 'string') return false;
  if (value.notes.length > MAX_NOTES_LENGTH || !isValidIsoString(value.createdAt) || !isValidIsoString(value.updatedAt)) {
    return false;
  }
  if (value.budget !== undefined && !isSafeWatchPrice(value.budget)) return false;
  if (!Array.isArray(value.lines) || value.lines.length > MAX_BUDGET_LINES_PER_PRESET) return false;
  const ids = new Set<string>();
  return value.lines.every((line) => {
    if (!isValidBudgetLine(line) || ids.has(line.id)) return false;
    ids.add(line.id);
    return true;
  });
}

function isValidBudgetLine(value: unknown): value is BudgetLine {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 5 &&
    isValidId(value.id) &&
    isValidId(value.itemId) &&
    typeof value.category === 'string' &&
    value.category.length > 0 &&
    value.category.length <= 100 &&
    isValidQuantity(value.quantity) &&
    value.quantity > 0 &&
    isWatchPriceType(value.priceType)
  );
}

/** Current (V5) ModeState. */
export function isValidModeState(value: unknown): value is ModeState {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 5 &&
    isValidQuestProgress(value.quests) &&
    Array.isArray(value.raidPlans) &&
    value.raidPlans.length <= MAX_RAID_PLANS_PER_MODE &&
    value.raidPlans.every(isValidRaidPlan) &&
    isValidWatchlist(value.watchlist) &&
    isPlainObject(value.crafting) &&
    !hasDangerousKeys(value.crafting) &&
    Object.keys(value.crafting).length === 1 &&
    isValidCraftPreferences(value.crafting.preferences) &&
    Array.isArray(value.budgetPresets) &&
    value.budgetPresets.length <= MAX_BUDGET_PRESETS_PER_MODE &&
    value.budgetPresets.every(isValidBudgetPreset)
  );
}

/** V4 ModeState: quests + raidPlans + watchlist. */
function isValidModeStateV4(value: unknown): value is ModeStateV4 {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 3 &&
    isValidQuestProgress(value.quests) &&
    Array.isArray(value.raidPlans) &&
    value.raidPlans.length <= MAX_RAID_PLANS_PER_MODE &&
    value.raidPlans.every(isValidRaidPlan) &&
    isValidWatchlist(value.watchlist)
  );
}

/** V2/V3 ModeState: quests + raidPlans only. */
function isValidModeStateV2(value: unknown): value is ModeStateV2 {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 2 &&
    isValidQuestProgress(value.quests) &&
    Array.isArray(value.raidPlans) &&
    value.raidPlans.length <= MAX_RAID_PLANS_PER_MODE &&
    value.raidPlans.every(isValidRaidPlan)
  );
}

function isValidModeData(
  value: unknown,
): value is { regular: ModeState; pve: ModeState } {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 2 &&
    isValidModeState(value.regular) &&
    isValidModeState(value.pve)
  );
}

function isValidModeDataV2(
  value: unknown,
): value is { regular: ModeStateV2; pve: ModeStateV2 } {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 2 &&
    isValidModeStateV2(value.regular) &&
    isValidModeStateV2(value.pve)
  );
}

function isValidModeDataV4(
  value: unknown,
): value is { regular: ModeStateV4; pve: ModeStateV4 } {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 2 &&
    isValidModeStateV4(value.regular) &&
    isValidModeStateV4(value.pve)
  );
}

const RECENT_DOMAINS = new Set<RecentSearchDomain>([
  'item',
  'ammo',
  'armor',
  'task',
  'craft',
  'gunsmith',
  'map',
]);

function isValidRecentSearchDomain(value: unknown): value is RecentSearchDomain {
  return typeof value === 'string' && RECENT_DOMAINS.has(value as RecentSearchDomain);
}

function isValidRecentSearchEntry(value: unknown): value is RecentSearchEntry {
  if (!isPlainObject(value) || hasDangerousKeys(value)) return false;
  if (typeof value.query !== 'string' || value.query.length === 0) return false;
  if (value.query.length > MAX_RECENT_QUERY_LENGTH) return false;
  if (typeof value.normalizedQuery !== 'string' || value.normalizedQuery.length === 0) {
    return false;
  }
  if (value.normalizedQuery.length > MAX_RECENT_QUERY_LENGTH) return false;
  if (!isValidIsoString(value.searchedAt)) return false;
  if (value.selectedDomain !== undefined && !isValidRecentSearchDomain(value.selectedDomain)) {
    return false;
  }
  if (value.selectedId !== undefined && !isValidId(value.selectedId)) return false;
  return true;
}

function isValidRecentSearches(value: unknown): value is RecentSearchEntry[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_RECENT_SEARCHES &&
    value.every(isValidRecentSearchEntry)
  );
}

/** Whole-document current schema (V5), no defaulting. */
export function isValidLocalState(value: unknown): value is LocalState {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 5 &&
    value.schemaVersion === SCHEMA_VERSION &&
    isValidPreferences(value.preferences) &&
    isValidModeData(value.modeData) &&
    isValidRecentSearches(value.recentSearches) &&
    isValidMetadata(value.metadata)
  );
}

/** Whole-document V4, kept so import/migrate can validate before upgrading. */
export function isValidLocalStateV4(value: unknown): value is LocalStateV4 {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 5 &&
    value.schemaVersion === V4_SCHEMA_VERSION &&
    isValidPreferences(value.preferences) &&
    isValidModeDataV4(value.modeData) &&
    isValidRecentSearches(value.recentSearches) &&
    isValidMetadata(value.metadata)
  );
}

/** Whole-document V3, kept so import/migrate can validate before upgrading. */
export function isValidLocalStateV3(value: unknown): value is LocalStateV3 {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 5 &&
    value.schemaVersion === V3_SCHEMA_VERSION &&
    isValidLegacyPreferences(value.preferences) &&
    isValidModeDataV2(value.modeData) &&
    isValidRecentSearches(value.recentSearches) &&
    isValidMetadata(value.metadata)
  );
}

/** Whole-document V2, kept so import/migrate can validate before upgrading. */
export function isValidLocalStateV2(value: unknown): value is LocalStateV2 {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 4 &&
    value.schemaVersion === V2_SCHEMA_VERSION &&
    isValidLegacyPreferences(value.preferences) &&
    isValidModeDataV2(value.modeData) &&
    isValidMetadata(value.metadata)
  );
}

/** Whole-document V1, kept only so `migrate.ts` can strictly validate an
 * imported V1 file before upgrading it — never used to accept new writes. */
export function isValidLocalStateV1(value: unknown): value is LocalStateV1 {
  return (
    isPlainObject(value) &&
    !hasDangerousKeys(value) &&
    Object.keys(value).length === 3 &&
    value.schemaVersion === V1_SCHEMA_VERSION &&
    isValidLegacyPreferences(value.preferences) &&
    isValidMetadata(value.metadata)
  );
}

export interface RecoverOutcome {
  state: LocalState;
  /** Dotted/bracketed paths of fields that were replaced with a default.
   * Diagnostic only — never rendered verbatim to the user. */
  recoveredFields: string[];
}

function recoverQuestProgress(
  value: unknown,
  recoveredFields: string[],
  path: string,
): QuestProgressState {
  const fallback = createDefaultQuestProgress();
  if (!isPlainObject(value) || hasDangerousKeys(value)) {
    recoveredFields.push(path);
    return fallback;
  }
  const activeQuestIds = isValidIdArray(value.activeQuestIds, MAX_ACTIVE_QUESTS)
    ? value.activeQuestIds
    : (recoveredFields.push(`${path}.activeQuestIds`), fallback.activeQuestIds);
  const completedQuestIds = isValidIdArray(value.completedQuestIds, MAX_COMPLETED_QUESTS)
    ? value.completedQuestIds
    : (recoveredFields.push(`${path}.completedQuestIds`), fallback.completedQuestIds);
  const ownedItemCounts = isValidOwnedItemCounts(value.ownedItemCounts, MAX_OWNED_ITEM_KEYS)
    ? value.ownedItemCounts
    : (recoveredFields.push(`${path}.ownedItemCounts`), fallback.ownedItemCounts);
  return { activeQuestIds, completedQuestIds, ownedItemCounts };
}

/** Raid plans are recovered per-entry: one malformed plan is dropped, not the
 * whole array — a player's other plans should survive one bad entry the same
 * way one bad top-level field doesn't discard the rest of the document. */
function recoverRaidPlans(value: unknown, recoveredFields: string[], path: string): RaidPlanEntry[] {
  if (!Array.isArray(value)) {
    recoveredFields.push(path);
    return [];
  }
  const kept: RaidPlanEntry[] = [];
  let dropped = 0;
  for (const entry of value.slice(0, MAX_RAID_PLANS_PER_MODE)) {
    if (isValidRaidPlan(entry)) kept.push(entry);
    else dropped += 1;
  }
  if (dropped > 0) recoveredFields.push(`${path}[${dropped} invalid entries dropped]`);
  return kept;
}

function recoverWatchlist(
  value: unknown,
  recoveredFields: string[],
  path: string,
): WatchlistEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    recoveredFields.push(path);
    return [];
  }
  const kept: WatchlistEntry[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const entry of value.slice(0, MAX_WATCHLIST_PER_MODE * 2)) {
    if (!isValidWatchlistEntry(entry)) {
      dropped += 1;
      continue;
    }
    const key = `${entry.itemId}\0${entry.priceType}`;
    if (seen.has(key)) {
      dropped += 1;
      continue;
    }
    seen.add(key);
    kept.push(entry);
    if (kept.length >= MAX_WATCHLIST_PER_MODE) break;
  }
  if (dropped > 0) recoveredFields.push(`${path}[${dropped} invalid entries dropped]`);
  return kept;
}

function recoverModeState(value: unknown, recoveredFields: string[], path: string): ModeState {
  if (!isPlainObject(value) || hasDangerousKeys(value)) {
    recoveredFields.push(path);
    return createDefaultModeState();
  }
  return {
    quests: recoverQuestProgress(value.quests, recoveredFields, `${path}.quests`),
    raidPlans: recoverRaidPlans(value.raidPlans, recoveredFields, `${path}.raidPlans`),
    watchlist: recoverWatchlist(value.watchlist, recoveredFields, `${path}.watchlist`),
    crafting: recoverCrafting(value.crafting, recoveredFields, `${path}.crafting`),
    budgetPresets: recoverBudgetPresets(value.budgetPresets, recoveredFields, `${path}.budgetPresets`),
  };
}

function recoverCrafting(
  value: unknown,
  recoveredFields: string[],
  path: string,
): ModeState['crafting'] {
  if (!isPlainObject(value) || !isValidCraftPreferences(value.preferences)) {
    recoveredFields.push(path);
    return createDefaultModeState().crafting;
  }
  return { preferences: value.preferences };
}

function recoverBudgetPresets(value: unknown, recoveredFields: string[], path: string): BudgetPreset[] {
  if (!Array.isArray(value)) {
    recoveredFields.push(path);
    return [];
  }
  const kept = value.filter(isValidBudgetPreset).slice(0, MAX_BUDGET_PRESETS_PER_MODE);
  if (kept.length !== value.length) recoveredFields.push(`${path}[invalid entries dropped]`);
  return kept;
}

function recoverModeStateV4(value: unknown, recoveredFields: string[], path: string): ModeStateV4 {
  if (!isPlainObject(value) || hasDangerousKeys(value)) {
    recoveredFields.push(path);
    const fallback = createDefaultModeState();
    return { quests: fallback.quests, raidPlans: [], watchlist: [] };
  }
  return {
    quests: recoverQuestProgress(value.quests, recoveredFields, `${path}.quests`),
    raidPlans: recoverRaidPlans(value.raidPlans, recoveredFields, `${path}.raidPlans`),
    watchlist: recoverWatchlist(value.watchlist, recoveredFields, `${path}.watchlist`),
  };
}

/** V2/V3 mode recovery — no watchlist field. */
function recoverModeStateV2(value: unknown, recoveredFields: string[], path: string): ModeStateV2 {
  if (!isPlainObject(value) || hasDangerousKeys(value)) {
    recoveredFields.push(path);
    return { quests: createDefaultQuestProgress(), raidPlans: [] };
  }
  return {
    quests: recoverQuestProgress(value.quests, recoveredFields, `${path}.quests`),
    raidPlans: recoverRaidPlans(value.raidPlans, recoveredFields, `${path}.raidPlans`),
  };
}

function recoverRecentSearches(
  value: unknown,
  recoveredFields: string[],
  path: string,
): RecentSearchEntry[] {
  if (!Array.isArray(value)) {
    recoveredFields.push(path);
    return [];
  }
  const kept: RecentSearchEntry[] = [];
  let dropped = 0;
  for (const entry of value.slice(0, MAX_RECENT_SEARCHES * 2)) {
    if (isValidRecentSearchEntry(entry)) kept.push(entry);
    else dropped += 1;
    if (kept.length >= MAX_RECENT_SEARCHES) break;
  }
  if (dropped > 0) recoveredFields.push(`${path}[${dropped} invalid entries dropped]`);
  return kept;
}

function recoverMetadata(
  value: unknown,
  recoveredFields: string[],
  fallback: LocalStateMetadata,
): LocalStateMetadata {
  let createdAt = fallback.createdAt;
  let updatedAt = fallback.updatedAt;
  if (isPlainObject(value) && !hasDangerousKeys(value)) {
    if (isValidIsoString(value.createdAt)) {
      createdAt = value.createdAt;
    } else {
      recoveredFields.push('metadata.createdAt');
    }
    if (isValidIsoString(value.updatedAt)) {
      updatedAt = value.updatedAt;
    } else {
      recoveredFields.push('metadata.updatedAt');
    }
  } else {
    recoveredFields.push('metadata');
  }
  return { createdAt, updatedAt };
}

/**
 * Field-by-field recovery for the initial disk read of a current-schema
 * document. Never throws; a broken `modeData.pve.raidPlans[3]` never costs
 * the player their `regular` progress or their other raid plans.
 */
export function recoverLocalState(value: unknown, now: string): RecoverOutcome {
  const fallback = createDefaultState(now);
  if (!isPlainObject(value) || hasDangerousKeys(value)) {
    return { state: fallback, recoveredFields: ['*'] };
  }

  const recoveredFields: string[] = [];

  let gameMode = fallback.preferences.gameMode;
  let beginnerMode = fallback.preferences.beginnerMode;
  const preferencesInput = value.preferences;
  if (isPlainObject(preferencesInput) && isValidGameMode(preferencesInput.gameMode)) {
    gameMode = preferencesInput.gameMode;
    if (typeof preferencesInput.beginnerMode === 'boolean') {
      beginnerMode = preferencesInput.beginnerMode;
    } else if (preferencesInput.beginnerMode !== undefined) {
      recoveredFields.push('preferences.beginnerMode');
    }
  } else {
    recoveredFields.push('preferences');
  }

  const modeDataInput = value.modeData;
  let regular = fallback.modeData.regular;
  let pve = fallback.modeData.pve;
  if (isPlainObject(modeDataInput) && !hasDangerousKeys(modeDataInput)) {
    regular = recoverModeState(modeDataInput.regular, recoveredFields, 'modeData.regular');
    pve = recoverModeState(modeDataInput.pve, recoveredFields, 'modeData.pve');
  } else {
    recoveredFields.push('modeData');
  }

  const recentSearches =
    value.recentSearches === undefined
      ? []
      : recoverRecentSearches(value.recentSearches, recoveredFields, 'recentSearches');

  const metadata = recoverMetadata(value.metadata, recoveredFields, fallback.metadata);

  return {
    state: {
      schemaVersion: SCHEMA_VERSION,
      preferences: { gameMode, beginnerMode },
      modeData: { regular, pve },
      recentSearches,
      metadata,
    },
    recoveredFields,
  };
}

/** Lenient recoverer for a stored V4 document before upgradeV4ToV5. */
export function recoverLocalStateV4(value: unknown, now: string): {
  state: LocalStateV4;
  recoveredFields: string[];
} {
  const fallback = createDefaultState(now);
  const fallbackV4: LocalStateV4 = {
    schemaVersion: V4_SCHEMA_VERSION,
    preferences: fallback.preferences,
    modeData: {
      regular: {
        quests: fallback.modeData.regular.quests,
        raidPlans: [],
        watchlist: [],
      },
      pve: {
        quests: fallback.modeData.pve.quests,
        raidPlans: [],
        watchlist: [],
      },
    },
    recentSearches: [],
    metadata: fallback.metadata,
  };
  if (!isPlainObject(value) || hasDangerousKeys(value)) {
    return { state: fallbackV4, recoveredFields: ['*'] };
  }

  const recoveredFields: string[] = [];
  const preferences =
    isPlainObject(value.preferences) &&
    isValidGameMode(value.preferences.gameMode) &&
    typeof value.preferences.beginnerMode === 'boolean'
      ? { gameMode: value.preferences.gameMode, beginnerMode: value.preferences.beginnerMode }
      : (recoveredFields.push('preferences'), fallbackV4.preferences);
  const modeData =
    isPlainObject(value.modeData) && !hasDangerousKeys(value.modeData)
      ? {
          regular: recoverModeStateV4(value.modeData.regular, recoveredFields, 'modeData.regular'),
          pve: recoverModeStateV4(value.modeData.pve, recoveredFields, 'modeData.pve'),
        }
      : (recoveredFields.push('modeData'), fallbackV4.modeData);
  const recentSearches =
    value.recentSearches === undefined
      ? []
      : recoverRecentSearches(value.recentSearches, recoveredFields, 'recentSearches');

  return {
    state: {
      schemaVersion: V4_SCHEMA_VERSION,
      preferences,
      modeData,
      recentSearches,
      metadata: recoverMetadata(value.metadata, recoveredFields, fallbackV4.metadata),
    },
    recoveredFields,
  };
}

/** Lenient recoverer for a stored V3 document before upgradeV3ToV4. */
export function recoverLocalStateV3(value: unknown, now: string): {
  state: LocalStateV3;
  recoveredFields: string[];
} {
  const fallback: LocalStateV3 = {
    schemaVersion: V3_SCHEMA_VERSION,
    preferences: { gameMode: 'regular' },
    modeData: {
      regular: { quests: createDefaultQuestProgress(), raidPlans: [] },
      pve: { quests: createDefaultQuestProgress(), raidPlans: [] },
    },
    recentSearches: [],
    metadata: { createdAt: now, updatedAt: now },
  };
  if (!isPlainObject(value) || hasDangerousKeys(value)) {
    return { state: fallback, recoveredFields: ['*'] };
  }

  const recoveredFields: string[] = [];

  let gameMode = fallback.preferences.gameMode;
  const preferencesInput = value.preferences;
  if (isPlainObject(preferencesInput) && isValidGameMode(preferencesInput.gameMode)) {
    gameMode = preferencesInput.gameMode;
  } else {
    recoveredFields.push('preferences');
  }

  const modeDataInput = value.modeData;
  let regular = fallback.modeData.regular;
  let pve = fallback.modeData.pve;
  if (isPlainObject(modeDataInput) && !hasDangerousKeys(modeDataInput)) {
    regular = recoverModeStateV2(modeDataInput.regular, recoveredFields, 'modeData.regular');
    pve = recoverModeStateV2(modeDataInput.pve, recoveredFields, 'modeData.pve');
  } else {
    recoveredFields.push('modeData');
  }

  const recentSearches =
    value.recentSearches === undefined
      ? []
      : recoverRecentSearches(value.recentSearches, recoveredFields, 'recentSearches');

  const metadata = recoverMetadata(value.metadata, recoveredFields, fallback.metadata);

  return {
    state: {
      schemaVersion: V3_SCHEMA_VERSION,
      preferences: { gameMode },
      modeData: { regular, pve },
      recentSearches,
      metadata,
    },
    recoveredFields,
  };
}

/** Lenient recoverer for a stored V2 document before upgradeV2ToV4. */
export function recoverLocalStateV2(value: unknown, now: string): {
  state: LocalStateV2;
  recoveredFields: string[];
} {
  const fallback: LocalStateV2 = {
    schemaVersion: V2_SCHEMA_VERSION,
    preferences: { gameMode: 'regular' },
    modeData: {
      regular: { quests: createDefaultQuestProgress(), raidPlans: [] },
      pve: { quests: createDefaultQuestProgress(), raidPlans: [] },
    },
    metadata: { createdAt: now, updatedAt: now },
  };
  if (!isPlainObject(value) || hasDangerousKeys(value)) {
    return { state: fallback, recoveredFields: ['*'] };
  }

  const recoveredFields: string[] = [];

  let gameMode = fallback.preferences.gameMode;
  const preferencesInput = value.preferences;
  if (isPlainObject(preferencesInput) && isValidGameMode(preferencesInput.gameMode)) {
    gameMode = preferencesInput.gameMode;
  } else {
    recoveredFields.push('preferences');
  }

  const modeDataInput = value.modeData;
  let regular = fallback.modeData.regular;
  let pve = fallback.modeData.pve;
  if (isPlainObject(modeDataInput) && !hasDangerousKeys(modeDataInput)) {
    regular = recoverModeStateV2(modeDataInput.regular, recoveredFields, 'modeData.regular');
    pve = recoverModeStateV2(modeDataInput.pve, recoveredFields, 'modeData.pve');
  } else {
    recoveredFields.push('modeData');
  }

  const metadata = recoverMetadata(value.metadata, recoveredFields, fallback.metadata);

  return {
    state: {
      schemaVersion: V2_SCHEMA_VERSION,
      preferences: { gameMode },
      modeData: { regular, pve },
      metadata,
    },
    recoveredFields,
  };
}

export interface RecoverV1Outcome {
  state: LocalStateV1;
  recoveredFields: string[];
}

/** The original Phase 2 lenient recoverer, kept verbatim (renamed) as the
 * migration source for a stored `schemaVersion: 1` document. */
export function recoverLocalStateV1(value: unknown, now: string): RecoverV1Outcome {
  const fallback: LocalStateV1 = {
    schemaVersion: V1_SCHEMA_VERSION,
    preferences: { gameMode: 'regular' },
    metadata: { createdAt: now, updatedAt: now },
  };
  if (!isPlainObject(value) || hasDangerousKeys(value)) {
    return { state: fallback, recoveredFields: ['*'] };
  }

  const recoveredFields: string[] = [];

  let gameMode = fallback.preferences.gameMode;
  const preferencesInput = value.preferences;
  if (isPlainObject(preferencesInput) && isValidGameMode(preferencesInput.gameMode)) {
    gameMode = preferencesInput.gameMode;
  } else {
    recoveredFields.push('preferences');
  }

  const metadata = recoverMetadata(value.metadata, recoveredFields, fallback.metadata);

  return {
    state: {
      schemaVersion: V1_SCHEMA_VERSION,
      preferences: { gameMode },
      metadata,
    },
    recoveredFields,
  };
}
