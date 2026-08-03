import { NextResponse } from 'next/server';
import { isValidLocale } from '@/i18n/routing';
import { getSearchIndex } from '@/lib/search/build-index';
import {
  findRelatedDocuments,
  isSearchDomain,
  searchDocuments,
  MAX_QUERY_LENGTH,
} from '@/lib/search';
import type { GameMode } from '@/types/tarkov';

const VALID_MODES = new Set<GameMode>(['regular', 'pve']);

/**
 * Unified search over a server-cached per-(locale, mode) index.
 * Clients receive grouped results for `q` — never the full raw catalogs.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLocale = searchParams.get('locale') ?? 'ko';
  if (!isValidLocale(rawLocale)) {
    return NextResponse.json({ error: 'Invalid locale.' }, { status: 400 });
  }
  const locale = rawLocale;

  const rawMode = searchParams.get('mode');
  if (rawMode !== null && rawMode !== '' && !VALID_MODES.has(rawMode as GameMode)) {
    return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 });
  }
  const gameMode: GameMode =
    rawMode && VALID_MODES.has(rawMode as GameMode) ? (rawMode as GameMode) : 'regular';

  const rawDomain = searchParams.get('domain');
  const domain =
    rawDomain && isSearchDomain(rawDomain) ? rawDomain : null;

  const rawQuery = searchParams.get('q') ?? '';
  if (rawQuery.length > MAX_QUERY_LENGTH * 2) {
    return NextResponse.json({ error: 'Query too long.' }, { status: 400 });
  }

  try {
    const index = await getSearchIndex(locale, gameMode);
    const results = searchDocuments(index.documents, rawQuery, {
      locale,
      domain,
      gameMode,
    });

    // Attach related quests/crafts under the top item hit when the match is
    // strong enough (Salewa-style flow). Never invent relations.
    let related: ReturnType<typeof findRelatedDocuments> = [];
    const topItem = results.groups
      .find((group) => group.domain === 'item')
      ?.results.find((hit) => hit.score >= 750);
    if (topItem) {
      related = findRelatedDocuments(index.documents, topItem.document, 6);
    }

    return NextResponse.json(
      {
        query: results.query,
        normalizedQuery: results.normalizedQuery,
        groups: results.groups,
        total: results.total,
        truncated: results.truncated,
        related,
        meta: index.meta,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600',
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: 'Unable to load search data.' },
      { status: 503 },
    );
  }
}
