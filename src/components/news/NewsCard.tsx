'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Locale } from '@/i18n/routing';
import type { NewsItem } from '@/lib/steam-news';
import { formatDate } from '@/lib/format';

const PREVIEW_LENGTH = 160;

/**
 * One news post, collapsed to a title + date + short preview by default —
 * click anywhere on the row to expand the full body in place. No external
 * "view source" link (removed per explicit request): the full translated
 * (or original English) content is meant to be readable entirely on-site.
 */
export function NewsCard({ item, locale }: { item: NewsItem; locale: Locale }) {
  const [open, setOpen] = useState(false);

  const preview =
    item.content.length > PREVIEW_LENGTH
      ? `${item.content.slice(0, PREVIEW_LENGTH).trim()}…`
      : item.content;

  return (
    <div className="border-b border-border/60 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-sm text-fg">{item.title}</span>
            <span className="shrink-0 text-xs text-muted">
              {formatDate(item.publishedAt, locale)}
            </span>
          </div>
          {!open && item.content ? (
            <p className="mt-1.5 text-xs text-muted">{preview}</p>
          ) : null}
        </div>
        <ChevronDown
          className={`mt-0.5 size-4 shrink-0 text-muted transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="px-4 pb-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
            {item.content}
          </p>
        </div>
      ) : null}
    </div>
  );
}
