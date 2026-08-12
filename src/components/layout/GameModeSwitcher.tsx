'use client';

import { useTranslations } from 'next-intl';
import { useGameMode } from '@/contexts/GameModeContext';
import { GAME_MODES, type GameMode } from '@/types/tarkov';

const LABEL_KEY: Record<GameMode, 'pvpShort' | 'pveShort' | 'seasonalShort'> = {
  regular: 'pvpShort',
  pve: 'pveShort',
  seasonal: 'seasonalShort',
};

/**
 * Site-wide game mode selector: PvP, PvE, and the seasonal wipe.
 *
 * The seasonal button carries a green indicator dot and renders its trailing
 * "S" in the same green, which is the one place on the site outside the price
 * deltas where a hue other than amber appears. That is deliberate and narrow:
 * a seasonal wipe is a *different game*, with its own economy and its own boss
 * table, and a visitor who forgets which mode is selected will read every
 * number on the page wrong. An identity mark that is visible at a glance is
 * worth more here than a perfectly monochrome control.
 *
 * The active state still uses the amber fill every other selected control
 * uses, so selection is never carried by hue alone — the green says *which
 * mode this is*, the amber says *which one you picked*.
 */
export function GameModeSwitcher() {
  const t = useTranslations('common');
  const { gameMode, setGameMode } = useGameMode();

  return (
    <div
      className="flex items-center rounded-md border border-border p-0.5"
      role="group"
      aria-label={t('gameMode')}
    >
      {GAME_MODES.map((mode) => {
        const isActive = mode === gameMode;
        const seasonal = mode === 'seasonal';
        return (
          <button
            key={mode}
            type="button"
            onClick={() => setGameMode(mode)}
            aria-pressed={isActive}
            title={t(seasonal ? 'seasonalName' : LABEL_KEY[mode])}
            className={`flex min-h-touch min-w-touch items-center justify-center gap-1 rounded px-1.5 py-1 text-[15px] font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              isActive ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {seasonal ? (
              <>
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-seasonal shadow-[0_0_5px_rgb(var(--color-seasonal))]"
                />
                <span>
                  PvP
                  <span
                    className={
                      isActive
                        ? 'ml-0.5 text-accent-fg'
                        : 'ml-0.5 text-seasonal [text-shadow:0_0_7px_rgb(var(--color-seasonal)/0.7)]'
                    }
                  >
                    S
                  </span>
                </span>
              </>
            ) : (
              t(LABEL_KEY[mode])
            )}
          </button>
        );
      })}
    </div>
  );
}
