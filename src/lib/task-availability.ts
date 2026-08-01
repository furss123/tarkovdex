import type { Task } from '@/types/tarkov';

/**
 * Combines a task's regular (PvP) and PvE records into one entry — shared by
 * the detail page's `generateStaticParams` (bulk) and its single-task lookup
 * (`resolveTask`), and by `sitemap.ts`, so all three agree on what "the set
 * of tasks" and "does this task differ by mode" mean. See the Phase 2B
 * audit: 474/501 regular tasks also exist in PvE with byte-identical name/
 * objectives/requirements/trader/map/level/XP; 27 exist only in regular, 23
 * only in PvE; exactly one shared task differs (level + a prerequisite).
 */

export type TaskAvailability = 'both-identical' | 'both-different' | 'regular-only' | 'pve-only';

export type TaskDiffField = 'level' | 'trader' | 'map' | 'experience' | 'prerequisites' | 'objectives';

export interface TaskEntry {
  /** Canonical data for slug/H1/rendering — regular when the task exists
   * there, otherwise the PvE record (the only data source for PvE-only
   * tasks). */
  task: Task;
  availability: TaskAvailability;
  regular: Task | null;
  pve: Task | null;
  /** Which fields actually differ — empty unless `availability` is
   * 'both-different'. Only ever the fields that were actually compared and
   * found unequal, never inferred. */
  modeDiffFields: TaskDiffField[];
}

function requirementIds(task: Task): string {
  return task.requirements
    .map((requirement) => requirement.taskId)
    .sort()
    .join(',');
}

function objectiveIds(task: Task): string {
  return task.objectives
    .map((objective) => objective.id)
    .sort()
    .join(',');
}

function diffFields(regular: Task, pve: Task): TaskDiffField[] {
  const fields: TaskDiffField[] = [];
  if ((regular.minPlayerLevel ?? null) !== (pve.minPlayerLevel ?? null)) fields.push('level');
  if ((regular.trader?.id ?? null) !== (pve.trader?.id ?? null)) fields.push('trader');
  if ((regular.map?.id ?? null) !== (pve.map?.id ?? null)) fields.push('map');
  if ((regular.experience ?? null) !== (pve.experience ?? null)) fields.push('experience');
  if (requirementIds(regular) !== requirementIds(pve)) fields.push('prerequisites');
  if (objectiveIds(regular) !== objectiveIds(pve)) fields.push('objectives');
  return fields;
}

/** Builds one task's combined entry from its (possibly absent) regular/PvE
 * records. Returns null only when neither exists — never true for a real id
 * looked up from either dataset. */
export function buildTaskEntry(regular: Task | null, pve: Task | null): TaskEntry | null {
  if (!regular && !pve) return null;
  const task = regular ?? (pve as Task);

  if (regular && pve) {
    const modeDiffFields = diffFields(regular, pve);
    return {
      task,
      availability: modeDiffFields.length > 0 ? 'both-different' : 'both-identical',
      regular,
      pve,
      modeDiffFields,
    };
  }

  return {
    task,
    availability: regular ? 'regular-only' : 'pve-only',
    regular,
    pve,
    modeDiffFields: [],
  };
}

/** All tasks that exist in either mode, deduped by id — the 524-entry union
 * (501 regular + 23 PvE-only) used for `generateStaticParams` and the
 * sitemap. */
export function unionTaskEntries(regularTasks: Task[], pveTasks: Task[]): TaskEntry[] {
  const regularById = new Map(regularTasks.map((task) => [task.id, task]));
  const pveById = new Map(pveTasks.map((task) => [task.id, task]));
  const ids = new Set([...regularById.keys(), ...pveById.keys()]);

  const entries: TaskEntry[] = [];
  for (const id of ids) {
    const entry = buildTaskEntry(regularById.get(id) ?? null, pveById.get(id) ?? null);
    if (entry) entries.push(entry);
  }
  return entries;
}
