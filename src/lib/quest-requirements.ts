import type { Task, TaskObjective } from '@/types/tarkov';

/**
 * Pure functions over already-fetched `Task[]` — aggregating required items
 * across a player's active quests, and detecting saved ids that no longer
 * exist in the current dataset. No React, no storage, no fetching.
 *
 * Scope decided by the live data audit (docs/architecture/tarkovdex-data-flow.md):
 * only `giveItem`/`findItem`/`plantItem` objectives are aggregated as "items
 * to acquire". `sellItem`/`useItem` were excluded deliberately — their
 * `items[]` lists run into the thousands in real data (e.g. a `sellItem`
 * objective in the audited dataset listed 3315 alternative ids), which is
 * "sell anything of this kind", not a shopping list. `giveQuestItem`/
 * `findQuestItem`/`plantQuestItem` reference a `questItem` id that does not
 * exist in the item catalog at all (confirmed live: 0/106 overlap) and so
 * cannot be resolved to a name/icon — they are surfaced as checklist steps
 * elsewhere, never as an aggregated item line.
 */

const AGGREGATABLE_TYPES = new Set(['giveItem', 'findItem', 'plantItem']);

export interface RequiredItemLine {
  /** The objective's `items[0]` — the representative item when an objective
   * lists alternatives. Never a name-based merge; always the same id. */
  itemId: string;
  totalRequired: number;
  /** Quest ids (from the active set) that contribute to this total. */
  questIds: string[];
  objectiveCount: number;
  /** True if any contributing objective offered more than one acceptable
   * item — the total already only counts `items[0]`, this just tells the UI
   * whether to say "or N alternatives". */
  hasAlternatives: boolean;
  /** true = every contributing objective requires found-in-raid; false =
   * none do; null = the objectives disagree or none reported a value. Never
   * invented when the field itself is absent. */
  foundInRaid: boolean | null;
}

export interface SkippedObjective {
  taskId: string;
  objectiveId: string;
  reason: 'no-count' | 'no-items';
}

export interface AggregationResult {
  lines: RequiredItemLine[];
  /** Item-type objectives that could not be aggregated because upstream
   * provided no usable count or no item id — never silently assumed to be 1
   * or skipped without a trace. */
  skipped: SkippedObjective[];
}

interface ObjectiveContribution {
  taskId: string;
  objective: TaskObjective;
}

function eligibleObjectives(
  tasks: Task[],
  includeOptional: boolean,
): { included: ObjectiveContribution[]; skipped: SkippedObjective[] } {
  const included: ObjectiveContribution[] = [];
  const skipped: SkippedObjective[] = [];

  for (const task of tasks) {
    for (const objective of task.objectives) {
      if (!AGGREGATABLE_TYPES.has(objective.type)) continue;
      if (objective.optional && !includeOptional) continue;

      if (!objective.items || objective.items.length === 0) {
        skipped.push({ taskId: task.id, objectiveId: objective.id, reason: 'no-items' });
        continue;
      }
      if (objective.count == null || !Number.isFinite(objective.count) || objective.count <= 0) {
        skipped.push({ taskId: task.id, objectiveId: objective.id, reason: 'no-count' });
        continue;
      }
      included.push({ taskId: task.id, objective });
    }
  }
  return { included, skipped };
}

/**
 * Aggregates required items across `tasks` (already filtered to the caller's
 * active, non-completed quest set — this function does not re-check quest
 * status). `includeOptional` decides whether `optional: true` objectives
 * count toward the total; the UI defaults this to `false` per the product
 * decision (optional objectives shown separately, not silently included).
 */
export function aggregateRequiredItems(
  tasks: Task[],
  includeOptional: boolean,
): AggregationResult {
  const { included, skipped } = eligibleObjectives(tasks, includeOptional);

  const byItemId = new Map<
    string,
    { total: number; questIds: Set<string>; objectiveCount: number; hasAlternatives: boolean; fir: Set<boolean> }
  >();

  for (const { taskId, objective } of included) {
    // items is guaranteed non-null/non-empty by eligibleObjectives.
    const itemId = (objective.items as string[])[0];
    const entry = byItemId.get(itemId) ?? {
      total: 0,
      questIds: new Set<string>(),
      objectiveCount: 0,
      hasAlternatives: false,
      fir: new Set<boolean>(),
    };
    entry.total += objective.count as number;
    entry.questIds.add(taskId);
    entry.objectiveCount += 1;
    if ((objective.items as string[]).length > 1) entry.hasAlternatives = true;
    if (objective.foundInRaid !== null) entry.fir.add(objective.foundInRaid);
    byItemId.set(itemId, entry);
  }

  const lines: RequiredItemLine[] = [...byItemId.entries()].map(([itemId, entry]) => ({
    itemId,
    totalRequired: entry.total,
    questIds: [...entry.questIds],
    objectiveCount: entry.objectiveCount,
    hasAlternatives: entry.hasAlternatives,
    foundInRaid: entry.fir.size === 1 ? [...entry.fir][0] : null,
  }));

  lines.sort((a, b) => b.totalRequired - a.totalRequired);
  return { lines, skipped };
}

export interface ItemNeedRow extends RequiredItemLine {
  owned: number;
  missing: number;
}

/** `missing = max(totalRequired - owned, 0)` — never negative, never assumes
 * an unset owned count is anything but 0. */
export function withOwnedAndMissing(
  lines: RequiredItemLine[],
  ownedItemCounts: Record<string, number>,
): ItemNeedRow[] {
  return lines.map((line) => {
    const owned = ownedItemCounts[line.itemId] ?? 0;
    return { ...line, owned, missing: Math.max(line.totalRequired - owned, 0) };
  });
}

// ---------------------------------------------------------------------------
// Orphaned reference detection
// ---------------------------------------------------------------------------

export interface OrphanReport {
  orphanedQuestIds: string[];
  orphanedMapIds: string[];
}

/**
 * Never deletes anything — just names which saved ids no longer resolve
 * against the current dataset, so the UI can say "not found in current data"
 * instead of crashing or silently vanishing rows.
 */
export function findOrphanedIds(
  questIds: string[],
  mapIds: Array<string | null>,
  knownTaskIds: Set<string>,
  knownMapIds: Set<string>,
): OrphanReport {
  return {
    orphanedQuestIds: questIds.filter((id) => !knownTaskIds.has(id)),
    orphanedMapIds: mapIds.filter((id): id is string => id !== null && !knownMapIds.has(id)),
  };
}
