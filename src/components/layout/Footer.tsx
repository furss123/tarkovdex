import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { SITE_AUTHOR } from '@/lib/site';
import { getVisibleFooterLinks } from '@/lib/navigation';
import { LocaleSwitcher } from './LocaleSwitcher';

const SWITCHER_FALLBACK = (
  <div
    aria-hidden="true"
    className="h-[52px] w-[124px] rounded-md border border-border"
  />
);

const FOOTER_ONLY_KEYS = new Set(['status', 'localData', 'about']);

/**
 * Site footer. Carries the legally required disclaimer that TarkovDex is an
 * unofficial fan project unaffiliated with Battlestate Games, localized per
 * language, plus the creator credit (name kept literal across all locales).
 * Server component; only the shared language switcher is a client island.
 */
export async function Footer() {
  const t = await getTranslations('footer');
  const tc = await getTranslations('common');
  const tn = await getTranslations('nav');
  const links = getVisibleFooterLinks();

  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-content px-4 py-4 sm:px-6 sm:py-5">
        <div className="max-w-4xl">
          <p className="text-sm text-fg">{t('summary')}</p>
          <p className="mt-1 text-xs text-muted">{t('disclaimer')}</p>
          <p className="mt-0.5 text-xs text-muted">{t('dataSource')}</p>
        </div>

        <div className="mt-3 flex flex-col border-t border-border/60 pt-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <span className="text-xs text-muted">
            {tc('createdBy')} {SITE_AUTHOR}
          </span>
          <div className="flex flex-col items-start sm:items-end">
            <nav
              aria-label={t('navigation')}
              className="flex flex-wrap items-center gap-x-4 text-xs text-muted sm:justify-end"
            >
              {links.map((item) => {
                const label = FOOTER_ONLY_KEYS.has(item.key)
                  ? t(item.key as 'status' | 'localData' | 'about')
                  : tn(item.key as Parameters<typeof tn>[0]);
                return (
                  <Link
                    key={item.href}
                    href={item.href!}
                    className="flex min-h-touch min-w-touch items-center justify-center rounded underline-offset-4 transition-colors hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-2">
              <Suspense fallback={SWITCHER_FALLBACK}>
                <LocaleSwitcher />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
