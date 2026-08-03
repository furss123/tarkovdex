import { NextResponse } from 'next/server';
import { isValidLocale } from '@/i18n/routing';
import { getTasks } from '@/lib/tarkov';
import { queryTasks, tasksByIds, MAX_TASK_IDS_PER_LOOKUP } from '@/lib/task-query';
import type { GameMode } from '@/types/tarkov';

const VALID_MODES = new Set<GameMode>(['regular', 'pve']);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLocale = searchParams.get('locale') ?? 'ko';
  const locale = isValidLocale(rawLocale) ? rawLocale : 'ko';
  const rawMode = searchParams.get('mode') as GameMode | null;
  const gameMode = rawMode && VALID_MODES.has(rawMode) ? rawMode : 'regular';

  try {
    const tasks = await getTasks({ locale, gameMode });

    // Resolves a saved set of quest ids (the quest tracker's active list,
    // which can span many pages of the normal search view) to their full
    // Task objects — bypasses search/pagination entirely. Separate from the
    // `q`/`trader`/`map` query path below on purpose: "give me exactly these
    // ids" and "search/filter/paginate everything" are different requests
    // that happen to share a loader.
    const idsParam = searchParams.get('ids');
    if (idsParam !== null) {
      const ids = idsParam
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, MAX_TASK_IDS_PER_LOOKUP);
      return NextResponse.json(
        { tasks: tasksByIds(tasks, ids) },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } },
      );
    }

    const query = (searchParams.get('q') ?? '').trim().toLocaleLowerCase(locale);
    const traderId = searchParams.get('trader') ?? '';
    const mapId = searchParams.get('map') ?? '';
    const parsedPage = Number(searchParams.get('page'));
    const page = Number.isFinite(parsedPage)
      ? Math.max(1, Math.min(100, Math.floor(parsedPage)))
      : 1;

    const response = queryTasks(tasks, gameMode, { query, locale, traderId, mapId, page });

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to load task data.' },
      { status: 503 },
    );
  }
}
