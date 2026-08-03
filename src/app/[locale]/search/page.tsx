import { setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { isValidLocale, type Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { SearchPageClient } from '@/components/search/SearchPageClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = (isValidLocale(raw) ? raw : 'ko') as Locale;
  const meta = await buildPageMetadata({
    locale,
    page: 'search',
    path: '/search',
  });
  return {
    ...meta,
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; domain?: string }>;
}) {
  const { locale: raw } = await params;
  const locale = (isValidLocale(raw) ? raw : 'ko') as Locale;
  setRequestLocale(locale);
  const query = await searchParams;

  return (
    <SearchPageClient
      initialQuery={(query.q ?? '').slice(0, 100)}
      initialDomain={query.domain ?? null}
    />
  );
}