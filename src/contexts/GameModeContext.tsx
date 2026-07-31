'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { GameMode } from '@/types/tarkov';

const STORAGE_KEY = 'tarkovdex:gameMode';

type GameModeContextValue = {
  gameMode: GameMode;
  setGameMode: (mode: GameMode) => void;
};

const GameModeContext = createContext<GameModeContextValue | null>(null);

/**
 * Site-wide PvP/PvE selection, picked once in the Header and read by every
 * mode-aware page (items, tasks, maps, home dashboard) instead of each page
 * owning its own local toggle. Every page still fetches **both** modes'
 * data server-side at build/ISR time (see CLAUDE.md > "Global PvP/PvE mode"),
 * so switching here is a pure client-side re-render, never a refetch.
 *
 * Persisted to localStorage so the choice survives navigation and reloads —
 * read lazily in an effect (not in useState's initializer) to avoid an SSR/
 * client markup mismatch, since the server has no localStorage to read.
 */
export function GameModeProvider({ children }: { children: ReactNode }) {
  const [gameMode, setGameModeState] = useState<GameMode>('regular');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'regular' || stored === 'pve') {
      setGameModeState(stored);
    }
  }, []);

  function setGameMode(mode: GameMode) {
    setGameModeState(mode);
    window.localStorage.setItem(STORAGE_KEY, mode);
  }

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
