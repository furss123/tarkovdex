'use client';

import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function ItemSearch({
  value,
  onChange,
  onClear,
  onCompositionStart,
  onCompositionEnd,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  onCompositionStart?: () => void;
  onCompositionEnd?: () => void;
}) {
  const t = useTranslations('items');

  return (
    <div className="relative w-full">
      <label htmlFor="item-search" className="sr-only">
        {t('searchPlaceholder')}
      </label>
      <Search
        className="pointer-events-none absolute left-[12px] top-1/2 size-[18px] -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <input
        id="item-search"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            (onClear ?? (() => onChange('')))();
          }
        }}
        placeholder={t('searchPlaceholder')}
        autoComplete="off"
        className="h-[44px] w-full rounded-md border border-border bg-bg pl-[40px] pr-[44px] text-[16px] leading-6 text-fg placeholder:text-muted focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      />
      {value ? (
        <button
          type="button"
          onClick={onClear ?? (() => onChange(''))}
          aria-label={t('clearSearch')}
          className="absolute right-0 top-0 flex size-[44px] items-center justify-center rounded-r-md text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <X className="size-[16px]" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
