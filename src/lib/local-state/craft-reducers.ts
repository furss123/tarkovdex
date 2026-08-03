import type { GameMode } from '@/types/tarkov';
import type { CraftPreferences } from '@/lib/personalized-craft';
import { isValidCraftPreferences } from './validate';
import type { LocalState } from './schema';

/** Updates one mode's craft preferences without touching the shared inventory. */
export function updateCraftPreferences(
  state: LocalState,
  mode: GameMode,
  patch: Partial<CraftPreferences>,
): LocalState {
  const current = state.modeData[mode].crafting.preferences;
  const candidate = {
    ...current,
    ...patch,
    ...(patch.stationLevels ? { stationLevels: { ...patch.stationLevels } } : {}),
  };
  if (!isValidCraftPreferences(candidate)) return state;
  if (JSON.stringify(candidate) === JSON.stringify(current)) return state;
  return {
    ...state,
    modeData: {
      ...state.modeData,
      [mode]: { ...state.modeData[mode], crafting: { preferences: candidate } },
    },
  };
}
