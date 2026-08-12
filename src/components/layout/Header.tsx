import { Suspense } from 'react';
import { Link } from '@/i18n/navigation';
import { GameModeSwitcher } from './GameModeSwitcher';
import { LocaleSwitcher } from './LocaleSwitcher';

const SWITCHER_FALLBACK = (
  <div
    aria-hidden="true"
    className="h-[52px] w-[124px] rounded-md border border-border"
  />
);

/**
 * Header for a single-page site: a brand link home and the two controls that
 * actually change what the dashboard shows.
 *
 * There is no primary navigation, no hamburger and no mobile drawer any more —
 * with one content page there is nowhere to navigate to, and a menu holding a
 * single link is worse than no menu. The support and privacy links live in the
 * footer, which is where users look for them anyway.
 *
 * The mode switcher stays in the header rather than moving next to the boards:
 * it changes both boards at once, so it belongs to the page, not to either one.
 */
export function Header() {
  return (
    <header className="border-b border-border">
      {/*
        Stacks below `sm`. Measured: brand (~85px) plus both segmented controls
        (~96px and ~124px) overflow a 375px viewport by 26px on one line, and
        neither control can shrink without dropping under the 44px touch floor.
        Two rows is the honest fix; hiding a control behind a menu would put the
        thing that changes the whole board one tap further away.
      */}
      <div className="mx-auto flex max-w-content flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
        <Link
          href="/"
          className="flex min-h-touch items-center self-start rounded text-base font-medium tracking-tight text-fg transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          TarkovDex
        </Link>

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <GameModeSwitcher />
          <Suspense fallback={SWITCHER_FALLBACK}>
            <LocaleSwitcher />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
