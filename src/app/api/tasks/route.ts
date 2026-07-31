import { NextResponse } from 'next/server';
import { isValidLocale } from '@/i18n/routing';
import { getTasks } from '@/lib/tarkov';
import type { GameMode, Task } from '@/types/tarkov';

const PAGE_SIZE = 40;
const VALID_MODES = new Set<GameMode>(['regular', 'pve']);

function dedupeMapOptions(
  tasks: Task[],
  selector: (task: Task) => { id: string; name: string } | null,
) {
  const options = new Map<string, string>();
  for (const task of tasks) {
    const value = selector(task);
    if (value) options.set(value.id, value.name);
  }
  return Array.from(options, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function traderOptions(tasks: Task[]) {
  const options = new Map<
    string,
    { id: string; name: string; imageLink: string | null; taskCount: number }
  >();
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLocale = searchParams.get('locale') ?? 'ko';
  const locale = isValidLocale(rawLocale) ? rawLocale : 'ko';
  const rawMode = searchParams.get('mode') as GameMode | null;
  const gameMode = rawMode && VALID_MODES.has(rawMode) ? rawMode : 'regular';

  try {
    const tasks = await getTasks({ locale, gameMode });
    const query = (searchParams.get('q') ?? '').trim().toLocaleLowerCase(locale);
    const traderId = searchParams.get('trader') ?? '';
    const mapId = searchParams.get('map') ?? '';
    const page = Math.max(1, Math.min(100, Number(searchParams.get('page')) || 1));
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
    const start = (page - 1) * PAGE_SIZE;

    return NextResponse.json(
      {
        tasks: filtered.slice(start, start + PAGE_SIZE),
        total: filtered.length,
        page,
        pageSize: PAGE_SIZE,
        hasMore: start + PAGE_SIZE < filtered.length,
        filters: {
          traders: traderOptions(tasks),
          maps: dedupeMapOptions(tasks, (task) => task.map),
        },
        gameMode,
        source: 'json.tarkov.dev',
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: 'Unable to load task data.' },
      { status: 503 },
    );
  }
}
