'use client';

import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Search input for the tasks page. Visually mirrors ItemSearch (icon-left
 * input, same border/focus styling), but is a controlled component driven by
 * TasksExplorer's local state instead of a URL query param — the full task
 * list is fetched once and filtered client-side (see lib/tarkov.ts > getTasks).
 */
export function TaskSearch({
  value,
  onChange,
  onCompositionStart,
  onCompositionEnd,
}: {
  value: string;
  onChange: (value: string) => void;
  onCompositionStart?: () => void;
  onCompositionEnd?: () => void;
}) {
  const t = useTranslations('tasks');

  return (
    <div className="relative max-w-md">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            onChange('');
          }
        }}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchPlaceholder')}
        autoComplete="off"
        className="min-h-touch w-full rounded-md border border-border bg-surface py-2 pl-9 pr-11 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('clearSearch')}
          className="absolute right-0 top-0 flex size-touch items-center justify-center rounded-r-md text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
