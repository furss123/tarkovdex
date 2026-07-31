import { getRequestConfig } from 'next-intl/server';
import { isValidLocale, routing } from './routing';

/**
 * Server-side per-request i18n config. next-intl calls this for every request
 * to resolve the active locale and load its UI message bundle.
 *
 * Only UI strings live in messages/*.json. Game data names (items, tasks, maps)
 * are localized by resolving json.tarkov.dev's per-locale translation
 * dictionaries — see lib/tarkov.ts.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isValidLocale(requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
