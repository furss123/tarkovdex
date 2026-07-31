import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { HERO_ATMOSPHERE } from '@/lib/atmosphere';
import { Heart } from 'lucide-react';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'support', path: '/support' });
}

export default async function SupportPage({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);

  const t = await getTranslations('support');

  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      {/* Texture only, kept faint on purpose: a support page should read as
          trustworthy and restrained, so the image never grows past a header
          backdrop and never sits next to the donation button. */}
      <header className="relative isolate mb-6 flex min-h-[120px] items-end overflow-hidden rounded-lg border border-border px-5 py-5 sm:min-h-[150px] sm:px-6">
        <Image
          src={HERO_ATMOSPHERE}
          alt=""
          fill
          sizes="(max-width: 80rem) 100vw, 1280px"
          className="-z-10 object-cover object-center opacity-25"
        />
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-t from-bg via-bg/70 to-bg/50"
          aria-hidden="true"
        />
        <h1 className="text-[28px] font-medium leading-9 tracking-tight text-fg sm:text-[30px] sm:leading-10">
          {t('title')}
        </h1>
      </header>

      <div className="mx-auto max-w-2xl rounded-lg border border-border p-6">
        <p className="text-center text-sm text-fg">{t('body')}</p>

        <div className="mt-8 flex justify-center">
          <a
            href="https://ko-fi.com/nightscav"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-accent bg-accent/10 px-6 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <Heart className="h-5 w-5" aria-hidden="true" />
            {t('kofiLink')}
          </a>
        </div>

        <p className="mt-8 border-t border-border/60 pt-4 text-xs text-muted">
          {t('disclaimer')}
        </p>
      </div>
    </section>
  );
}
