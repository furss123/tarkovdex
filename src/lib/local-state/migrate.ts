import type { GameMode } from '@/types/tarkov';
import {
  MAX_STORED_BYTES,
  SCHEMA_VERSION,
  V4_SCHEMA_VERSION,
  V1_SCHEMA_VERSION,
  V2_SCHEMA_VERSION,
  V3_SCHEMA_VERSION,
  createDefaultModeState,
  createDefaultState,
  type LocalState,
  type LocalStateV1,
  type LocalStateV2,
  type LocalStateV3,
  type LocalStateV4,
  type ModeState,
  type ModeStateV2,
  type ModeStateV4,
} from './schema';
import {
  isValidGameMode,
  recoverLocalState,
  recoverLocalStateV1,
  recoverLocalStateV2,
  recoverLocalStateV3,
  recoverLocalStateV4,
} from './validate';

/**
 * Pure orchestration for "raw strings from two localStorage keys in, a usable
 * `LocalState` out". No `window` access here — `storage.ts` supplies the raw
 * strings, this module only reasons about them.
 */

export interface LoadOutcome {
  state: LocalState;
  refusedNewerVersion: boolean;
  adoptedLegacyGameMode: boolean;
  wasCorrupt: boolean;
  upgradedFromV1: boolean;
  upgradedFromV2: boolean;
  upgradedFromV3: boolean;
  upgradedFromV4: boolean;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withLegacyGameMode(state: LocalState, legacyGameMode: GameMode | null): LocalState {
  if (legacyGameMode === null) return state;
  return { ...state, preferences: { ...state.preferences, gameMode: legacyGameMode } };
}

function modeV2ToV4(mode: ModeStateV2): ModeStateV4 {
  return { quests: mode.quests, raidPlans: mode.raidPlans, watchlist: [] };
}

/**
 * V1 -> V2: `gameMode` and both metadata timestamps survive untouched —
 * `updatedAt` is **not** bumped. `modeData` is empty for both modes.
 */
export function upgradeV1ToV2(v1: LocalStateV1): LocalStateV2 {
  return {
    schemaVersion: V2_SCHEMA_VERSION,
    preferences: { ...v1.preferences },
    modeData: {
      regular: { quests: createDefaultModeState().quests, raidPlans: [] },
      pve: { quests: createDefaultModeState().quests, raidPlans: [] },
    },
    metadata: { ...v1.metadata },
  };
}

/**
 * V2 -> V3: adds empty `recentSearches`. Does not bump `updatedAt`.
 */
export function upgradeV2ToV3(v2: LocalStateV2): LocalStateV3 {
  return {
    schemaVersion: V3_SCHEMA_VERSION,
    preferences: { ...v2.preferences },
    modeData: {
      regular: v2.modeData.regular,
      pve: v2.modeData.pve,
    },
    recentSearches: [],
    metadata: { ...v2.metadata },
  };
}

/**
 * V3 -> V4: adds empty per-mode watchlists and `beginnerMode: false`.
 * Does not bump `updatedAt`.
 */
export function upgradeV3ToV4(v3: LocalStateV3): LocalStateV4 {
  return {
    schemaVersion: V4_SCHEMA_VERSION,
    preferences: { gameMode: v3.preferences.gameMode, beginnerMode: false },
    modeData: {
      regular: modeV2ToV4(v3.modeData.regular),
      pve: modeV2ToV4(v3.modeData.pve),
    },
    recentSearches: v3.recentSearches,
    metadata: { ...v3.metadata },
  };
}

export function upgradeV2ToV4(v2: LocalStateV2): LocalStateV4 {
  return upgradeV3ToV4(upgradeV2ToV3(v2));
}

export function upgradeV1ToV4(v1: LocalStateV1): LocalStateV4 {
  return upgradeV2ToV4(upgradeV1ToV2(v1));
}

/** @deprecated Prefer upgradeV1ToV4 — kept for older Phase 4 tests. */
export function upgradeV1ToV3(v1: LocalStateV1): LocalStateV3 {
  return upgradeV2ToV3(upgradeV1ToV2(v1));
}

/** V4 -> V5: add per-mode craft preferences and budget presets. */
export function upgradeV4ToV5(v4: LocalStateV4): LocalState {
  const upgradeMode = (mode: ModeStateV4): ModeState => ({
    ...mode,
    crafting: { preferences: createDefaultModeState().crafting.preferences },
    budgetPresets: [],
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    preferences: { ...v4.preferences },
    modeData: {
      regular: upgradeMode(v4.modeData.regular),
      pve: upgradeMode(v4.modeData.pve),
    },
    recentSearches: v4.recentSearches,
    metadata: { ...v4.metadata },
  };
}

export function upgradeV3ToV5(v3: LocalStateV3): LocalState {
  return upgradeV4ToV5(upgradeV3ToV4(v3));
}

export function upgradeV2ToV5(v2: LocalStateV2): LocalState {
  return upgradeV3ToV5(upgradeV2ToV3(v2));
}

export function upgradeV1ToV5(v1: LocalStateV1): LocalState {
  return upgradeV2ToV5(upgradeV1ToV2(v1));
}

export function loadLocalState(input: {
  rawMainJson: string | null;
  legacyGameMode: GameMode | null;
  now: string;
}): LoadOutcome {
  const { rawMainJson, legacyGameMode, now } = input;

  if (rawMainJson === null) {
    return {
      state: withLegacyGameMode(createDefaultState(now), legacyGameMode),
      refusedNewerVersion: false,
      adoptedLegacyGameMode: legacyGameMode !== null,
      wasCorrupt: false,
      upgradedFromV1: false,
      upgradedFromV2: false,
      upgradedFromV3: false,
      upgradedFromV4: false,
    };
  }

  if (rawMainJson.length > MAX_STORED_BYTES) {
    return {
      state: withLegacyGameMode(createDefaultState(now), legacyGameMode),
      refusedNewerVersion: false,
      adoptedLegacyGameMode: legacyGameMode !== null,
      wasCorrupt: true,
      upgradedFromV1: false,
      upgradedFromV2: false,
      upgradedFromV3: false,
      upgradedFromV4: false,
    };
  }

  const parsed = parseJson(rawMainJson);
  if (!isPlainObject(parsed)) {
    return {
      state: withLegacyGameMode(createDefaultState(now), legacyGameMode),
      refusedNewerVersion: false,
      adoptedLegacyGameMode: legacyGameMode !== null,
      wasCorrupt: true,
      upgradedFromV1: false,
      upgradedFromV2: false,
      upgradedFromV3: false,
      upgradedFromV4: false,
    };
  }

  const version = parsed.schemaVersion;

  if (typeof version === 'number' && Number.isInteger(version) && version > SCHEMA_VERSION) {
    return {
      state: createDefaultState(now),
      refusedNewerVersion: true,
      adoptedLegacyGameMode: false,
      wasCorrupt: false,
      upgradedFromV1: false,
      upgradedFromV2: false,
      upgradedFromV3: false,
      upgradedFromV4: false,
    };
  }

  if (version === V1_SCHEMA_VERSION) {
    const { state: v1State } = recoverLocalStateV1(parsed, now);
    return {
      state: upgradeV1ToV5(v1State),
      refusedNewerVersion: false,
      adoptedLegacyGameMode: false,
      wasCorrupt: false,
      upgradedFromV1: true,
      upgradedFromV2: false,
      upgradedFromV3: false,
      upgradedFromV4: false,
    };
  }

  if (version === V2_SCHEMA_VERSION) {
    const { state: v2State } = recoverLocalStateV2(parsed, now);
    return {
      state: upgradeV2ToV5(v2State),
      refusedNewerVersion: false,
      adoptedLegacyGameMode: false,
      wasCorrupt: false,
      upgradedFromV1: false,
      upgradedFromV2: true,
      upgradedFromV3: false,
      upgradedFromV4: false,
    };
  }

  if (version === V3_SCHEMA_VERSION) {
    const { state: v3State } = recoverLocalStateV3(parsed, now);
    return {
      state: upgradeV3ToV5(v3State),
      refusedNewerVersion: false,
      adoptedLegacyGameMode: false,
      wasCorrupt: false,
      upgradedFromV1: false,
      upgradedFromV2: false,
      upgradedFromV3: true,
      upgradedFromV4: false,
    };
  }

  if (version === V4_SCHEMA_VERSION) {
    const { state: v4State } = recoverLocalStateV4(parsed, now);
    return {
      state: upgradeV4ToV5(v4State),
      refusedNewerVersion: false,
      adoptedLegacyGameMode: false,
      wasCorrupt: false,
      upgradedFromV1: false,
      upgradedFromV2: false,
      upgradedFromV3: false,
      upgradedFromV4: true,
    };
  }

  const { state } = recoverLocalState(parsed, now);
  return {
    state,
    refusedNewerVersion: false,
    adoptedLegacyGameMode: false,
    wasCorrupt: false,
    upgradedFromV1: false,
    upgradedFromV2: false,
    upgradedFromV3: false,
    upgradedFromV4: false,
  };
}

export function narrowLegacyGameMode(raw: string | null): GameMode | null {
  return isValidGameMode(raw) ? raw : null;
}
