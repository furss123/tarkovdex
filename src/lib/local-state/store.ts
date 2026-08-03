import type { GameMode } from '@/types/tarkov';
import type { WatchPriceType } from '@/lib/watchlist';
import {
  clearRecentSearches as clearRecentList,
  pushRecentSearch as pushRecentEntry,
  removeRecentSearch as removeRecentEntry,
  type RecentSearchEntry as SearchRecentEntry,
} from '@/lib/search/recent';
import {
  CORRUPT_BACKUP_KEY,
  LEGACY_GAME_MODE_KEY,
  STORAGE_KEY,
  SERVER_DEFAULT_STATE,
  createDefaultState,
  type LocalState,
  type LocalStatePreferences,
  type ModeState,
  type QuestProgressState,
  type RaidPlanEntry,
  type RecentSearchEntry,
  type WatchlistEntry,
  type CraftPreferences,
  type BudgetPreset,
  type BudgetLine,
} from './schema';
import { loadLocalState, narrowLegacyGameMode } from './migrate';
import { isValidLocalState } from './validate';
import { validateImport, type ImportErrorCode } from './export-import';
import {
  getStorage,
  readRaw,
  removeRaw,
  writeJson,
  writeRaw,
  type StorageErrorCode,
} from './storage';
import * as reducers from './quest-reducers';
import * as watchlistReducers from './watchlist-reducers';
import * as craftReducers from './craft-reducers';
import * as budgetReducers from './budget-reducers';

/**
 * The single browser-side store singleton. Module-scoped, not React Context —
 * `useSyncExternalStore` (the hook wrapper lives in `use-local-state.ts`, kept
 * out of this file so it stays importable under the `react-server` condition
 * the test suite runs with) needs one shared snapshot, and a Context would
 * just be an extra indirection to the same module state. `GameModeContext`
 * (kept for its existing `useGameMode()` call sites) is a thin adapter over
 * this.
 *
 * Nothing here reads `localStorage` at module-evaluation time — the very
 * first `cachedState` is `SERVER_DEFAULT_STATE`, a fixed constant. Real disk
 * state is only loaded by `hydrateLocalState()`, called from a `useEffect` in
 * the app-root provider, so the server render and the first client render
 * are always identical (see schema.ts's `SERVER_DEFAULT_STATE` comment).
 */

let cachedState: LocalState = SERVER_DEFAULT_STATE;
let hydrated = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeLocalState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLocalStateSnapshot(): LocalState {
  return cachedState;
}

/** Must be deterministic — see `SERVER_DEFAULT_STATE`'s own comment. */
export function getLocalStateServerSnapshot(): LocalState {
  return SERVER_DEFAULT_STATE;
}

/**
 * Takes the two fields actually used, not a DOM `StorageEvent`, so this can
 * be unit-tested directly without a browser — `hydrateLocalState()`'s real
 * `window.addEventListener('storage', ...)` listener is a two-line adapter
 * around this.
 */
export function applyExternalStorageChange(event: {
  key: string | null;
  newValue: string | null;
}): void {
  if (event.key !== STORAGE_KEY) return; // ignore every other key, including the legacy one

  if (event.newValue === null) {
    cachedState = createDefaultState(new Date().toISOString());
    notify();
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.newValue);
  } catch {
    return; // an unparseable external write is ignored, not recovered
  }
  // Strict, not the lenient per-field recovery used on initial load: a
  // stranger's (or another tab's corrupted) write earns a full pass/fail, so
  // this tab's own good state is never silently patched over by garbage.
  if (!isValidLocalState(parsed)) return;
  cachedState = parsed;
  notify();
}

/**
 * Loads the real document from disk, migrates/recovers it, adopts the legacy
 * `tarkovdex:gameMode` key if applicable, and attaches the cross-tab
 * listener. Idempotent — safe to call from multiple mounted components or
 * under Strict Mode's double-invoked effects; only the first call does
 * anything.
 */
export function hydrateLocalState(): void {
  if (hydrated) return;
  hydrated = true;

  const storage = getStorage();
  if (!storage) return; // stays on SERVER_DEFAULT_STATE for this session

  const now = new Date().toISOString();
  const rawMain = readRaw(storage, STORAGE_KEY);
  const legacyGameMode = narrowLegacyGameMode(readRaw(storage, LEGACY_GAME_MODE_KEY));
  const outcome = loadLocalState({ rawMainJson: rawMain, legacyGameMode, now });

  if (outcome.wasCorrupt && rawMain !== null) {
    writeRaw(storage, CORRUPT_BACKUP_KEY, rawMain); // best-effort, diagnosable
  }

  cachedState = outcome.state;

  if (!outcome.refusedNewerVersion) {
    const written = writeJson(storage, STORAGE_KEY, outcome.state);
    if (written.ok && outcome.adoptedLegacyGameMode) {
      // Only remove the legacy key once the new document is confirmed to
      // have actually landed with the same value — never delete on faith.
      const verifyRaw = readRaw(storage, STORAGE_KEY);
      let verified: unknown = null;
      try {
        verified = verifyRaw ? JSON.parse(verifyRaw) : null;
      } catch {
        verified = null;
      }
      if (
        isValidLocalState(verified) &&
        verified.preferences.gameMode === outcome.state.preferences.gameMode
      ) {
        removeRaw(storage, LEGACY_GAME_MODE_KEY);
      }
    }
  }

  notify();
  window.addEventListener('storage', (event) =>
    applyExternalStorageChange({ key: event.key, newValue: event.newValue }),
  );
}

export type WriteOutcome = { ok: true } | { ok: false; code: StorageErrorCode };

/**
 * The one place `preferences` is written. In-memory state always updates
 * immediately regardless of whether the disk write succeeds — the same
 * "the click worked, persistence is best-effort" behavior the original
 * `GameModeContext` had (accidentally, since it never guarded `setItem`).
 * The returned outcome lets a caller show a "may not be saved" notice; it
 * does not gate whether the UI reflects the change.
 *
 * Callers must spread the existing preferences object (never replace it
 * wholesale) so fields like `beginnerMode` survive a `gameMode`-only write.
 */
export function updatePreferences(
  updater: (preferences: LocalStatePreferences) => LocalStatePreferences,
): WriteOutcome {
  const nextPreferences = updater(cachedState.preferences);
  if (nextPreferences === cachedState.preferences) return { ok: true };

  const now = new Date().toISOString();
  const next: LocalState = {
    ...cachedState,
    preferences: nextPreferences,
    metadata: { ...cachedState.metadata, updatedAt: now },
  };
  cachedState = next;
  notify();

  const storage = getStorage();
  if (!storage) return { ok: false, code: 'unavailable' };
  return writeJson(storage, STORAGE_KEY, next);
}

export function setGameMode(mode: GameMode): WriteOutcome {
  // Spread preserves beginnerMode — never replace the whole preferences object.
  return updatePreferences((preferences) => {
    if (preferences.gameMode === mode) return preferences;
    return { ...preferences, gameMode: mode };
  });
}

export function setBeginnerMode(enabled: boolean): WriteOutcome {
  return updatePreferences((preferences) => {
    if (preferences.beginnerMode === enabled) return preferences;
    return { ...preferences, beginnerMode: enabled };
  });
}

export function resetLocalState(): WriteOutcome {
  const now = new Date().toISOString();
  const fresh = createDefaultState(now);
  cachedState = fresh;
  notify();

  const storage = getStorage();
  if (!storage) return { ok: false, code: 'unavailable' };
  return writeJson(storage, STORAGE_KEY, fresh);
}

export type ImportOutcome = { ok: true } | { ok: false; code: ImportErrorCode | StorageErrorCode };

/**
 * Unlike `setGameMode`, a failed import changes **nothing** — not even in
 * memory. Importing means "replace my whole local state with this file"; if
 * that cannot be persisted, silently running the new state in this tab while
 * the disk keeps the old one would create a divergence that only surfaces
 * (confusingly) on the next reload. Reporting the failure and leaving both
 * memory and disk untouched is the more honest outcome.
 */
export function importLocalState(raw: string): ImportOutcome {
  const validation = validateImport(raw);
  if (!validation.ok) return validation;

  const storage = getStorage();
  if (!storage) return { ok: false, code: 'unavailable' };

  const written = writeJson(storage, STORAGE_KEY, validation.state);
  if (!written.ok) return written;

  cachedState = validation.state;
  notify();
  return { ok: true };
}

export function isStorageAvailable(): boolean {
  return getStorage() !== null;
}

/** Test-only — mirrors `resetFetchObservations()` in data-observations.ts. */
export function resetLocalStateStoreForTests(): void {
  cachedState = SERVER_DEFAULT_STATE;
  hydrated = false;
  listeners.clear();
}

// ---------------------------------------------------------------------------
// Quest progress + raid plans — Phase 3
//
// Every mutator here follows the same shape: run a pure reducer from
// `quest-reducers.ts` against `cachedState`, and only if the result is a
// genuinely different object (the reducers return the same reference for a
// no-op — setting the same value twice, an invalid id, a cap already hit)
// does this update memory, persist, and notify. That's what gives "same
// value set again" its free ride on `updatePreferences`'s existing
// unnecessary-write-avoidance without each mutator re-implementing the check.
// ---------------------------------------------------------------------------

function commit(next: LocalState): WriteOutcome {
  if (next === cachedState) return { ok: true }; // no-op, nothing to persist
  cachedState = next;
  notify();
  const storage = getStorage();
  if (!storage) return { ok: false, code: 'unavailable' };
  return writeJson(storage, STORAGE_KEY, next);
}

export function getQuestProgress(mode: GameMode): QuestProgressState {
  return cachedState.modeData[mode].quests;
}

export function getRaidPlans(mode: GameMode): RaidPlanEntry[] {
  return cachedState.modeData[mode].raidPlans;
}

export function getModeState(mode: GameMode): ModeState {
  return cachedState.modeData[mode];
}

export function setQuestActive(mode: GameMode, questId: string, active: boolean): WriteOutcome {
  return commit(reducers.setQuestActive(cachedState, mode, questId, active));
}

export function setQuestCompleted(
  mode: GameMode,
  questId: string,
  completed: boolean,
): WriteOutcome {
  return commit(reducers.setQuestCompleted(cachedState, mode, questId, completed));
}

export function bulkSetQuestStatus(
  mode: GameMode,
  updates: reducers.QuestStatusUpdate[],
): WriteOutcome {
  return commit(reducers.bulkSetQuestStatus(cachedState, mode, updates));
}

export function setOwnedItemCount(mode: GameMode, itemId: string, count: number): WriteOutcome {
  return commit(reducers.setOwnedItemCount(cachedState, mode, itemId, count));
}

export function getOwnedItemCount(mode: GameMode, itemId: string): number {
  return cachedState.modeData[mode].quests.ownedItemCounts[itemId.trim()] ?? 0;
}

export function bulkSetOwnedItemCounts(
  mode: GameMode,
  counts: Record<string, number>,
): WriteOutcome {
  return commit(
    Object.entries(counts).reduce(
      (state, [itemId, count]) => reducers.setOwnedItemCount(state, mode, itemId, count),
      cachedState,
    ),
  );
}

export function resetQuestProgress(mode: GameMode): WriteOutcome {
  return commit(reducers.resetQuestProgress(cachedState, mode));
}

export function createRaidPlan(
  mode: GameMode,
  input: reducers.RaidPlanInput,
): { outcome: WriteOutcome; plan: RaidPlanEntry | null } {
  const { state, plan } = reducers.createRaidPlan(cachedState, mode, input, new Date().toISOString());
  return { outcome: commit(state), plan };
}

export function updateRaidPlan(
  mode: GameMode,
  planId: string,
  updater: (plan: RaidPlanEntry) => Partial<Omit<RaidPlanEntry, 'id' | 'createdAt'>>,
): WriteOutcome {
  return commit(
    reducers.updateRaidPlan(cachedState, mode, planId, updater, new Date().toISOString()),
  );
}

export function deleteRaidPlan(mode: GameMode, planId: string): WriteOutcome {
  return commit(reducers.deleteRaidPlan(cachedState, mode, planId));
}

export function duplicateRaidPlan(
  mode: GameMode,
  planId: string,
  duplicateNameSuffix: string,
): { outcome: WriteOutcome; plan: RaidPlanEntry | null } {
  const { state, plan } = reducers.duplicateRaidPlan(
    cachedState,
    mode,
    planId,
    new Date().toISOString(),
    duplicateNameSuffix,
  );
  return { outcome: commit(state), plan };
}

export function addCustomItem(mode: GameMode, planId: string, label: string): WriteOutcome {
  return commit(reducers.addCustomItem(cachedState, mode, planId, label, new Date().toISOString()));
}

export function updateCustomItem(
  mode: GameMode,
  planId: string,
  itemId: string,
  patch: Parameters<typeof reducers.updateCustomItem>[4],
): WriteOutcome {
  return commit(
    reducers.updateCustomItem(cachedState, mode, planId, itemId, patch, new Date().toISOString()),
  );
}

export function removeCustomItem(mode: GameMode, planId: string, itemId: string): WriteOutcome {
  return commit(
    reducers.removeCustomItem(cachedState, mode, planId, itemId, new Date().toISOString()),
  );
}

export function toggleObjectiveChecked(
  mode: GameMode,
  planId: string,
  objectiveKey: string,
  checked: boolean,
): WriteOutcome {
  return commit(
    reducers.toggleObjectiveChecked(
      cachedState,
      mode,
      planId,
      objectiveKey,
      checked,
      new Date().toISOString(),
    ),
  );
}

// ---------------------------------------------------------------------------
// Recent searches — Phase 4 (shared across modes; query text is locale text)
// ---------------------------------------------------------------------------

function toSchemaRecent(entry: SearchRecentEntry): RecentSearchEntry {
  return entry;
}

export function recordRecentSearch(input: {
  query: string;
  locale?: string;
  selectedDomain?: RecentSearchEntry['selectedDomain'];
  selectedId?: string;
}): WriteOutcome {
  const now = new Date().toISOString();
  const nextList = pushRecentEntry(cachedState.recentSearches, {
    ...input,
    searchedAt: now,
  }).map(toSchemaRecent);
  if (
    nextList.length === cachedState.recentSearches.length &&
    nextList[0]?.normalizedQuery === cachedState.recentSearches[0]?.normalizedQuery &&
    nextList[0]?.searchedAt === cachedState.recentSearches[0]?.searchedAt
  ) {
    return { ok: true };
  }
  return commit({
    ...cachedState,
    recentSearches: nextList,
    metadata: { ...cachedState.metadata, updatedAt: now },
  });
}

export function clearRecentSearches(): WriteOutcome {
  if (cachedState.recentSearches.length === 0) return { ok: true };
  const now = new Date().toISOString();
  return commit({
    ...cachedState,
    recentSearches: clearRecentList(),
    metadata: { ...cachedState.metadata, updatedAt: now },
  });
}

export function removeRecentSearch(normalizedQuery: string): WriteOutcome {
  const nextList = removeRecentEntry(cachedState.recentSearches, normalizedQuery);
  if (nextList.length === cachedState.recentSearches.length) return { ok: true };
  const now = new Date().toISOString();
  return commit({
    ...cachedState,
    recentSearches: nextList,
    metadata: { ...cachedState.metadata, updatedAt: now },
  });
}

// ---------------------------------------------------------------------------
// Watchlist — Phase 5 (per-mode; item ids only)
// ---------------------------------------------------------------------------

export function getWatchlist(mode: GameMode): WatchlistEntry[] {
  return cachedState.modeData[mode].watchlist;
}

export function isItemWatched(
  mode: GameMode,
  itemId: string,
  priceType?: WatchPriceType,
): boolean {
  const id = itemId.trim();
  if (!id) return false;
  const list = cachedState.modeData[mode].watchlist;
  if (priceType === undefined) return list.some((entry) => entry.itemId === id);
  return list.some((entry) => entry.itemId === id && entry.priceType === priceType);
}

export function addToWatchlist(
  mode: GameMode,
  input: watchlistReducers.WatchlistEntryInput,
): WriteOutcome {
  return commit(
    watchlistReducers.addWatchlistEntry(cachedState, mode, input, new Date().toISOString()),
  );
}

export function removeFromWatchlist(
  mode: GameMode,
  itemId: string,
  priceType?: WatchPriceType,
): WriteOutcome {
  return commit(
    watchlistReducers.removeWatchlistEntry(
      cachedState,
      mode,
      itemId,
      priceType,
      new Date().toISOString(),
    ),
  );
}

export function updateWatchlistObservation(
  mode: GameMode,
  updates: watchlistReducers.WatchlistObservationUpdate[],
): WriteOutcome {
  return commit(
    watchlistReducers.updateWatchlistObservation(
      cachedState,
      mode,
      updates,
      new Date().toISOString(),
    ),
  );
}

export function resetWatchlistBaseline(
  mode: GameMode,
  itemId: string,
  priceType: WatchPriceType,
  currentPrice: number,
  currentUpdatedAt?: string,
): WriteOutcome {
  return commit(
    watchlistReducers.resetWatchlistBaseline(
      cachedState,
      mode,
      itemId,
      priceType,
      currentPrice,
      currentUpdatedAt,
      new Date().toISOString(),
    ),
  );
}

export function clearWatchlist(mode: GameMode): WriteOutcome {
  return commit(watchlistReducers.clearWatchlist(cachedState, mode, new Date().toISOString()));
}

// ---------------------------------------------------------------------------
// Crafting preferences + loadout budgets — Phase 6
// ---------------------------------------------------------------------------

export function getCraftPreferences(mode: GameMode): CraftPreferences {
  return cachedState.modeData[mode].crafting.preferences;
}

export function updateCraftPreferences(
  mode: GameMode,
  patch: Partial<CraftPreferences>,
): WriteOutcome {
  return commit(craftReducers.updateCraftPreferences(cachedState, mode, patch));
}

export function getBudgetPresets(mode: GameMode): BudgetPreset[] {
  return cachedState.modeData[mode].budgetPresets;
}

export function createBudgetPreset(
  mode: GameMode,
  input: budgetReducers.BudgetPresetInput,
): { outcome: WriteOutcome; preset: BudgetPreset | null } {
  const { state, preset } = budgetReducers.createBudgetPreset(cachedState, mode, input, new Date().toISOString());
  return { outcome: commit(state), preset };
}

export function updateBudgetPreset(
  mode: GameMode,
  presetId: string,
  updater: (preset: BudgetPreset) => Partial<Omit<BudgetPreset, 'id' | 'createdAt' | 'lines'>>,
): WriteOutcome {
  return commit(
    budgetReducers.updateBudgetPreset(cachedState, mode, presetId, updater, new Date().toISOString()),
  );
}

export function deleteBudgetPreset(mode: GameMode, presetId: string): WriteOutcome {
  return commit(budgetReducers.deleteBudgetPreset(cachedState, mode, presetId));
}

export function duplicateBudgetPreset(
  mode: GameMode,
  presetId: string,
  suffix: string,
): { outcome: WriteOutcome; preset: BudgetPreset | null } {
  const { state, preset } = budgetReducers.duplicateBudgetPreset(
    cachedState,
    mode,
    presetId,
    suffix,
    new Date().toISOString(),
  );
  return { outcome: commit(state), preset };
}

export function addBudgetLine(
  mode: GameMode,
  presetId: string,
  input: budgetReducers.BudgetLineInput,
): WriteOutcome {
  return commit(budgetReducers.addBudgetLine(cachedState, mode, presetId, input, new Date().toISOString()));
}

export function updateBudgetLine(
  mode: GameMode,
  presetId: string,
  lineId: string,
  patch: Partial<Omit<BudgetLine, 'id'>>,
): WriteOutcome {
  return commit(
    budgetReducers.updateBudgetLine(cachedState, mode, presetId, lineId, patch, new Date().toISOString()),
  );
}

export function removeBudgetLine(mode: GameMode, presetId: string, lineId: string): WriteOutcome {
  return commit(budgetReducers.removeBudgetLine(cachedState, mode, presetId, lineId, new Date().toISOString()));
}

export function clearBudgetPresets(mode: GameMode): WriteOutcome {
  return commit(budgetReducers.clearBudgetPresets(cachedState, mode));
}
