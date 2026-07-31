'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Clamps long text to a few lines with a show-more toggle. Used by MapCard
 * (a Server Component) for map descriptions, so the toggle state lives here. */
export function ExpandableText({
  text,
  moreLabel,
  lessLabel,
}: {
  text: string;
  moreLabel: string;
  lessLabel: string;
}) {
  const [open, setOpen] = useState(false);
  // ponytail: clamp always renders the toggle for text over ~120 chars
  // instead of measuring real overflow; short texts skip the toggle.
  const needsToggle = text.length > 120;

  return (
    <div>
      <p className={`text-sm leading-relaxed text-muted ${open ? '' : 'line-clamp-2'}`}>
        {text}
      </p>
      {needsToggle ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="mt-1 inline-flex min-h-touch items-center gap-1 rounded text-[13px] leading-5 text-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {open ? lessLabel : moreLabel}
          <ChevronDown
            className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </div>
  );
}
