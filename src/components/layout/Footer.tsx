import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { SITE_AUTHOR } from '@/lib/site';

/**
 * Site footer. Carries the legally required disclaimer that TarkovDex is an
 * unofficial fan project unaffiliated with Battlestate Games, localized per
 * language, plus the creator credit (name kept literal across all locales).
 * Server component — no client JS.
 */
export async function Footer() {
  const t = await getTranslations('footer');
  const tc = await getTranslations('common');
  const tn = await getTranslations('nav');
  const mainLinks = [
    { href: '/news', label: tn('news') },
    { href: '/economy/items', label: tn('items') },
    { href: '/economy/barters', label: tn('barters') },
    { href: '/progression/tasks', label: tn('tasks') },
    { href: '/combat/ammo', label: tn('ammo') },
    { href: '/combat/armor', label: tn('armor') },
    { href: '/maps', label: tn('maps') },
  ] as const;

  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-content px-4 py-4 sm:px-6 sm:py-5">
        <div className="max-w-4xl">
          <p className="text-sm text-fg">{t('summary')}</p>
          <p className="mt-1 text-xs text-muted">{t('disclaimer')}</p>
          <p className="mt-0.5 text-xs text-muted">{t('dataSource')}</p>
        </div>

        <div className="mt-3 flex flex-col border-t border-border/60 pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <span className="text-xs text-muted">
            {tc('createdBy')} {SITE_AUTHOR}
          </span>
          <nav
            aria-label={t('navigation')}
            className="flex flex-wrap items-center gap-x-4 text-xs text-muted"
          >
            {mainLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-touch min-w-touch items-center justify-center rounded underline-offset-4 transition-colors hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/about"
              className="flex min-h-touch min-w-touch items-center justify-center rounded underline-offset-4 transition-colors hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {t('about')}
            </Link>
            <Link
              href="/support"
              className="flex min-h-touch min-w-touch items-center justify-center rounded underline-offset-4 transition-colors hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {t('support')}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
