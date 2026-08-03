'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { GameMode } from '@/types/tarkov';
import { hydrateLocalState, setGameMode as setGameModeInStore } from '@/lib/local-state/store';
import { useLocalState } from '@/lib/local-state/use-local-state';

type GameModeContextValue = {
  gameMode: GameMode;
  setGameMode: (mode: GameMode) => void;
};

const GameModeContext = createContext<GameModeContextValue | null>(null);

/**
 * Site-wide PvP/PvE selection, picked once in the Header and read by every
 * mode-aware page (items, tasks, maps, home dashboard) instead of each page
 * owning its own local toggle. Every page still fetches **both** modes' data
 * server-side at build/ISR time (see CLAUDE.md > "Global PvP/PvE mode"), so
 * switching here is a pure client-side re-render, never a refetch.
 *
 * As of Phase 2, this is a thin adapter over `@/lib/local-state` rather than
 * owning `localStorage` directly — `useGameMode()`'s signature and every one
 * of its ~11 call sites are unchanged, only the persistence underneath moved
 * to the shared versioned store (see
 * docs/architecture/tarkovdex-local-state.md). `hydrateLocalState()` is
 * idempotent, so calling it here (the one place `GameModeProvider` mounts,
 * at the app root) is the single hydration trigger for the whole store, not
 * just for game mode.
 */
export function GameModeProvider({ children }: { children: ReactNode }) {
  const state = useLocalState();

  useEffect(() => {
    hydrateLocalState();
  }, []);

  const value: GameModeContextValue = {
    gameMode: state.preferences.gameMode,
    setGameMode: setGameModeInStore,
  };

  return <GameModeContext.Provider value={value}>{children}</GameModeContext.Provider>;
}

export function useGameMode(): GameModeContextValue {
  const ctx = useContext(GameModeContext);
  if (!ctx) {
    throw new Error('useGameMode must be used within a GameModeProvider');
  }
  return ctx;
}
