import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { ItemsExplorer } from '@/components/items/ItemsExplorer';

type Props = { params: Promise<{ locale: string }> };
export const revalidate = 900;

export async function generateMetadata({ params }: Props) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'items', path: '/economy/items' });
}

export default async function ItemsPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  return (
    <section className="mx-auto max-w-content px-4 py-[20px] sm:px-6 sm:py-[24px]">
      <ItemsExplorer locale={locale} />
    </section>
  );
}
