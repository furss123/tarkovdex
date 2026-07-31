import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getCombatDataset } from '@/lib/tarkov-tools';
import { AmmoChart } from '@/components/combat/AmmoChart';
import { ToolGroupNav } from '@/components/progression/QuestToolNav';
import { DataError, ToolIntro } from '@/components/tools/ToolShell';
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
  try {
    const [regular, pve] = await Promise.all([getCombatDataset(locale, 'regular'), getCombatDataset(locale, 'pve')]);
    return <section className="mx-auto max-w-content px-4 py-8 sm:px-6"><ToolGroupNav group="combat" active="ammo" /><ToolIntro title={t('title')} description={t('description')} sourceLabel={t('source')} /><AmmoChart regular={{ ...regular, armor: [] }} pve={{ ...pve, armor: [] }} /></section>;
  } catch {
    return <section className="mx-auto max-w-content px-4 py-10 sm:px-6"><ToolGroupNav group="combat" active="ammo" /><DataError message={t('error')} /></section>;
  }
}
