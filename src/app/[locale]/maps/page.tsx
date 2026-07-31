import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getMaps } from '@/lib/tarkov';
import type { GameMap } from '@/types/tarkov';
import { MapCard } from '@/components/maps/MapCard';
import { MapsModeBoard } from '@/components/maps/MapsModeBoard';
import { ToolIntro } from '@/components/tools/ToolShell';

type PageProps = {
  params: Promise<{ locale: string }>;
};

// Structural map/boss data, not price data — same 6h cadence REVALIDATE_SECONDS
// uses in lib/tarkov.ts. `force-static` is the deterministic guarantee that
// this route builds as static/ISR rather than executing per request — see
// Phase 1.5 caching audit: `getMaps()`'s ~9.5-13MB fetch is large enough that
// relying on `revalidate` alone was empirically flaky across repeated builds,
// unlike the smaller endpoints the ammo/armor/gunsmith pages already pin the
// same way.
export const revalidate = 21600;
export const dynamic = 'force-static';

export async function generateMetadata({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'maps', path: '/maps' });
}

/**
 * Fetches both PvP (regular) and PvE maps — boss compositions genuinely
 * differ (confirmed live: PvE raids have noticeably more boss/spawn entries
 * on the same maps), not just a translation quirk. Both card lists are
 * rendered server-side (`MapCard` is an async Server Component) and handed
 * to `MapsModeBoard`, a tiny Client Component that just picks which
 * pre-rendered set to show based on the site-wide mode selection. See
 * CLAUDE.md > "Global PvP/PvE mode".
 */
export default async function MapsPage({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);

  const t = await getTranslations('maps');

  let regularMaps: GameMap[] = [];
  let pveMaps: GameMap[] = [];
  let failed = false;
  try {
    [regularMaps, pveMaps] = await Promise.all([
      getMaps({ locale, gameMode: 'regular' }),
      getMaps({ locale, gameMode: 'pve' }),
    ]);
  } catch {
    failed = true;
  }

  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <ToolIntro title={t('title')} description={t('subtitle')} />
      {failed ? (
        <div className="rounded-lg border border-border px-4 py-12 text-center text-sm text-muted">
          {t('error')}
        </div>
      ) : (
        <MapsModeBoard
          regularCount={regularMaps.length}
          pveCount={pveMaps.length}
          regularCards={regularMaps.map((map) => (
            <MapCard key={map.id} map={map} locale={locale} />
          ))}
          pveCards={pveMaps.map((map) => (
            <MapCard key={map.id} map={map} locale={locale} />
          ))}
        />
      )}
    </section>
  );
}
