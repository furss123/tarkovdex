import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { Heart } from 'lucide-react';
import { KOFI_URL } from '@/lib/site';

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
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="text-[28px] font-medium leading-9 tracking-tight text-fg sm:text-[30px] sm:leading-10">
          {t('title')}
        </h1>
      </header>

      <div className="mx-auto max-w-2xl rounded-lg border border-border p-6">
        <p className="text-center text-sm text-fg">{t('body')}</p>

        <div className="mt-8 flex justify-center">
          <a
            href={KOFI_URL}
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
