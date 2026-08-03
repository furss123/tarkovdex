import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getGunsmithTasks } from '@/lib/tarkov-tools';
import { GunsmithExplorer } from '@/components/progression/GunsmithExplorer';
import { DataError, ToolIntro } from '@/components/tools/ToolShell';
import { ModeAvailabilityBoundary } from '@/components/tools/ModeAvailabilityBoundary';
import { settleModePair } from '@/lib/settle-mode-pair';
import { domainHealth } from '@/lib/data-observations';
type Props = { params: Promise<{ locale: string }> };
export const revalidate = 900;
export const dynamic = 'force-static';
export async function generateMetadata({ params }: Props) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'gunsmith', path: '/progression/gunsmith' });
}
export default async function GunsmithPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('gunsmith');
  const tasks = await settleModePair({
    regular: getGunsmithTasks(locale, 'regular'),
    pve: getGunsmithTasks(locale, 'pve'),
  });
  const fallback = tasks.regular ?? tasks.pve;
  if (!fallback) {
    return <section className="mx-auto max-w-content px-4 py-10 sm:px-6"><DataError message={t('error')} /></section>;
  }
  // `src/lib/gunsmith-builds.json` is a committed solver artifact with no
  // generated-at field, so the build snapshot's own age is genuinely unknowable
  // and is reported as such. Only the live quest join (trader, level gate) has
  // an observation, and that is what `fetchedAt` describes here.
  const health = domainHealth({
    domain: 'gunsmith',
    gameMode: tasks.regular ? 'regular' : 'pve',
    locale,
    availability: tasks.regular && tasks.pve ? 'available' : 'partial',
    totalCount: fallback.length,
  });
  return <section className="mx-auto max-w-content px-4 py-8 sm:px-6"><ToolIntro title={t('title')} description={t('description')} sourceLabel={t('source')} locale={locale} health={health} /><ModeAvailabilityBoundary regularAvailable={tasks.regular !== null} pveAvailable={tasks.pve !== null} errorMessage={t('error')}><GunsmithExplorer regular={tasks.regular ?? fallback} pve={tasks.pve ?? fallback} /></ModeAvailabilityBoundary></section>;
}
