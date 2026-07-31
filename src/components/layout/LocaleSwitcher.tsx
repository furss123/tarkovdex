'use client';

import { useParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';
import { locales, type Locale } from '@/i18n/routing';

const LABELS: Record<Locale, string> = {
  ko: '한국어',
  zh: '中文',
  en: 'EN',
};

/**
 * Segmented language switcher. Replaces the current URL with the same path
 * under the chosen locale while preserving any query string.
 */
export function LocaleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const active = params.locale as Locale;

  function select(next: Locale) {
    if (next === active) return;
    // Items filters intentionally use history.replaceState so typing does not
    // trigger a Next navigation. Read the browser URL at click time rather than
    // a potentially stale useSearchParams snapshot.
    const qs = window.location.search.slice(1);
    const href = qs ? `${pathname}?${qs}` : pathname;
    router.replace(href, { locale: next });
  }

  return (
    <div
      className="flex items-center rounded-md border border-border p-0.5"
      role="group"
      aria-label="Language"
    >
      {locales.map((locale) => {
        const isActive = locale === active;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => select(locale)}
            aria-pressed={isActive}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-2 py-1 text-[12px] leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
