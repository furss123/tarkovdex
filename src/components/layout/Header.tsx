'use client';

import {
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import {
  getVisibleNavigation,
  isActivePath,
  isGroupActive,
  type NavigationItem,
} from '@/lib/navigation';
import { LocaleSwitcher } from './LocaleSwitcher';
import { GameModeSwitcher } from './GameModeSwitcher';
import { SearchTrigger } from '@/components/search/SearchTrigger';

const SWITCHER_FALLBACK = (
  <div
    aria-hidden="true"
    className="h-[52px] w-[124px] rounded-md border border-border"
  />
);

const visibleNav = getVisibleNavigation();

export function Header() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpenGroup, setMobileOpenGroup] = useState<string | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const desktopNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setOpenGroup(null);
    setMobileOpenGroup(null);
  }, [pathname]);

  useEffect(() => {
    if (!openGroup) return;

    function onPointerDown(event: MouseEvent) {
      if (
        desktopNavRef.current &&
        !desktopNavRef.current.contains(event.target as Node)
      ) {
        setOpenGroup(null);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenGroup(null);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openGroup]);

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
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/"
              className="flex min-h-touch shrink-0 items-center rounded text-[17px] font-medium leading-5 tracking-tight text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-[18px]"
            >
              {t('brand')}
            </Link>
            <nav
              ref={desktopNavRef}
              className="hidden h-[68px] items-center gap-0.5 xl:flex"
              aria-label={t('menu')}
            >
              {visibleNav.map((item) =>
                item.children ? (
                  <DesktopGroup
                    key={item.key}
                    item={item}
                    label={t(item.key)}
                    pathname={pathname}
                    open={openGroup === item.key}
                    onToggle={() =>
                      setOpenGroup((current) =>
                        current === item.key ? null : item.key,
                      )
                    }
                    onClose={() => setOpenGroup(null)}
                    translate={t}
                  />
                ) : (
                  <TopLink
                    key={item.key}
                    href={item.href!}
                    active={isActivePath(pathname, item)}
                  >
                    {t(item.key)}
                  </TopLink>
                ),
              )}
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
          <button
            type="button"
            aria-label={t('closeMenu')}
            className="absolute inset-0 size-full bg-black/70"
            onClick={() => {
              setMenuOpen(false);
              menuButtonRef.current?.focus();
            }}
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
              {visibleNav.map((item) =>
                item.children ? (
                  <MobileGroup
                    key={item.key}
                    item={item}
                    label={t(item.key)}
                    pathname={pathname}
                    open={mobileOpenGroup === item.key}
                    onToggle={() =>
                      setMobileOpenGroup((current) =>
                        current === item.key ? null : item.key,
                      )
                    }
                    onNavigate={() => setMenuOpen(false)}
                    translate={t}
                  />
                ) : (
                  <MobileLink
                    key={item.key}
                    href={item.href!}
                    active={isActivePath(pathname, item)}
                    onNavigate={() => setMenuOpen(false)}
                  >
                    {t(item.key)}
                  </MobileLink>
                ),
              )}
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

function DesktopGroup({
  item,
  label,
  pathname,
  open,
  onToggle,
  onClose,
  translate,
}: {
  item: NavigationItem;
  label: string;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  translate: (key: string) => string;
}) {
  const panelId = useId();
  const active = isGroupActive(pathname, item);
  const children = item.children ?? [];

  return (
    <div className="relative flex h-full items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="true"
        onClick={onToggle}
        className={`relative flex min-h-touch items-center gap-1 rounded px-1.5 text-[16px] leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          active ? 'text-accent' : 'text-muted hover:text-fg'
        }`}
      >
        {label}
        <ChevronDown
          className={`size-3.5 transition-transform motion-reduce:transition-none ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
        {active ? (
          <span
            className="absolute inset-x-1.5 bottom-[-12px] h-0.5 bg-accent"
            aria-hidden="true"
          />
        ) : null}
      </button>
      {open ? (
        <div
          id={panelId}
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 min-w-[12rem] rounded-md border border-border bg-bg py-1 shadow-none"
        >
          {children.map((child) => (
            <Link
              key={child.key}
              href={child.href!}
              role="menuitem"
              aria-current={isActivePath(pathname, child) ? 'page' : undefined}
              onClick={onClose}
              className={`flex min-h-touch items-center px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                isActivePath(pathname, child)
                  ? 'bg-surface-2 text-accent'
                  : 'text-muted hover:bg-surface hover:text-fg'
              }`}
            >
              {translate(child.key)}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MobileGroup({
  item,
  label,
  pathname,
  open,
  onToggle,
  onNavigate,
  translate,
}: {
  item: NavigationItem;
  label: string;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  translate: (key: string) => string;
}) {
  const panelId = useId();
  const active = isGroupActive(pathname, item);
  const children = item.children ?? [];

  return (
    <div className="rounded-md">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={`flex min-h-touch w-full items-center justify-between rounded-md border-l-2 px-3 text-sm ${
          active
            ? 'border-accent bg-surface-2 text-accent'
            : 'border-transparent text-muted hover:bg-surface hover:text-fg'
        }`}
      >
        <span>{label}</span>
        <ChevronDown
          className={`size-4 transition-transform motion-reduce:transition-none ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div id={panelId} className="ml-2 mt-1 space-y-1 border-l border-border pl-2">
          {children.map((child) => (
            <MobileLink
              key={child.key}
              href={child.href!}
              active={isActivePath(pathname, child)}
              onNavigate={onNavigate}
            >
              {translate(child.key)}
            </MobileLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TopLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-touch items-center rounded px-1.5 text-[16px] leading-5 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        active ? 'text-accent' : 'text-muted hover:text-fg'
      }`}
    >
      {children}
      {active ? (
        <span
          className="absolute inset-x-1.5 bottom-[-12px] h-0.5 bg-accent"
          aria-hidden="true"
        />
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
  children: ReactNode;
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
