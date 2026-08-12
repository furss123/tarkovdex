import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import { isValidLocale } from '@/i18n/routing';
import { publicLocales } from '@/lib/locale-availability';
import { SITE_AUTHOR, SITE_URL } from '@/lib/site';
import { ADSENSE_CLIENT } from '@/lib/ads';
import { GameModeProvider } from '@/contexts/GameModeContext';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import '../globals.css';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/** Pre-render publicly available locales at build time. Chinese remains in
 *  routing/messages for reactivation; `/zh` redirects to `/ko` in middleware. */
export function generateStaticParams() {
  return publicLocales.map((locale) => ({ locale }));
}

/** Next 15 wants theme colour on the viewport export, not on metadata. */
export const viewport: Viewport = {
  themeColor: '#17181b',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const ogImageUrl = new URL('/og-image.png', SITE_URL).toString();

  return {
    metadataBase: new URL(SITE_URL),
    title: t('title'),
    description: t('description'),
    authors: [{ name: SITE_AUTHOR }],
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: 'TarkovDex',
    },
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: '/favicon.ico' },
        { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
        { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/icon.svg', type: 'image/svg+xml' },
      ],
      apple: '/apple-touch-icon.png',
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      locale,
      siteName: 'TarkovDex',
      type: 'website',
      images: [
        { url: ogImageUrl, width: 1200, height: 630, alt: 'TarkovDex' },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('description'),
      images: [ogImageUrl],
    },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  // Opt this layout (and its pages) into static rendering.
  setRequestLocale(locale);

  const [messages, t] = await Promise.all([
    getMessages(),
    getTranslations('common'),
  ]);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Pretendard (KR + Latin) and Noto Sans SC (Simplified Chinese). */}
        {locale === 'zh' ? (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link
              rel="preconnect"
              href="https://fonts.gstatic.com"
              crossOrigin=""
            />
            <link
              rel="stylesheet"
              href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500&display=swap"
            />
          </>
        ) : (
          <>
            <link
              rel="preconnect"
              href="https://cdn.jsdelivr.net"
              crossOrigin=""
            />
            <link
              rel="stylesheet"
              href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
            />
          </>
        )}
      </head>
      <body>
        <a
          href="#main-content"
          className="fixed left-4 top-3 z-[60] -translate-y-24 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-fg"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <GameModeProvider>
            <div className="flex min-h-screen flex-col">
              <Header />
              <main
                id="main-content"
                tabIndex={-1}
                className="min-w-0 flex-1 focus:outline-none"
              >
                {children}
              </main>
              <Footer />
            </div>
          </GameModeProvider>
        </NextIntlClientProvider>

        {/*
          AdSense loader. Absent entirely until a publisher id is configured,
          so an unapproved or local build ships no third-party script at all.
          `afterInteractive` keeps it off the critical path — the dashboard's
          first paint and the raid clock must not wait on an ad network.
        */}
        {ADSENSE_CLIENT ? (
          <Script
            id="adsense-loader"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          />
        ) : null}
      </body>
    </html>
  );
}
