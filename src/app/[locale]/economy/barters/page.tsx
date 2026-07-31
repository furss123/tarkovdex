import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getEconomyDataset } from '@/lib/tarkov-tools';
import { EconomyExplorer } from '@/components/economy/EconomyExplorer';
import { DataError, ToolIntro } from '@/components/tools/ToolShell';

type Props = { params: Promise<{ locale: string }> };
export const revalidate = 900;
export const dynamic = 'force-static';

export async function generateMetadata({ params }: Props) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'barters', path: '/economy/barters' });
}

export default async function BartersPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('economy');
  try {
    const [regular, pve] = await Promise.all([
      getEconomyDataset(locale, 'regular'),
      getEconomyDataset(locale, 'pve'),
    ]);
    return (
      <section className="mx-auto max-w-content px-4 py-8 sm:px-6">
        <ToolIntro title={t('title')} description={t('description')} sourceLabel={t('source')} />
        <EconomyExplorer regular={regular} pve={pve} />
      </section>
    );
  } catch {
    return <section className="mx-auto max-w-content px-4 py-10 sm:px-6"><DataError message={t('error')} /></section>;
  }
}
