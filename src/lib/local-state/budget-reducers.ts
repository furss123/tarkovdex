import type { GameMode } from '@/types/tarkov';
import { isWatchPriceType } from '@/lib/watchlist';
import {
  MAX_BUDGET_LINES_PER_PRESET,
  MAX_BUDGET_PRESETS_PER_MODE,
  MAX_ITEM_QUANTITY,
  MAX_NOTES_LENGTH,
  MAX_PLAN_NAME_LENGTH,
  type LocalState,
} from './schema';
import type { BudgetLine, BudgetPreset } from '@/lib/loadout-budget';

export interface BudgetPresetInput {
  name: string;
  budget?: number;
  notes?: string;
}

export interface BudgetLineInput {
  itemId: string;
  category: string;
  quantity?: number;
  priceType: BudgetLine['priceType'];
}

function id(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function text(value: string, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validId(value: string): boolean {
  return value.length > 0 && value.length <= 200;
}

function quantity(value: number): number | null {
  return Number.isInteger(value) && value > 0 && value <= MAX_ITEM_QUANTITY ? value : null;
}

function budget(value: number | undefined): number | undefined | null {
  return value === undefined || (Number.isFinite(value) && value >= 0) ? value : null;
}

function withMode(state: LocalState, mode: GameMode, presets: BudgetPreset[]): LocalState {
  if (presets === state.modeData[mode].budgetPresets) return state;
  return {
    ...state,
    modeData: { ...state.modeData, [mode]: { ...state.modeData[mode], budgetPresets: presets } },
  };
}

export function createBudgetPreset(
  state: LocalState,
  mode: GameMode,
  input: BudgetPresetInput,
  now: string,
): { state: LocalState; preset: BudgetPreset | null } {
  const presets = state.modeData[mode].budgetPresets;
  const name = text(input?.name, MAX_PLAN_NAME_LENGTH);
  const limit = budget(input?.budget);
  if (!name || limit === null || presets.length >= MAX_BUDGET_PRESETS_PER_MODE) return { state, preset: null };
  const preset: BudgetPreset = {
    id: id(),
    name,
    ...(limit === undefined ? {} : { budget: limit }),
    lines: [],
    notes: text(input?.notes ?? '', MAX_NOTES_LENGTH),
    createdAt: now,
    updatedAt: now,
  };
  return { state: withMode(state, mode, [preset, ...presets]), preset };
}

export function updateBudgetPreset(
  state: LocalState,
  mode: GameMode,
  presetId: string,
  updater: (preset: BudgetPreset) => Partial<Omit<BudgetPreset, 'id' | 'createdAt' | 'lines'>>,
  now: string,
): LocalState {
  const presets = state.modeData[mode].budgetPresets;
  const index = presets.findIndex((preset) => preset.id === presetId);
  if (index < 0) return state;
  const current = presets[index];
  const patch = updater(current);
  if (!patch || typeof patch !== 'object') return state;
  const name = patch.name === undefined ? current.name : text(patch.name, MAX_PLAN_NAME_LENGTH);
  const notes = patch.notes === undefined ? current.notes : text(patch.notes, MAX_NOTES_LENGTH);
  const limit = patch.budget === undefined ? current.budget : budget(patch.budget);
  if (!name || limit === null) return state;
  const withoutBudget = { ...current };
  delete withoutBudget.budget;
  const candidate: BudgetPreset = {
    ...withoutBudget,
    name,
    notes,
    ...(limit === undefined ? {} : { budget: limit }),
  };
  if (candidate.name === current.name && candidate.notes === current.notes && candidate.budget === current.budget) {
    return state;
  }
  const next = [...presets];
  next[index] = { ...candidate, updatedAt: now };
  return withMode(state, mode, next);
}

export function deleteBudgetPreset(state: LocalState, mode: GameMode, presetId: string): LocalState {
  const presets = state.modeData[mode].budgetPresets;
  const next = presets.filter((preset) => preset.id !== presetId);
  return next.length === presets.length ? state : withMode(state, mode, next);
}

export function duplicateBudgetPreset(
  state: LocalState,
  mode: GameMode,
  presetId: string,
  suffix: string,
  now: string,
): { state: LocalState; preset: BudgetPreset | null } {
  const presets = state.modeData[mode].budgetPresets;
  const source = presets.find((preset) => preset.id === presetId);
  if (!source || presets.length >= MAX_BUDGET_PRESETS_PER_MODE) return { state, preset: null };
  const preset: BudgetPreset = {
    ...source,
    id: id(),
    name: text(`${source.name} ${suffix}`, MAX_PLAN_NAME_LENGTH) || source.name,
    lines: source.lines.map((line) => ({ ...line, id: id() })),
    createdAt: now,
    updatedAt: now,
  };
  return { state: withMode(state, mode, [preset, ...presets]), preset };
}

export function addBudgetLine(
  state: LocalState,
  mode: GameMode,
  presetId: string,
  input: BudgetLineInput,
  now: string,
): LocalState {
  const itemId = typeof input?.itemId === 'string' ? input.itemId.trim() : '';
  const category = typeof input?.category === 'string' ? input.category.trim().slice(0, 100) : '';
  const amount = quantity(input?.quantity ?? 1);
  if (!validId(itemId) || !category || amount === null || !isWatchPriceType(input?.priceType)) return state;
  return changeLines(state, mode, presetId, now, (lines) => {
    if (lines.length >= MAX_BUDGET_LINES_PER_PRESET) return lines;
    return [...lines, { id: id(), itemId, category, quantity: amount, priceType: input.priceType }];
  });
}

export function updateBudgetLine(
  state: LocalState,
  mode: GameMode,
  presetId: string,
  lineId: string,
  patch: Partial<Omit<BudgetLine, 'id'>>,
  now: string,
): LocalState {
  return changeLines(state, mode, presetId, now, (lines) => {
    const line = lines.find((entry) => entry.id === lineId);
    if (!line) return lines;
    if (!patch || typeof patch !== 'object') return lines;
    const itemId = patch.itemId === undefined
      ? line.itemId
      : typeof patch.itemId === 'string'
        ? patch.itemId.trim()
        : '';
    const category = patch.category === undefined
      ? line.category
      : typeof patch.category === 'string'
        ? patch.category.trim().slice(0, 100)
        : '';
    const amount = patch.quantity === undefined ? line.quantity : quantity(patch.quantity);
    const priceType = patch.priceType === undefined ? line.priceType : patch.priceType;
    if (!validId(itemId) || !category || amount === null || !isWatchPriceType(priceType)) return lines;
    if (itemId === line.itemId && category === line.category && amount === line.quantity && priceType === line.priceType) {
      return lines;
    }
    return lines.map((entry) =>
      entry.id === lineId ? { ...entry, itemId, category, quantity: amount, priceType } : entry,
    );
  });
}

export function removeBudgetLine(
  state: LocalState,
  mode: GameMode,
  presetId: string,
  lineId: string,
  now: string,
): LocalState {
  return changeLines(state, mode, presetId, now, (lines) => lines.filter((line) => line.id !== lineId));
}

export function clearBudgetPresets(state: LocalState, mode: GameMode): LocalState {
  return state.modeData[mode].budgetPresets.length === 0 ? state : withMode(state, mode, []);
}

function changeLines(
  state: LocalState,
  mode: GameMode,
  presetId: string,
  now: string,
  change: (lines: BudgetLine[]) => BudgetLine[],
): LocalState {
  const presets = state.modeData[mode].budgetPresets;
  const index = presets.findIndex((preset) => preset.id === presetId);
  if (index < 0) return state;
  const current = presets[index];
  const lines = change(current.lines);
  if (lines === current.lines || (lines.length === current.lines.length && lines.every((line, i) => line === current.lines[i]))) {
    return state;
  }
  const next = [...presets];
  next[index] = { ...current, lines, updatedAt: now };
  return withMode(state, mode, next);
}
