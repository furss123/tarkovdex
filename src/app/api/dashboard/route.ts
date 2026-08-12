import { NextResponse } from 'next/server';
import { isValidLocale, defaultLocale } from '@/i18n/routing';
import { getDashboardData } from '@/lib/dashboard';

/**
 * The dashboard's live refresh endpoint. The page server-renders its first
 * paint from `getDashboardData()` directly; this route serves every subsequent
 * poll from the browser.
 *
 * Dynamic on purpose — an ISR'd route would hand the client a response whose
 * age it cannot see, which is exactly the "claims to be live, isn't" failure
 * this redesign is trying to avoid. The upstream cost is still bounded: the
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

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get('locale') ?? undefined;
  const locale = isValidLocale(requested) ? requested : defaultLocale;

  try {
    const data = await getDashboardData(locale);
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch {
    // The client keeps showing its last good payload and its age; a failed
    // refresh must never blank a working board.
    return NextResponse.json(
      { error: 'dashboard_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
