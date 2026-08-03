import {
  MAX_IMPORT_BYTES,
  SCHEMA_VERSION,
  V4_SCHEMA_VERSION,
  V1_SCHEMA_VERSION,
  V2_SCHEMA_VERSION,
  V3_SCHEMA_VERSION,
  type LocalState,
  type LocalStateExport,
} from './schema';
import {
  isValidLocalState,
  isValidLocalStateV1,
  isValidLocalStateV2,
  isValidLocalStateV3,
  isValidLocalStateV4,
} from './validate';
import { upgradeV1ToV5, upgradeV2ToV5, upgradeV3ToV5, upgradeV4ToV5 } from './migrate';

/**
 * Pure export/import logic — no `window`, no file I/O.
 */

export function exportLocalState(state: LocalState, now: string): LocalStateExport {
  return { schemaVersion: SCHEMA_VERSION, exportedAt: now, state };
}

export function serializeExport(exported: LocalStateExport): string {
  return JSON.stringify(exported, null, 2);
}

export function exportFilename(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `tarkovdex-user-data-${y}-${m}-${d}.json`;
}

export type ImportErrorCode =
  | 'too-large'
  | 'invalid-json'
  | 'invalid-shape'
  | 'unsupported-version'
  | 'invalid-state';

export type ImportValidation =
  | { ok: true; state: LocalState; exportedAt: string }
  | { ok: false; code: ImportErrorCode };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Accepts V1 through V5 export envelopes. Older files are upgraded before
 * return. `exportLocalState()` only ever produces V5.
 */
export function validateImport(raw: string): ImportValidation {
  if (raw.length > MAX_IMPORT_BYTES) return { ok: false, code: 'too-large' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'invalid-json' };
  }

  if (
    !isPlainObject(parsed) ||
    Object.keys(parsed).length !== 3 ||
    typeof parsed.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(parsed.exportedAt))
  ) {
    return { ok: false, code: 'invalid-shape' };
  }

  if (parsed.schemaVersion === V1_SCHEMA_VERSION) {
    if (!isValidLocalStateV1(parsed.state)) return { ok: false, code: 'invalid-state' };
    return { ok: true, state: upgradeV1ToV5(parsed.state), exportedAt: parsed.exportedAt };
  }

  if (parsed.schemaVersion === V2_SCHEMA_VERSION) {
    if (!isValidLocalStateV2(parsed.state)) return { ok: false, code: 'invalid-state' };
    return { ok: true, state: upgradeV2ToV5(parsed.state), exportedAt: parsed.exportedAt };
  }

  if (parsed.schemaVersion === V3_SCHEMA_VERSION) {
    if (!isValidLocalStateV3(parsed.state)) return { ok: false, code: 'invalid-state' };
    return { ok: true, state: upgradeV3ToV5(parsed.state), exportedAt: parsed.exportedAt };
  }

  if (parsed.schemaVersion === V4_SCHEMA_VERSION) {
    if (!isValidLocalStateV4(parsed.state)) return { ok: false, code: 'invalid-state' };
    return { ok: true, state: upgradeV4ToV5(parsed.state), exportedAt: parsed.exportedAt };
  }

  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, code: 'unsupported-version' };
  }

  if (!isValidLocalState(parsed.state)) {
    return { ok: false, code: 'invalid-state' };
  }

  return { ok: true, state: parsed.state, exportedAt: parsed.exportedAt };
}
