import 'server-only';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { locales, type Locale } from '@/i18n/routing';
import { SITE_URL } from '@/lib/site';

type PageMetadataKey =
  | 'home'
  | 'items'
  | 'barters'
  | 'tasks'
  | 'gunsmith'
  | 'ammo'
  | 'armor'
  | 'maps'
  | 'news'
  | 'about'
  | 'support';

const OG_LOCALE: Record<Locale, string> = {
  ko: 'ko_KR',
  zh: 'zh_CN',
  en: 'en_US',
};

/**
 * hreflang `x-default` target. Not the same as `routing.ts`'s `defaultLocale`
 * (`ko`, chosen for the site's primary audience) — `x-default` is a distinct
 * SEO signal for "which page to show a user/crawler whose language doesn't
 * match any listed hreflang". The bare `/` root isn't a valid candidate: with
 * `localePrefix: 'always'`, `/` 307-redirects based on `Accept-Language`
 * rather than serving stable content, so per Google's guidance x-default
 * should point at a real, direct-hit page instead — English, as TarkovDex's
 * lingua-franca fallback for a global EFT audience.
 */
export const X_DEFAULT_LOCALE: Locale = 'en';

/**
 * Shared shape (canonical/hreflang/OG/Twitter) behind both `buildPageMetadata`
 * (fixed category pages, title/description looked up from `pageMetadata.*`)
 * and `buildDetailPageMetadata` (per-entity detail pages, title/description
 * computed from real data) — one implementation so the two can't drift.
 */
function buildMetadataFromStrings({
  locale,
  path,
  title,
  description,
}: {
  locale: Locale;
  path: string;
  title: string;
  description: string;
}): Metadata {
  const canonical = `${SITE_URL}/${locale}${path}`;
  const images = [
    {
      url: `${SITE_URL}/og-image.png`,
      width: 1200,
      height: 630,
      alt: 'TarkovDex',
    },
  ];

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: Object.fromEntries([
        ...locales.map((language) => [
          language,
          `${SITE_URL}/${language}${path}`,
        ]),
        ['x-default', `${SITE_URL}/${X_DEFAULT_LOCALE}${path}`],
      ]),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'TarkovDex',
      type: 'website',
      locale: OG_LOCALE[locale],
      alternateLocale: locales
        .filter((language) => language !== locale)
        .map((language) => OG_LOCALE[language]),
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: images.map((image) => image.url),
    },
  };
}

export async function buildPageMetadata({
  locale,
  page,
  path = '',
}: {
  locale: Locale;
  page: PageMetadataKey;
  path?: string;
}): Promise<Metadata> {
  const t = await getTranslations({
    locale,
    namespace: `pageMetadata.${page}`,
  });
  return buildMetadataFromStrings({
    locale,
    path,
    title: t('title'),
    description: t('description'),
  });
}

/**
 * Same canonical/hreflang/OG/Twitter shape as `buildPageMetadata`, for pages
 * whose title/description are computed from real entity data (e.g. a quest
 * detail page) rather than looked up by a fixed `pageMetadata.*` key.
 */
export function buildDetailPageMetadata({
  locale,
  path,
  title,
  description,
}: {
  locale: Locale;
  path: string;
  title: string;
  description: string;
}): Metadata {
  return buildMetadataFromStrings({ locale, path, title, description });
}
