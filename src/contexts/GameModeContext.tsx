'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { GameMode } from '@/types/tarkov';

type GameModeContextValue = {
  gameMode: GameMode;
  setGameMode: (mode: GameMode) => void;
};

const GameModeContext = createContext<GameModeContextValue | null>(null);

const STORAGE_KEY = 'tarkovdex:gameMode';

function isGameMode(value: unknown): value is GameMode {
  return value === 'regular' || value === 'pve';
}

/**
 * Site-wide PvP/PvE selection, picked once in the Header and read by the
 * dashboard's craft and boss boards. Both modes' data is already resident on
 * the page (server-rendered, then refreshed together by the live poll), so
 * switching here is a pure client-side re-render, never a refetch.
 *
 * The stored value is read in an effect rather than a `useState` initializer:
 * the server has no `localStorage`, so the first render must be `'regular'` on
 * both sides or hydration mismatches. The same first-render-then-correct
 * pattern the raid clock uses for `Date.now()`.
 *
 * Phase 2's shared versioned local-state store was removed with the tools that
 * needed it (watchlists, quest tracking, budget builds). One preference does
 * not need a migration framework, so this owns its key directly again.
 */
export function GameModeProvider({ children }: { children: ReactNode }) {
  const [gameMode, setLocalGameMode] = useState<GameMode>('regular');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isGameMode(stored)) setLocalGameMode(stored);
    } catch {
      // Private mode / storage disabled — the in-memory default still works.
    }
  }, []);

  const setGameMode = useCallback((mode: GameMode) => {
    setLocalGameMode(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Selection still applies for this session; it just won't persist.
    }
  }, []);

  return (
    <GameModeContext.Provider value={{ gameMode, setGameMode }}>
      {children}
    </GameModeContext.Provider>
  );
}

export function useGameMode(): GameModeContextValue {
  const ctx = useContext(GameModeContext);
  if (!ctx) {
    throw new Error('useGameMode must be used within a GameModeProvider');
  }
  return ctx;
}
