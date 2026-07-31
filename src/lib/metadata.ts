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
  const title = t('title');
  const description = t('description');
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
        ['x-default', `${SITE_URL}/ko${path}`],
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
