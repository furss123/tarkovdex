import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getGunsmithTasks } from '@/lib/tarkov-tools';
import { GunsmithExplorer } from '@/components/progression/GunsmithExplorer';
import { DataError, ToolIntro } from '@/components/tools/ToolShell';
import { Link } from '@/i18n/navigation';
import { RELATED_LINK_CLASS } from '@/components/tools/relatedLinkClass';
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
  try {
    const [regular, pve] = await Promise.all([getGunsmithTasks(locale, 'regular'), getGunsmithTasks(locale, 'pve')]);
    return <section className="mx-auto max-w-content px-4 py-8 sm:px-6"><ToolIntro title={t('title')} description={t('description')} updatedAt={null} sourceLabel={t('source')} locale={locale} /><Link href="/progression/tasks" className={RELATED_LINK_CLASS}>{t('relatedLink')}</Link><GunsmithExplorer regular={regular} pve={pve} /></section>;
  } catch {
    return <section className="mx-auto max-w-content px-4 py-10 sm:px-6"><DataError message={t('error')} /></section>;
  }
}
