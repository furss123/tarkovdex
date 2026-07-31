'use client';

import { useTranslations } from 'next-intl';
import { useGameMode } from '@/contexts/GameModeContext';

/** Small badge showing the site-wide PvP/PvE selection, for page headers.
 * First render is always PvP (SSR has no localStorage) and self-corrects
 * after mount — the same pattern every mode-aware widget uses. */
export function GameModeBadge() {
  const t = useTranslations('common');
  const { gameMode } = useGameMode();
  return (
    <span className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[12px] font-medium leading-none text-accent">
      {gameMode === 'pve' ? t('pveShort') : t('pvpShort')}
    </span>
  );
}
