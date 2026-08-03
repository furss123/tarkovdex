import type { GameMode } from '@/types/tarkov';
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
  createDefaultModeState,
  createDefaultQuestProgress,
  type LocalState,
  type ModeState,
  type RaidPlanCustomItem,
  type RaidPlanEntry,
} from './schema';

/**
 * Pure state-transition functions — `store.ts` is the only caller, and is the
 * only place that touches `localStorage` or notifies subscribers. Every
 * function here takes the whole `LocalState` and returns either the same
 * reference (no-op — same value set again, or an invalid id) or a new one
 * with only the targeted mode's data replaced, so `updatePreferences`-style
 * unchanged-value skipping and the "other mode is untouched" guarantee both
 * fall out of ordinary object identity rather than needing special-cased
 * checks at the call site.
 */

function modeStateOf(state: LocalState, mode: GameMode): ModeState {
  return state.modeData[mode];
}

function withModeState(state: LocalState, mode: GameMode, next: ModeState): LocalState {
  if (next === modeStateOf(state, mode)) return state;
  return { ...state, modeData: { ...state.modeData, [mode]: next } };
}

/** Trims, drops empties, dedupes while preserving first-seen order, and caps
 * length. The one normalization path every id-array mutation goes through. */
function normalizeIds(ids: string[], maxLength: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= maxLength) break;
  }
  return out;
}

function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_ITEM_QUANTITY, Math.floor(value)));
}

// ---------------------------------------------------------------------------
// Quest progress
// ---------------------------------------------------------------------------

/**
 * Completing a quest removes it from `activeQuestIds`; un-completing does
 * **not** restore it to active. Documented, deliberate policy (see
 * docs/architecture/tarkovdex-local-state.md §6.5): a completed quest that
 * gets un-completed (a correction, not "start over") should not silently
 * reappear in every raid plan and item total that reads `activeQuestIds`.
 * The player re-adds it explicitly if they mean to keep tracking it.
 */
export function setQuestActive(
  state: LocalState,
  mode: GameMode,
  questId: string,
  active: boolean,
): LocalState {
  const id = questId.trim();
  if (!id) return state;
  const quests = modeStateOf(state, mode).quests;
  const isActive = quests.activeQuestIds.includes(id);
  if (active === isActive) return state;

  const activeQuestIds = active
    ? normalizeIds([...quests.activeQuestIds, id], MAX_ACTIVE_QUESTS)
    : quests.activeQuestIds.filter((existing) => existing !== id);

  return withModeState(state, mode, {
    ...modeStateOf(state, mode),
    quests: { ...quests, activeQuestIds },
  });
}

export function setQuestCompleted(
  state: LocalState,
  mode: GameMode,
  questId: string,
  completed: boolean,
): LocalState {
  const id = questId.trim();
  if (!id) return state;
  const quests = modeStateOf(state, mode).quests;
  const isCompleted = quests.completedQuestIds.includes(id);
  if (completed === isCompleted) return state;

  const completedQuestIds = completed
    ? normalizeIds([...quests.completedQuestIds, id], MAX_COMPLETED_QUESTS)
    : quests.completedQuestIds.filter((existing) => existing !== id);
  // See the policy note on setQuestActive: completing removes from active;
  // un-completing does not restore it.
  const activeQuestIds = completed
    ? quests.activeQuestIds.filter((existing) => existing !== id)
    : quests.activeQuestIds;

  if (
    completedQuestIds === quests.completedQuestIds &&
    activeQuestIds === quests.activeQuestIds
  ) {
    return state;
  }

  return withModeState(state, mode, {
    ...modeStateOf(state, mode),
    quests: { ...quests, completedQuestIds, activeQuestIds },
  });
}

export interface QuestStatusUpdate {
  questId: string;
  active?: boolean;
  completed?: boolean;
}

/** Applies several status changes as one state transition — one persisted
 * write and one notification instead of N, for a "select several quests for
 * this raid plan at once" action. */
export function bulkSetQuestStatus(
  state: LocalState,
  mode: GameMode,
  updates: QuestStatusUpdate[],
): LocalState {
  return updates.reduce((current, update) => {
    let next = current;
    if (update.active !== undefined) next = setQuestActive(next, mode, update.questId, update.active);
    if (update.completed !== undefined) {
      next = setQuestCompleted(next, mode, update.questId, update.completed);
    }
    return next;
  }, state);
}

export function setOwnedItemCount(
  state: LocalState,
  mode: GameMode,
  itemId: string,
  count: number,
): LocalState {
  const id = itemId.trim();
  if (!id) return state;
  const clamped = clampQuantity(count);
  const quests = modeStateOf(state, mode).quests;
  const current = quests.ownedItemCounts[id] ?? 0;
  if (clamped === current) return state;

  const ownedItemCounts = { ...quests.ownedItemCounts };
  if (clamped === 0) delete ownedItemCounts[id];
  else ownedItemCounts[id] = clamped;

  if (Object.keys(ownedItemCounts).length > MAX_OWNED_ITEM_KEYS) return state;

  return withModeState(state, mode, {
    ...modeStateOf(state, mode),
    quests: { ...quests, ownedItemCounts },
  });
}

export function resetQuestProgress(state: LocalState, mode: GameMode): LocalState {
  const current = modeStateOf(state, mode).quests;
  const fresh = createDefaultQuestProgress();
  if (
    current.activeQuestIds.length === 0 &&
    current.completedQuestIds.length === 0 &&
    Object.keys(current.ownedItemCounts).length === 0
  ) {
    return state;
  }
  return withModeState(state, mode, { ...modeStateOf(state, mode), quests: fresh });
}

// ---------------------------------------------------------------------------
// Raid plans
// ---------------------------------------------------------------------------

export interface RaidPlanInput {
  name: string;
  mapId: string | null;
  activeQuestIds?: string[];
}

function clampText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createRaidPlan(
  state: LocalState,
  mode: GameMode,
  input: RaidPlanInput,
  now: string,
): { state: LocalState; plan: RaidPlanEntry | null } {
  const modeState = modeStateOf(state, mode);
  if (modeState.raidPlans.length >= MAX_RAID_PLANS_PER_MODE) return { state, plan: null };

  const name = clampText(input.name, MAX_PLAN_NAME_LENGTH) || 'Untitled';
  const plan: RaidPlanEntry = {
    id: newId(),
    name,
    mapId: input.mapId,
    activeQuestIds: normalizeIds(input.activeQuestIds ?? [], MAX_PLAN_QUEST_IDS),
    checkedObjectiveKeys: [],
    customItems: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
  };

  const next = withModeState(state, mode, {
    ...modeState,
    raidPlans: [plan, ...modeState.raidPlans],
  });
  return { state: next, plan };
}

/** The one place a plan's fields are edited. `updater` receives the current
 * entry and returns the fields to change; `updatedAt` is bumped only if the
 * updater actually produced a different plan. */
export function updateRaidPlan(
  state: LocalState,
  mode: GameMode,
  planId: string,
  updater: (plan: RaidPlanEntry) => Partial<Omit<RaidPlanEntry, 'id' | 'createdAt'>>,
  now: string,
): LocalState {
  const modeState = modeStateOf(state, mode);
  const index = modeState.raidPlans.findIndex((plan) => plan.id === planId);
  if (index === -1) return state;

  const current = modeState.raidPlans[index];
  const patch = updater(current);
  const candidate: RaidPlanEntry = {
    ...current,
    ...patch,
    ...(patch.name !== undefined ? { name: clampText(patch.name, MAX_PLAN_NAME_LENGTH) || current.name } : {}),
    ...(patch.notes !== undefined ? { notes: clampText(patch.notes, MAX_NOTES_LENGTH) } : {}),
    ...(patch.activeQuestIds !== undefined
      ? { activeQuestIds: normalizeIds(patch.activeQuestIds, MAX_PLAN_QUEST_IDS) }
      : {}),
    ...(patch.checkedObjectiveKeys !== undefined
      ? { checkedObjectiveKeys: normalizeIds(patch.checkedObjectiveKeys, MAX_CHECKED_OBJECTIVE_KEYS) }
      : {}),
    ...(patch.customItems !== undefined
      ? { customItems: patch.customItems.slice(0, MAX_CUSTOM_ITEMS_PER_PLAN) }
      : {}),
  };

  const unchanged =
    JSON.stringify({ ...candidate, updatedAt: current.updatedAt }) ===
    JSON.stringify(current);
  if (unchanged) return state;

  const updated: RaidPlanEntry = { ...candidate, updatedAt: now };
  const raidPlans = [...modeState.raidPlans];
  raidPlans[index] = updated;
  return withModeState(state, mode, { ...modeState, raidPlans });
}

export function deleteRaidPlan(state: LocalState, mode: GameMode, planId: string): LocalState {
  const modeState = modeStateOf(state, mode);
  const raidPlans = modeState.raidPlans.filter((plan) => plan.id !== planId);
  if (raidPlans.length === modeState.raidPlans.length) return state;
  return withModeState(state, mode, { ...modeState, raidPlans });
}

export function duplicateRaidPlan(
  state: LocalState,
  mode: GameMode,
  planId: string,
  now: string,
  duplicateNameSuffix: string,
): { state: LocalState; plan: RaidPlanEntry | null } {
  const modeState = modeStateOf(state, mode);
  const source = modeState.raidPlans.find((plan) => plan.id === planId);
  if (!source || modeState.raidPlans.length >= MAX_RAID_PLANS_PER_MODE) {
    return { state, plan: null };
  }
  const plan: RaidPlanEntry = {
    ...source,
    id: newId(),
    name: clampText(`${source.name} ${duplicateNameSuffix}`, MAX_PLAN_NAME_LENGTH) || source.name,
    customItems: source.customItems.map((item) => ({ ...item, id: newId() })),
    createdAt: now,
    updatedAt: now,
  };
  const next = withModeState(state, mode, {
    ...modeState,
    raidPlans: [plan, ...modeState.raidPlans],
  });
  return { state: next, plan };
}

export function addCustomItem(
  state: LocalState,
  mode: GameMode,
  planId: string,
  label: string,
  now: string,
): LocalState {
  return updateRaidPlan(
    state,
    mode,
    planId,
    (plan) => {
      if (plan.customItems.length >= MAX_CUSTOM_ITEMS_PER_PLAN) return {};
      const item: RaidPlanCustomItem = {
        id: newId(),
        label: clampText(label, MAX_CUSTOM_ITEM_LABEL_LENGTH) || 'Item',
        quantity: 1,
        checked: false,
      };
      return { customItems: [...plan.customItems, item] };
    },
    now,
  );
}

export function updateCustomItem(
  state: LocalState,
  mode: GameMode,
  planId: string,
  itemId: string,
  patch: Partial<Pick<RaidPlanCustomItem, 'label' | 'quantity' | 'checked'>>,
  now: string,
): LocalState {
  return updateRaidPlan(
    state,
    mode,
    planId,
    (plan) => ({
      customItems: plan.customItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              ...patch,
              ...(patch.label !== undefined
                ? { label: clampText(patch.label, MAX_CUSTOM_ITEM_LABEL_LENGTH) || item.label }
                : {}),
              ...(patch.quantity !== undefined ? { quantity: clampQuantity(patch.quantity) } : {}),
            }
          : item,
      ),
    }),
    now,
  );
}

export function removeCustomItem(
  state: LocalState,
  mode: GameMode,
  planId: string,
  itemId: string,
  now: string,
): LocalState {
  return updateRaidPlan(
    state,
    mode,
    planId,
    (plan) => ({ customItems: plan.customItems.filter((item) => item.id !== itemId) }),
    now,
  );
}

export function toggleObjectiveChecked(
  state: LocalState,
  mode: GameMode,
  planId: string,
  objectiveKey: string,
  checked: boolean,
  now: string,
): LocalState {
  return updateRaidPlan(
    state,
    mode,
    planId,
    (plan) => {
      const has = plan.checkedObjectiveKeys.includes(objectiveKey);
      if (checked === has) return {};
      return {
        checkedObjectiveKeys: checked
          ? [...plan.checkedObjectiveKeys, objectiveKey]
          : plan.checkedObjectiveKeys.filter((key) => key !== objectiveKey),
      };
    },
    now,
  );
}

export { createDefaultModeState };
