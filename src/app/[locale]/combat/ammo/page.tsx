import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getCombatDataset } from '@/lib/tarkov-tools';
import { AmmoChart } from '@/components/combat/AmmoChart';
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
  return buildPageMetadata({ locale, page: 'ammo', path: '/combat/ammo' });
}
export default async function AmmoPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('ammo');
  const datasets = await settleModePair({
    regular: getCombatDataset(locale, 'regular'),
    pve: getCombatDataset(locale, 'pve'),
  });
  const fallback = datasets.regular ?? datasets.pve;
  if (!fallback) {
    return <section className="mx-auto max-w-content px-4 py-10 sm:px-6"><DataError message={t('error')} /></section>;
  }
  // Ballistic stats ride the items document but carry no upstream timestamp of
  // their own, so this reports observation only — content age stays `unknown`.
  const health = domainHealth({
    domain: 'ammunition',
    gameMode: datasets.regular ? 'regular' : 'pve',
    locale,
    availability: datasets.regular && datasets.pve ? 'available' : 'partial',
    totalCount: fallback.ammo.length,
  });
  return <section className="mx-auto max-w-content px-4 py-8 sm:px-6"><ToolIntro title={t('title')} description={t('description')} sourceLabel={t('source')} locale={locale} health={health} /><Link href="/combat/armor" className={RELATED_LINK_CLASS}>{t('relatedLink')}</Link><ModeAvailabilityBoundary regularAvailable={datasets.regular !== null} pveAvailable={datasets.pve !== null} errorMessage={t('error')}><AmmoChart regular={{ ...(datasets.regular ?? fallback), armor: [] }} pve={{ ...(datasets.pve ?? fallback), armor: [] }} /></ModeAvailabilityBoundary></section>;
}
