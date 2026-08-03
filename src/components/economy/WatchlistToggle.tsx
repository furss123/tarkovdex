'use client';

import type { MouseEvent } from 'react';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useGameMode } from '@/contexts/GameModeContext';
import {
  addToWatchlist,
  isItemWatched,
  removeFromWatchlist,
  useLocalState,
} from '@/lib/local-state';
import type { WatchPriceType } from '@/lib/watchlist';

export function WatchlistToggle({
  itemId,
  priceType = 'flea-net',
  baselinePrice,
  baselineUpdatedAt,
  compact = false,
}: {
  itemId: string;
  priceType?: WatchPriceType;
  baselinePrice?: number | null;
  baselineUpdatedAt?: string | null;
  compact?: boolean;
}) {
  const t = useTranslations('watchlist');
  const { gameMode } = useGameMode();
  // Subscribe so the star flips when the store changes (including other tabs).
  useLocalState();
  const watched = isItemWatched(gameMode, itemId, priceType);

  function onToggle(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (watched) {
      removeFromWatchlist(gameMode, itemId, priceType);
      return;
    }
    const entry: {
      itemId: string;
      priceType: WatchPriceType;
      addedAt: string;
      baselinePrice?: number;
      baselineUpdatedAt?: string;
    } = {
      itemId,
      priceType,
      addedAt: new Date().toISOString(),
    };
    if (baselinePrice != null && Number.isFinite(baselinePrice) && baselinePrice >= 0) {
      entry.baselinePrice = baselinePrice;
    }
    if (baselineUpdatedAt) entry.baselineUpdatedAt = baselineUpdatedAt;
    addToWatchlist(gameMode, entry);
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={watched}
      aria-label={watched ? t('remove') : t('add')}
      title={watched ? t('remove') : t('add')}
      className={`inline-flex size-touch shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
        watched
          ? 'border-accent/50 bg-accent/10 text-accent'
          : 'border-border bg-surface text-muted hover:border-accent/40 hover:text-accent'
      }`}
    >
      <Star
        className={compact ? 'size-[16px]' : 'size-[18px]'}
        fill={watched ? 'currentColor' : 'none'}
        aria-hidden="true"
      />
    </button>
  );
}
