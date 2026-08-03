import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getCombatDataset } from '@/lib/tarkov-tools';
import { ArmorExplorer } from '@/components/combat/ArmorExplorer';
import { DataError, ToolIntro } from '@/components/tools/ToolShell';
import { ModeAvailabilityBoundary } from '@/components/tools/ModeAvailabilityBoundary';
import { Link } from '@/i18n/navigation';
import { RELATED_LINK_CLASS } from '@/components/tools/relatedLinkClass';
import { settleModePair } from '@/lib/settle-mode-pair';
import { domainHealth } from '@/lib/data-observations';
type Props = { params: Promise<{ locale: string }> };
export const revalidate = 900;
export const dynamic = 'force-static';
export async function generateMetadata({ params }: Props) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'armor', path: '/combat/armor' });
}
export default async function ArmorPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('armor');
  const datasets = await settleModePair({
    regular: getCombatDataset(locale, 'regular'),
    pve: getCombatDataset(locale, 'pve'),
  });
  const fallback = datasets.regular ?? datasets.pve;
  if (!fallback) {
    return <section className="mx-auto max-w-content px-4 py-10 sm:px-6"><DataError message={t('error')} /></section>;
  }
  const health = domainHealth({
    domain: 'armor',
    gameMode: datasets.regular ? 'regular' : 'pve',
    locale,
    availability: datasets.regular && datasets.pve ? 'available' : 'partial',
    totalCount: fallback.armor.length,
  });
  return <section className="mx-auto max-w-content px-4 py-8 sm:px-6"><ToolIntro title={t('title')} description={t('description')} sourceLabel={t('source')} locale={locale} health={health} /><Link href="/combat/ammo" className={RELATED_LINK_CLASS}>{t('relatedLink')}</Link><ModeAvailabilityBoundary regularAvailable={datasets.regular !== null} pveAvailable={datasets.pve !== null} errorMessage={t('error')}><ArmorExplorer regular={{ ...(datasets.regular ?? fallback), ammo: [] }} pve={{ ...(datasets.pve ?? fallback), ammo: [] }} /></ModeAvailabilityBoundary></section>;
}
