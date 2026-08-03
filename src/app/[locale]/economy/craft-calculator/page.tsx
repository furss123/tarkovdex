import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import type { Locale } from '@/i18n/routing';
import { isValidLocale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getEconomyDataset } from '@/lib/tarkov-tools';
import { CraftCalculatorBoard } from '@/components/economy/CraftCalculatorBoard';
import { DataError } from '@/components/tools/ToolShell';
import { ModeAvailabilityBoundary } from '@/components/tools/ModeAvailabilityBoundary';
import { settleModePair } from '@/lib/settle-mode-pair';

export const revalidate = 900;
export const dynamic = 'force-static';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const raw = (await params).locale;
  const locale = (isValidLocale(raw) ? raw : 'ko') as Locale;
  return {
    ...(await buildPageMetadata({
      locale,
      page: 'craftCalculator',
      path: '/economy/craft-calculator',
    })),
    robots: { index: false, follow: true },
  };
}

export default async function CraftCalculatorPage({ params }: Props) {
  const raw = (await params).locale;
  const locale = (isValidLocale(raw) ? raw : 'ko') as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('craftCalculator');
  const datasets = await settleModePair({
    regular: getEconomyDataset(locale, 'regular'),
    pve: getEconomyDataset(locale, 'pve'),
  });
  const fallback = datasets.regular ?? datasets.pve;
  if (!fallback) {
    return (
      <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <DataError message={t('error')} />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-content px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-[28px] font-medium leading-9 tracking-tight text-fg sm:text-[30px] sm:leading-10">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-3xl text-[16px] leading-6 text-muted">{t('description')}</p>
      </header>
      <ModeAvailabilityBoundary
        regularAvailable={Boolean(datasets.regular)}
        pveAvailable={Boolean(datasets.pve)}
        errorMessage={t('error')}
      >
        <CraftCalculatorBoard
          pvpData={datasets.regular ?? fallback}
          pveData={datasets.pve ?? fallback}
        />
      </ModeAvailabilityBoundary>
    </section>
  );
}
