'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

const SearchDialog = dynamic(
  () => import('./SearchDialog').then((mod) => mod.SearchDialog),
  { ssr: false },
);

/**
 * Header entry + keyboard shortcut. The dialog (and its search fetch code)
 * load only after the first open so the shared first-load JS stays lean.
 */
export function SearchTrigger() {
  const t = useTranslations('search');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        return;
      }

      // Skip bare `/` — it conflicts with typing in inputs and with some
      // browser find-in-page shortcuts depending on locale layouts.
      void typing;
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('open')}
        className="flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-md border border-border px-2 text-muted transition-colors hover:border-accent hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:px-3"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="hidden text-sm lg:inline">{t('title')}</span>
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[11px] text-muted xl:inline">
          Ctrl K
        </kbd>
      </button>
      {open ? <SearchDialog open={open} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
