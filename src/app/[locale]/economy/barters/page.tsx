import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { buildPageMetadata } from '@/lib/metadata';
import { getEconomyDataset } from '@/lib/tarkov-tools';
import { EconomyExplorer } from '@/components/economy/EconomyExplorer';
import { DataError, ToolIntro } from '@/components/tools/ToolShell';
import { ModeAvailabilityBoundary } from '@/components/tools/ModeAvailabilityBoundary';
import { settleModePair } from '@/lib/settle-mode-pair';
import { domainHealth } from '@/lib/data-observations';

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
  const tc = await getTranslations('craftCalculator');
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
  // The health slot describes the mode the page actually rendered from. A
  // one-mode outage is reported as `partial` rather than as a clean render,
  // and the craft's own source stamp is the newest component-item `updated`.
  const health = domainHealth({
    domain: 'crafts',
    gameMode: datasets.regular ? 'regular' : 'pve',
    locale,
    availability: datasets.regular && datasets.pve ? 'available' : 'partial',
    sourceUpdatedAt: fallback.sourceUpdatedAt,
    totalCount: fallback.crafts.length,
  });

  return (
    <section className="mx-auto max-w-content px-4 py-8 sm:px-6">
      <ToolIntro
        title={t('title')}
        description={t('description')}
        sourceLabel={t('source')}
        locale={locale}
        health={health}
      />
      <p className="mb-4 text-sm">
        <Link href="/economy/craft-calculator" className="text-accent hover:underline">
          {tc('linkFromBarters')}
        </Link>
      </p>
      <ModeAvailabilityBoundary
        regularAvailable={datasets.regular !== null}
        pveAvailable={datasets.pve !== null}
        errorMessage={t('error')}
      >
        <EconomyExplorer regular={datasets.regular ?? fallback} pve={datasets.pve ?? fallback} />
      </ModeAvailabilityBoundary>
    </section>
  );
}
