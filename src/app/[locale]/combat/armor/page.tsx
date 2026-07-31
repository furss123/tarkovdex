import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getCombatDataset } from '@/lib/tarkov-tools';
import { ArmorExplorer } from '@/components/combat/ArmorExplorer';
import { DataError, ToolIntro } from '@/components/tools/ToolShell';
import { Link } from '@/i18n/navigation';
import { RELATED_LINK_CLASS } from '@/components/tools/relatedLinkClass';
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
  try {
    const [regular, pve] = await Promise.all([getCombatDataset(locale, 'regular'), getCombatDataset(locale, 'pve')]);
    return <section className="mx-auto max-w-content px-4 py-8 sm:px-6"><ToolIntro title={t('title')} description={t('description')} sourceLabel={t('source')} /><Link href="/combat/ammo" className={RELATED_LINK_CLASS}>{t('relatedLink')}</Link><ArmorExplorer regular={{ ...regular, ammo: [] }} pve={{ ...pve, ammo: [] }} /></section>;
  } catch {
    return <section className="mx-auto max-w-content px-4 py-10 sm:px-6"><DataError message={t('error')} /></section>;
  }
}
