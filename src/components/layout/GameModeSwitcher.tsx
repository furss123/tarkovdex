'use client';

import { useTranslations } from 'next-intl';
import { useGameMode } from '@/contexts/GameModeContext';
import type { GameMode } from '@/types/tarkov';

const MODES: GameMode[] = ['regular', 'pve'];

/**
 * Site-wide PvP/PvE selector, mirroring LocaleSwitcher's segmented-control
 * style exactly (same border/padding/active-state classes) so it reads as
 * a sibling control, not a new pattern. Lives in the Header — every mode-
 * aware page reads the selection via `useGameMode()` instead of owning its
 * own toggle. See CLAUDE.md > "Global PvP/PvE mode".
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
      {MODES.map((mode) => {
        const isActive = mode === gameMode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => setGameMode(mode)}
            aria-pressed={isActive}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-1.5 py-1 text-[15px] font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              isActive ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {mode === 'regular' ? t('pvpShort') : t('pveShort')}
          </button>
        );
      })}
    </div>
  );
}
