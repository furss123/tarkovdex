import type { GameMode } from '@/types/tarkov';
import { isSafeWatchPrice, isWatchPriceType, type WatchPriceType } from '@/lib/watchlist';
import {
  MAX_WATCHLIST_PER_MODE,
  type LocalState,
  type ModeState,
  type WatchlistEntry,
} from './schema';

/**
 * Pure watchlist state transitions — `store.ts` is the only caller.
 * Same identity-preserving no-op contract as `quest-reducers.ts`.
 */

function modeStateOf(state: LocalState, mode: GameMode): ModeState {
  return state.modeData[mode];
}

function withModeState(state: LocalState, mode: GameMode, next: ModeState): LocalState {
  if (next === modeStateOf(state, mode)) return state;
  return { ...state, modeData: { ...state.modeData, [mode]: next } };
}

function withUpdatedAt(state: LocalState, now: string): LocalState {
  if (state.metadata.updatedAt === now) return state;
  return { ...state, metadata: { ...state.metadata, updatedAt: now } };
}

function commitModeChange(
  state: LocalState,
  mode: GameMode,
  nextMode: ModeState,
  now: string,
): LocalState {
  const withMode = withModeState(state, mode, nextMode);
  if (withMode === state) return state;
  return withUpdatedAt(withMode, now);
}

function watchKey(itemId: string, priceType: WatchPriceType): string {
  return `${itemId}\0${priceType}`;
}

export interface WatchlistEntryInput {
  itemId: string;
  priceType: WatchPriceType;
  baselinePrice?: number;
  baselineUpdatedAt?: string;
  addedAt: string;
  lastSeenPrice?: number;
  lastSeenUpdatedAt?: string;
  lastViewedAt?: string;
}

function normalizeEntry(input: WatchlistEntryInput): WatchlistEntry | null {
  const itemId = input.itemId.trim();
  if (!itemId || !isWatchPriceType(input.priceType)) return null;
  if (
    typeof input.addedAt !== 'string' ||
    input.addedAt.length === 0 ||
    !Number.isFinite(Date.parse(input.addedAt))
  ) {
    return null;
  }
  if (input.baselinePrice !== undefined && !isSafeWatchPrice(input.baselinePrice)) return null;
  if (
    input.baselineUpdatedAt !== undefined &&
    (typeof input.baselineUpdatedAt !== 'string' ||
      !Number.isFinite(Date.parse(input.baselineUpdatedAt)))
  ) {
    return null;
  }
  if (input.lastSeenPrice !== undefined && !isSafeWatchPrice(input.lastSeenPrice)) return null;
  if (
    input.lastSeenUpdatedAt !== undefined &&
    (typeof input.lastSeenUpdatedAt !== 'string' ||
      !Number.isFinite(Date.parse(input.lastSeenUpdatedAt)))
  ) {
    return null;
  }
  if (
    input.lastViewedAt !== undefined &&
    (typeof input.lastViewedAt !== 'string' || !Number.isFinite(Date.parse(input.lastViewedAt)))
  ) {
    return null;
  }

  const entry: WatchlistEntry = {
    itemId,
    priceType: input.priceType,
    addedAt: input.addedAt,
  };
  if (input.baselinePrice !== undefined) entry.baselinePrice = input.baselinePrice;
  if (input.baselineUpdatedAt !== undefined) entry.baselineUpdatedAt = input.baselineUpdatedAt;
  if (input.lastSeenPrice !== undefined) entry.lastSeenPrice = input.lastSeenPrice;
  if (input.lastSeenUpdatedAt !== undefined) entry.lastSeenUpdatedAt = input.lastSeenUpdatedAt;
  if (input.lastViewedAt !== undefined) entry.lastViewedAt = input.lastViewedAt;
  return entry;
}

export function addWatchlistEntry(
  state: LocalState,
  mode: GameMode,
  entryInput: WatchlistEntryInput,
  now: string,
): LocalState {
  const entry = normalizeEntry(entryInput);
  if (!entry) return state;

  const modeState = modeStateOf(state, mode);
  if (modeState.watchlist.length >= MAX_WATCHLIST_PER_MODE) return state;

  const key = watchKey(entry.itemId, entry.priceType);
  if (modeState.watchlist.some((existing) => watchKey(existing.itemId, existing.priceType) === key)) {
    return state;
  }

  return commitModeChange(
    state,
    mode,
    { ...modeState, watchlist: [...modeState.watchlist, entry] },
    now,
  );
}

export function removeWatchlistEntry(
  state: LocalState,
  mode: GameMode,
  itemId: string,
  priceType: WatchPriceType | undefined,
  now: string,
): LocalState {
  const id = itemId.trim();
  if (!id) return state;

  const modeState = modeStateOf(state, mode);
  const watchlist =
    priceType === undefined
      ? modeState.watchlist.filter((entry) => entry.itemId !== id)
      : modeState.watchlist.filter(
          (entry) => !(entry.itemId === id && entry.priceType === priceType),
        );

  if (watchlist.length === modeState.watchlist.length) return state;
  return commitModeChange(state, mode, { ...modeState, watchlist }, now);
}

export function resetWatchlistBaseline(
  state: LocalState,
  mode: GameMode,
  itemId: string,
  priceType: WatchPriceType,
  currentPrice: number,
  currentUpdatedAt: string | undefined,
  now: string,
): LocalState {
  const id = itemId.trim();
  if (!id || !isWatchPriceType(priceType) || !isSafeWatchPrice(currentPrice)) return state;
  if (
    currentUpdatedAt !== undefined &&
    (typeof currentUpdatedAt !== 'string' || !Number.isFinite(Date.parse(currentUpdatedAt)))
  ) {
    return state;
  }

  const modeState = modeStateOf(state, mode);
  const index = modeState.watchlist.findIndex(
    (entry) => entry.itemId === id && entry.priceType === priceType,
  );
  if (index === -1) return state;

  const current = modeState.watchlist[index];
  if (
    current.baselinePrice === currentPrice &&
    current.baselineUpdatedAt === currentUpdatedAt &&
    current.lastSeenPrice === currentPrice &&
    current.lastSeenUpdatedAt === currentUpdatedAt
  ) {
    return state;
  }

  const updated: WatchlistEntry = {
    ...current,
    baselinePrice: currentPrice,
    lastSeenPrice: currentPrice,
  };
  if (currentUpdatedAt !== undefined) {
    updated.baselineUpdatedAt = currentUpdatedAt;
    updated.lastSeenUpdatedAt = currentUpdatedAt;
  } else {
    delete updated.baselineUpdatedAt;
    delete updated.lastSeenUpdatedAt;
  }

  const watchlist = [...modeState.watchlist];
  watchlist[index] = updated;
  return commitModeChange(state, mode, { ...modeState, watchlist }, now);
}

export interface WatchlistObservationUpdate {
  itemId: string;
  priceType: WatchPriceType;
  lastSeenPrice?: number;
  lastSeenUpdatedAt?: string;
  lastViewedAt?: string;
}

export function updateWatchlistObservation(
  state: LocalState,
  mode: GameMode,
  updates: WatchlistObservationUpdate[],
  now: string,
): LocalState {
  if (updates.length === 0) return state;

  const modeState = modeStateOf(state, mode);
  let changed = false;
  const watchlist = modeState.watchlist.map((entry) => {
    let next = entry;
    for (const update of updates) {
      const id = update.itemId.trim();
      if (!id || next.itemId !== id || next.priceType !== update.priceType) continue;

      const patch: Partial<WatchlistEntry> = {};
      if (update.lastSeenPrice !== undefined) {
        if (!isSafeWatchPrice(update.lastSeenPrice)) continue;
        if (next.lastSeenPrice !== update.lastSeenPrice) patch.lastSeenPrice = update.lastSeenPrice;
      }
      if (update.lastSeenUpdatedAt !== undefined) {
        if (
          typeof update.lastSeenUpdatedAt !== 'string' ||
          !Number.isFinite(Date.parse(update.lastSeenUpdatedAt))
        ) {
          continue;
        }
        if (next.lastSeenUpdatedAt !== update.lastSeenUpdatedAt) {
          patch.lastSeenUpdatedAt = update.lastSeenUpdatedAt;
        }
      }
      if (update.lastViewedAt !== undefined) {
        if (
          typeof update.lastViewedAt !== 'string' ||
          !Number.isFinite(Date.parse(update.lastViewedAt))
        ) {
          continue;
        }
        if (next.lastViewedAt !== update.lastViewedAt) patch.lastViewedAt = update.lastViewedAt;
      }

      if (Object.keys(patch).length === 0) continue;
      next = { ...next, ...patch };
      changed = true;
    }
    return next;
  });

  if (!changed) return state;
  return commitModeChange(state, mode, { ...modeState, watchlist }, now);
}

export function clearWatchlist(state: LocalState, mode: GameMode, now: string): LocalState {
  const modeState = modeStateOf(state, mode);
  if (modeState.watchlist.length === 0) return state;
  return commitModeChange(state, mode, { ...modeState, watchlist: [] }, now);
}
