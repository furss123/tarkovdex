import { type Locale, locales } from '@/i18n/routing';

/**
 * Public locale surface. `zh` stays in `routing.locales` (messages, types,
 * page trees) so it can be re-enabled later; only this module decides what
 * the language switcher, sitemap, and hreflang advertise.
 */
export type LocaleAvailability = {
  locale: Locale;
  public: boolean;
  fallbackLocale?: Locale;
};

export const localeAvailability: readonly LocaleAvailability[] = [
  { locale: 'ko', public: true },
  { locale: 'en', public: true },
  { locale: 'zh', public: false, fallbackLocale: 'ko' },
] as const;

export const publicLocales: readonly Locale[] = localeAvailability
  .filter((entry) => entry.public)
  .map((entry) => entry.locale);

export function isPublicLocale(locale: string | undefined): locale is Locale {
  return (
    locale != null &&
    (publicLocales as readonly string[]).includes(locale)
  );
}

export function fallbackLocaleFor(locale: Locale): Locale {
  const entry = localeAvailability.find((item) => item.locale === locale);
  return entry?.fallbackLocale ?? 'ko';
}

/**
 * Map an unpublished locale URL onto its public fallback while keeping the
 * remainder of the path. Returns null when no rewrite is needed.
 */
export function rewritePrivateLocalePath(pathname: string): string | null {
  for (const entry of localeAvailability) {
    if (entry.public) continue;
    const prefix = `/${entry.locale}`;
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue;
    const rest = pathname === prefix ? '' : pathname.slice(prefix.length);
    const fallback = entry.fallbackLocale ?? 'ko';
    return `/${fallback}${rest}`;
  }
  return null;
}

/** Every known locale still exists for internal/i18n plumbing. */
export const allLocales = locales;
