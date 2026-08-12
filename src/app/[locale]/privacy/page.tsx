import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { CONTACT_EMAIL } from '@/lib/site';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Privacy policy.
 *
 * This page exists for a concrete reason, not for completeness: an ad network
 * will not approve a site that serves personalized ads without disclosing the
 * third-party cookies that make them work, and a user cannot exercise an
 * opt-out they were never told about. It is the one page that could not be
 * folded into the dashboard.
 *
 * Everything here describes what the site actually does — local storage for a
 * single preference, no account system, no first-party analytics. If any of
 * that changes, this copy changes with it.
 */

const SECTIONS = [
  'collected',
  'localStorage',
  'ads',
  'thirdParty',
  'rights',
] as const;

export async function generateMetadata({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'privacy', path: '/privacy' });
}

export default async function PrivacyPage({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('privacy');

  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="text-[28px] font-medium leading-9 tracking-tight text-fg sm:text-[30px] sm:leading-10">
          {t('title')}
        </h1>
        <p className="mt-2 text-sm text-muted">{t('intro')}</p>
        <p className="mt-1 text-xs text-muted">
          {t('updatedLabel')}: {t('updatedAt')}
        </p>
      </header>

      <div className="max-w-3xl space-y-6">
        {SECTIONS.map((key) => (
          <article key={key}>
            <h2 className="text-base font-medium text-fg">
              {t(`sections.${key}.title`)}
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted">
              {t(`sections.${key}.body`)}
            </p>
          </article>
        ))}

        <article className="rounded-lg border border-border p-4">
          <h2 className="text-base font-medium text-fg">
            {t('sections.contact.title')}
          </h2>
          <p className="mt-2 text-sm leading-7 text-muted">
            {t('sections.contact.body')}
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-2 inline-flex min-h-touch items-center rounded text-sm text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {CONTACT_EMAIL}
          </a>
        </article>
      </div>
    </section>
  );
}
