import { NextResponse } from 'next/server';
import { isValidLocale, defaultLocale } from '@/i18n/routing';
import { getBoardData } from '@/lib/dashboard';
import type { BoardView } from '@/types/dashboard';

/**
 * The live refresh endpoint behind every board on the site. Each page
 * server-renders its first paint from `getBoardData()` directly; this route
 * serves every subsequent poll from the browser.
 *
 * One endpoint with a `view` parameter rather than three routes: the three
 * views are projections of the same upstream documents and the same cache, so
 * splitting them would only duplicate the locale/validation/header logic.
 *
 * Dynamic on purpose — an ISR'd route would hand the client a response whose
 * age it cannot see, which is exactly the "claims to be live, isn't" failure
 * this design is trying to avoid. The upstream cost is still bounded: the
 * documents underneath sit behind `fetchTarkovJson`'s per-runtime promise
 * cache (15 minutes for price-backed data), and the CDN header below collapses
 * concurrent visitors onto one origin render per minute.
 *
 * Honest-cadence note: `s-maxage=60` is not a claim that prices change every
 * minute. json.tarkov.dev regenerates its dumps on its own schedule, so the
 * real content age is `priceUpdatedAt` in the payload — which is what the UI
 * shows the user. Polling faster than upstream publishes would only redraw the
 * same numbers.
 */
export const dynamic = 'force-dynamic';

const VIEWS: readonly BoardView[] = ['home', 'hideout', 'bosses'];

function isView(value: string | null): value is BoardView {
  return value !== null && (VIEWS as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const requestedLocale = params.get('locale') ?? undefined;
  const locale = isValidLocale(requestedLocale) ? requestedLocale : defaultLocale;
  const requestedView = params.get('view');
  const view: BoardView = isView(requestedView) ? requestedView : 'home';

  try {
    const data = await getBoardData(locale, view);
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch {
    // The client keeps showing its last good payload and its age; a failed
    // refresh must never blank a working board.
    return NextResponse.json(
      { error: 'board_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
