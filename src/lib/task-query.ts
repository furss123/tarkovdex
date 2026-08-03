import type { Task, TaskFilterMap, TaskFilterTrader, TasksResponse, GameMode } from '@/types/tarkov';

/**
 * Shared filter/sort/paginate logic for the quest list — used by both
 * `/api/tasks` (client fetch/pagination) and the tasks page's initial server
 * render, so the two never drift into computing "the first page" two
 * different ways. Takes the already-fetched, already-translated `Task[]` from
 * `getTasks()`; callers own fetching that.
 */

export const TASKS_PAGE_SIZE = 40;

export interface TaskQueryOptions {
  /** Already trimmed + locale-lowercased. */
  query: string;
  locale: string;
  traderId: string;
  mapId: string;
  page: number;
  pageSize?: number;
}

function dedupeMapOptions(
  tasks: Task[],
  selector: (task: Task) => { id: string; name: string } | null,
): TaskFilterMap[] {
  const options = new Map<string, string>();
  for (const task of tasks) {
    const value = selector(task);
    if (value) options.set(value.id, value.name);
  }
  return Array.from(options, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function traderOptions(tasks: Task[]): TaskFilterTrader[] {
  const options = new Map<string, TaskFilterTrader>();
  for (const task of tasks) {
    if (!task.trader) continue;
    const current = options.get(task.trader.id);
    options.set(task.trader.id, {
      id: task.trader.id,
      name: task.trader.name,
      imageLink: task.trader.imageLink,
      taskCount: (current?.taskCount ?? 0) + 1,
    });
  }
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function questDepth(
  task: Task,
  byId: Map<string, Task>,
  cache: Map<string, number>,
  trail = new Set<string>(),
): number {
  const cached = cache.get(task.id);
  if (cached !== undefined) return cached;
  if (trail.has(task.id)) return 0;
  const nextTrail = new Set(trail).add(task.id);
  const depth = task.requirements.reduce((maximum, requirement) => {
    const prerequisite = byId.get(requirement.taskId);
    return prerequisite
      ? Math.max(maximum, questDepth(prerequisite, byId, cache, nextTrail) + 1)
      : maximum;
  }, 0);
  cache.set(task.id, depth);
  return depth;
}

/** Every field the item-aggregation / raid-planner UI needs for a set of
 * saved quest ids, regardless of what the current search/pagination view
 * shows — the tracker's active list can span many pages of `/progression/tasks`
 * at once. Order follows `ids`; unknown ids are simply absent from the
 * result (never a placeholder), so the caller can diff `ids.length` against
 * the result to find orphaned references. Capped defensively — `ids` is
 * already bounded by `MAX_ACTIVE_QUESTS` (1000) at the storage layer, but a
 * hand-crafted request should not be able to force an unbounded lookup. */
export const MAX_TASK_IDS_PER_LOOKUP = 1000;

export function tasksByIds(tasks: Task[], ids: string[]): Task[] {
  const wanted = new Set(ids.slice(0, MAX_TASK_IDS_PER_LOOKUP));
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const found: Task[] = [];
  for (const id of wanted) {
    const task = byId.get(id);
    if (task) found.push(task);
  }
  return found;
}

export function queryTasks(
  tasks: Task[],
  gameMode: GameMode,
  options: TaskQueryOptions,
): TasksResponse {
  const { query, locale, traderId, mapId, page, pageSize = TASKS_PAGE_SIZE } = options;

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const depthById = new Map<string, number>();
  for (const task of tasks) questDepth(task, byId, depthById);

  const filtered = tasks
    .filter((task) => {
      // Matches the English name too, so a quest is findable by the name
      // used in English guides/videos even on the ko/zh locales.
      if (
        query &&
        !`${task.name} ${task.nameEn ?? ''}`.toLocaleLowerCase(locale).includes(query)
      ) {
        return false;
      }
      if (traderId && task.trader?.id !== traderId) return false;
      if (mapId && task.map?.id !== mapId) return false;
      return true;
    })
    .sort(
      (a, b) =>
        (traderId ? 0 : (a.trader?.name ?? '').localeCompare(b.trader?.name ?? '')) ||
        (a.minPlayerLevel ?? 1) - (b.minPlayerLevel ?? 1) ||
        (depthById.get(a.id) ?? 0) - (depthById.get(b.id) ?? 0) ||
        a.name.localeCompare(b.name),
    );

  const start = (page - 1) * pageSize;

  return {
    tasks: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    hasMore: start + pageSize < filtered.length,
    filters: {
      traders: traderOptions(tasks),
      maps: dedupeMapOptions(tasks, (task) => task.map),
    },
    gameMode,
    source: 'json.tarkov.dev',
  };
}
