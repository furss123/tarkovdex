import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import type { Locale } from '@/i18n/routing';
import { isValidLocale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { BudgetBuilderBoard } from '@/components/combat/BudgetBuilderBoard';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const raw = (await params).locale;
  const locale = (isValidLocale(raw) ? raw : 'ko') as Locale;
  return {
    ...(await buildPageMetadata({
      locale,
      page: 'budgetBuilder',
      path: '/combat/budget-builder',
    })),
    robots: { index: false, follow: true },
  };
}

export default async function BudgetBuilderPage({ params }: Props) {
  const raw = (await params).locale;
  const locale = (isValidLocale(raw) ? raw : 'ko') as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('budgetBuilder');

  return (
    <section className="mx-auto max-w-content px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-[28px] font-medium leading-9 tracking-tight text-fg sm:text-[30px] sm:leading-10">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-3xl text-[16px] leading-6 text-muted">{t('description')}</p>
      </header>
      <BudgetBuilderBoard />
    </section>
  );
}
