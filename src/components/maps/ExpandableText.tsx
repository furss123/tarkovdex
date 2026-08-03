'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Clamps long map descriptions while keeping the complete text one keyboard
 * or touch action away. Short descriptions remain plain text. */
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
  const descriptionId = useId();
  const needsToggle = text.length > 120;

  return (
    <div>
      <p
        id={descriptionId}
        className={`text-sm leading-relaxed text-muted ${
          needsToggle && !open ? 'line-clamp-2' : ''
        }`}
      >
        {text}
      </p>
      {needsToggle ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={descriptionId}
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
