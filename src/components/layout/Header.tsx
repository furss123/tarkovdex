'use client';

import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { NAV_LINKS } from '@/lib/navigation';
import { GameModeSwitcher } from './GameModeSwitcher';
import { LocaleSwitcher } from './LocaleSwitcher';

const NAV_LINK_CLASS =
  'flex min-h-touch items-center rounded px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50';

/**
 * Brand, three topic links, and the two controls that change what every board
 * shows.
 *
 * The full bar does not fit a phone: the brand, three Korean nav labels and two
 * segmented controls overflow 375px by a wide margin, and neither control can
 * shrink without dropping under the 44px touch floor. Below `lg` the nav
 * collapses into a disclosure while the mode and language switchers stay
 * visible on their own row — hiding the mode switcher behind the menu would put
 * the thing that reinterprets every number on the page one tap further away,
 * which is the opposite of what it is for.
 *
 * A client component because the disclosure holds state; the links themselves
 * are still `next-intl` `Link`s, so locale prefixing is unchanged.
 */
export function Header() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on navigation — otherwise the panel stays open over the page the
  // user just asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-content flex-col gap-2 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/"
            className="flex min-h-touch items-center rounded text-base font-medium tracking-tight text-fg transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            TarkovDex
          </Link>

          <nav aria-label={t('primary')} className="hidden lg:flex lg:items-center lg:gap-1">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`${NAV_LINK_CLASS} ${
                    active ? 'text-accent' : 'text-muted hover:text-fg'
                  }`}
                >
                  {t(link.key)}
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="primary-nav-panel"
            aria-label={t('menu')}
            className="flex size-touch items-center justify-center rounded border border-border text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 lg:hidden"
          >
            {open ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 lg:justify-end">
          <GameModeSwitcher />
          <LocaleSwitcher />
        </div>
      </div>

      {open ? (
        <nav
          id="primary-nav-panel"
          aria-label={t('primary')}
          className="border-t border-border lg:hidden"
        >
          <ul className="mx-auto flex max-w-content flex-col px-4 py-1 sm:px-6">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={`${NAV_LINK_CLASS} w-full ${
                      active ? 'text-accent' : 'text-fg hover:text-accent'
                    }`}
                  >
                    {t(link.key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
