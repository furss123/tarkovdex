'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getPathname, usePathname } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { publicLocales } from '@/lib/locale-availability';

const LABELS: Record<Locale, string> = {
  ko: '한국어',
  zh: '中文',
  en: 'English',
};

/**
 * Segmented language switcher. Replaces the current URL with the same path
 * under the chosen locale while preserving any query string. Only publicly
 * available locales are rendered — Chinese stays in the type map so it can
 * return without deleting the translation layer.
 */
export function LocaleSwitcher() {
  const t = useTranslations('common');
  const pathname = usePathname();
  const params = useParams();
  const active = params.locale as Locale;

  function select(next: Locale) {
    if (next === active) return;
    // Items filters intentionally use history.replaceState so typing does not
    // trigger a Next navigation. Read the browser URL at click time rather than
    // a potentially stale useSearchParams snapshot.
    const localizedPathname = getPathname({ href: pathname, locale: next });
    window.location.assign(
      `${localizedPathname}${window.location.search}${window.location.hash}`,
    );
  }

  return (
    <div
      className="flex items-center rounded-md border border-border p-0.5"
      role="group"
      aria-label={t('language')}
    >
      {publicLocales.map((locale) => {
        const isActive = locale === active;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => select(locale)}
            aria-pressed={isActive}
            lang={locale}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-1.5 py-1 text-[15px] leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              isActive
                ? 'bg-accent text-accent-fg'
                : 'text-muted hover:text-fg'
            }`}
          >
            {LABELS[locale]}
          </button>
        );
      })}
    </div>
  );
}
