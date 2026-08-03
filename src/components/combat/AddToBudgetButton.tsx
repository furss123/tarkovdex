'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useGameMode } from '@/contexts/GameModeContext';
import {
  addBudgetLine,
  createBudgetPreset,
  getBudgetPresets,
  useLocalState,
} from '@/lib/local-state';
import { categoryFromItemTypes } from '@/lib/loadout-budget';
import type { WatchPriceType } from '@/lib/watchlist';

type Props = {
  itemId: string;
  types?: string[];
  priceType?: WatchPriceType;
  className?: string;
};

/**
 * Adds an item to the active mode's newest budget preset, or creates one.
 * Stops event propagation so it can sit inside result/card links.
 */
export function AddToBudgetButton({
  itemId,
  types = [],
  priceType = 'flea-net',
  className,
}: Props) {
  const t = useTranslations('budgetBuilder');
  const { gameMode } = useGameMode();
  useLocalState();
  const [message, setMessage] = useState<string | null>(null);

  function onClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const presets = getBudgetPresets(gameMode);
    let presetId: string | undefined = presets[0]?.id;
    if (!presetId) {
      const { preset } = createBudgetPreset(gameMode, {
        name: t('newPreset'),
        budget: 100000,
      });
      presetId = preset?.id;
    }
    if (presetId == null) {
      setMessage(t('error'));
      return;
    }
    const targetPresetId = presetId;
    const outcome = addBudgetLine(gameMode, targetPresetId, {
      itemId,
      category: categoryFromItemTypes(types) ?? 'armor',
      quantity: 1,
      priceType,
    });
    setMessage(outcome.ok ? t('addToPreset') : t('error'));
  }

  return (
    <span className={className}>
      <button
        type="button"
        onClick={onClick}
        className="min-h-touch min-w-touch rounded-md border border-border px-2 text-xs text-muted hover:border-accent hover:text-accent"
        aria-label={t('addItem')}
      >
        {t('addItem')}
      </button>
      {message ? <span className="sr-only" aria-live="polite">{message}</span> : null}
    </span>
  );
}
