import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChartNoAxesColumn, ListChecks, Map, Newspaper, Scale, Search, Shield } from 'lucide-react';
import { SITE_AUTHOR } from '@/lib/site';
import { buildPageMetadata } from '@/lib/metadata';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'about', path: '/about' });
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('about');

  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-border pb-8">
          <p className="text-xs font-medium uppercase tracking-widest text-accent">
            TarkovDex
          </p>
          <h1 className="mt-2 text-2xl font-medium tracking-tight text-fg">
            {t('title')}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
            {t('intro')}
          </p>
        </header>

        <section className="mt-10" aria-labelledby="about-features">
          <h2 id="about-features" className="text-sm font-medium text-fg">
            {t('featuresTitle')}
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <article className="rounded-lg border border-border bg-surface/30 p-4">
              <Search className="size-5 text-accent" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-medium text-fg">
                {t('itemsTitle')}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {t('itemsBody')}
              </p>
            </article>

            <article className="rounded-lg border border-border bg-surface/30 p-4">
              <ListChecks className="size-5 text-accent" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-medium text-fg">
                {t('tasksTitle')}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {t('tasksBody')}
              </p>
            </article>

            <article className="rounded-lg border border-border bg-surface/30 p-4">
              <Map className="size-5 text-accent" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-medium text-fg">
                {t('mapsTitle')}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {t('mapsBody')}
              </p>
            </article>

            <article className="rounded-lg border border-border bg-surface/30 p-4">
              <Newspaper className="size-5 text-accent" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-medium text-fg">
                {t('newsTitle')}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {t('newsBody')}
              </p>
            </article>
            <article className="rounded-lg border border-border bg-surface/30 p-4">
              <Scale className="size-5 text-accent" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-medium text-fg">{t('economyTitle')}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t('economyBody')}</p>
            </article>
            <article className="rounded-lg border border-border bg-surface/30 p-4">
              <ChartNoAxesColumn className="size-5 text-accent" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-medium text-fg">{t('combatTitle')}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t('combatBody')}</p>
            </article>
            <article className="rounded-lg border border-border bg-surface/30 p-4">
              <Shield className="size-5 text-accent" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-medium text-fg">{t('armorTitle')}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t('armorBody')}</p>
            </article>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.35fr]">
          <div>
            <h2 className="text-sm font-medium text-fg">{t('dataTitle')}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {t('dataBody')}
            </p>
          </div>

          <dl className="overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border px-4 py-3">
              <dt className="text-xs text-muted">{t('gameDataLabel')}</dt>
              <dd className="mt-1 text-sm text-fg">{t('gameDataValue')}</dd>
            </div>
            <div className="border-b border-border px-4 py-3">
              <dt className="text-xs text-muted">{t('newsDataLabel')}</dt>
              <dd className="mt-1 text-sm text-fg">{t('newsDataValue')}</dd>
            </div>
            <div className="border-b border-border px-4 py-3">
              <dt className="text-xs text-muted">{t('refreshLabel')}</dt>
              <dd className="mt-1 text-sm text-fg">{t('refreshValue')}</dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-xs text-muted">{t('supportLabel')}</dt>
              <dd className="mt-1 text-sm text-fg">{t('supportValue')}</dd>
            </div>
          </dl>
        </section>

        <aside className="mt-10 border-l-2 border-accent bg-surface/30 px-5 py-4">
          <h2 className="text-sm font-medium text-fg">{t('principlesTitle')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {t('principlesBody')}
          </p>
        </aside>

        <section className="mt-8 border-t border-border pt-6">
          <h2 className="text-sm font-medium text-fg">{t('disclaimerTitle')}</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {t('disclaimerBody')}
          </p>
          <p className="mt-5 text-xs text-muted">
            {t('creatorLabel')} <span className="text-muted">{SITE_AUTHOR}</span>
          </p>
        </section>
      </div>
    </section>
  );
}
