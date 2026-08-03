import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { LocalDataPanel } from '@/components/local-data/LocalDataPanel';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const locale = (await params).locale as Locale;
  const base = await buildPageMetadata({ locale, page: 'localData', path: '/local-data' });
  return { ...base, robots: { index: false, follow: true } };
}

export default async function LocalDataPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('localData');

  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-[28px] font-medium leading-9 tracking-tight text-fg sm:text-[30px] sm:leading-10">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-3xl text-[16px] leading-6 text-muted">{t('description')}</p>
      </header>
      <LocalDataPanel locale={locale} />
    </section>
  );
}
