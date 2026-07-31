import { NextResponse } from 'next/server';
import { isValidLocale } from '@/i18n/routing';
import { getTasks } from '@/lib/tarkov';
import { queryTasks } from '@/lib/task-query';
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
    const query = (searchParams.get('q') ?? '').trim().toLocaleLowerCase(locale);
    const traderId = searchParams.get('trader') ?? '';
    const mapId = searchParams.get('map') ?? '';
    const page = Math.max(1, Math.min(100, Number(searchParams.get('page')) || 1));

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
