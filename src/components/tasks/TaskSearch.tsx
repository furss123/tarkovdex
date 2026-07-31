'use client';

import { Search } from 'lucide-react';
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
}: {
  value: string;
  onChange: (value: string) => void;
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
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchPlaceholder')}
        className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      />
    </div>
  );
}
