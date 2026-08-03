'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { LocaleSwitcher } from './LocaleSwitcher';
import { GameModeSwitcher } from './GameModeSwitcher';
import { SearchTrigger } from '@/components/search/SearchTrigger';

const NAV_ITEMS = [
  { key: 'news', href: '/news', activePath: '/news' },
  { key: 'items', href: '/economy/items', activePath: '/economy/items' },
  { key: 'watchlist', href: '/economy/watchlist', activePath: '/economy/watchlist' },
  { key: 'barters', href: '/economy/barters', activePath: '/economy/barters' },
  { key: 'craftCalculator', href: '/economy/craft-calculator', activePath: '/economy/craft-calculator' },
  { key: 'tasks', href: '/progression/tasks', activePath: '/progression/tasks' },
  { key: 'gunsmith', href: '/progression/gunsmith', activePath: '/progression/gunsmith' },
  { key: 'ammo', href: '/combat/ammo', activePath: '/combat/ammo' },
  { key: 'armor', href: '/combat/armor', activePath: '/combat/armor' },
  { key: 'budgetBuilder', href: '/combat/budget-builder', activePath: '/combat/budget-builder' },
  { key: 'maps', href: '/maps', activePath: '/maps' },
  { key: 'beginner', href: '/beginner', activePath: '/beginner' },
  { key: 'about', href: '/about', activePath: '/about' },
  { key: 'support', href: '/support', activePath: '/support' },
] as const;

const SWITCHER_FALLBACK = (
  <div
    aria-hidden="true"
    className="h-[52px] w-[182px] rounded-md border border-border"
  />
);

function isActivePath(pathname: string, activePath: string) {
  return pathname === activePath || pathname.startsWith(`${activePath}/`);
}

export function Header() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const desktopQuery = window.matchMedia('(min-width: 1280px)');
    document.body.style.overflow = 'hidden';

    function getFocusable() {
      return drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select',
      );
    }

    getFocusable()?.[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      const focusable = getFocusable();
      if (event.key !== 'Tab' || !focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function onDesktopChange(event: MediaQueryListEvent) {
      if (event.matches) setMenuOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    desktopQuery.addEventListener('change', onDesktopChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      desktopQuery.removeEventListener('change', onDesktopChange);
    };
  }, [menuOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-content items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-5">
            <Link
              href="/"
              className="flex min-h-touch shrink-0 items-center rounded text-[17px] font-medium leading-5 tracking-tight text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-[18px]"
            >
              {t('brand')}
            </Link>
            <nav className="hidden h-[68px] items-center gap-0.5 xl:flex" aria-label={t('menu')}>
              {NAV_ITEMS.map((item) => (
                <TopLink
                  key={item.key}
                  href={item.href}
                  active={isActivePath(pathname, item.activePath)}
                >
                  {t(item.key)}
                </TopLink>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <SearchTrigger />
            <GameModeSwitcher />
            <div className="hidden xl:block">
              <Suspense fallback={SWITCHER_FALLBACK}>
                <LocaleSwitcher />
              </Suspense>
            </div>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              aria-label={menuOpen ? t('closeMenu') : t('menu')}
              className="flex size-touch items-center justify-center rounded-md border border-border text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent xl:hidden"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <div id="mobile-navigation" className="fixed inset-0 top-[68px] z-50 xl:hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 size-full bg-black/70"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('menu')}
            className="absolute inset-x-0 top-0 max-h-[calc(100dvh-68px)] overflow-y-auto border-b border-border bg-bg px-4 pb-5 pt-3 sm:px-6"
          >
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  menuButtonRef.current?.focus();
                }}
                aria-label={t('closeMenu')}
                className="flex size-touch items-center justify-center rounded-md border border-border text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <nav aria-label={t('menu')} className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <MobileLink
                  key={item.key}
                  href={item.href}
                  active={isActivePath(pathname, item.activePath)}
                  onNavigate={() => setMenuOpen(false)}
                >
                  {t(item.key)}
                </MobileLink>
              ))}
            </nav>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Suspense fallback={SWITCHER_FALLBACK}>
                <LocaleSwitcher />
              </Suspense>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function TopLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-touch items-center rounded px-1.5 text-[16px] leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        active ? 'text-accent' : 'text-muted hover:text-fg'
      }`}
    >
      {children}
      {active ? (
        <span className="absolute inset-x-1.5 bottom-[-12px] h-0.5 bg-accent" aria-hidden="true" />
      ) : null}
    </Link>
  );
}

function MobileLink({
  href,
  active,
  children,
  onNavigate,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-touch items-center rounded-md border-l-2 px-3 text-sm ${
        active
          ? 'border-accent bg-surface-2 text-accent'
          : 'border-transparent text-muted hover:bg-surface hover:text-fg'
      }`}
    >
      {children}
    </Link>
  );
}
