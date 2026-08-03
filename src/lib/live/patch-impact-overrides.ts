/**
 * Human override registry for PatchImpact (Phase 7).
 *
 * Keys are stable LiveEntry ids (`source:sourcePostId` or DB event ids), never
 * bare titles. Missing targets are ignored at read time — they must not crash
 * the app.
 */

export type PatchImpactArea =
  | 'economy'
  | 'quests'
  | 'items'
  | 'crafting'
  | 'ammo'
  | 'armor'
  | 'maps'
  | 'bosses'
  | 'traders'
  | 'events'
  | 'technical'
  | 'unknown';

export type GameModeScope = 'regular' | 'pve' | 'both' | 'unknown';

export type PatchImpactOverride = {
  entryId: string;
  shortSummary?: string;
  impactAreas?: PatchImpactArea[];
  gameModeScope?: GameModeScope;
  effectiveAt?: string;
  patchVersion?: string;
  reviewStatus: 'human-reviewed';
  notes?: string;
};

/** Committed operator overrides. Empty by default — populate by stable id. */
export const PATCH_IMPACT_OVERRIDES: PatchImpactOverride[] = [];

export function findPatchImpactOverride(
  entryId: string,
  overrides: PatchImpactOverride[] = PATCH_IMPACT_OVERRIDES,
): PatchImpactOverride | undefined {
  const matches = overrides.filter((item) => item.entryId === entryId);
  return matches[0];
}

export function detectDuplicateOverrideIds(
  overrides: PatchImpactOverride[] = PATCH_IMPACT_OVERRIDES,
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of overrides) {
    if (seen.has(item.entryId)) duplicates.add(item.entryId);
    seen.add(item.entryId);
  }
  return [...duplicates];
}

export function detectOrphanOverrides(
  entryIds: Iterable<string>,
  overrides: PatchImpactOverride[] = PATCH_IMPACT_OVERRIDES,
): string[] {
  const known = new Set(entryIds);
  return overrides.filter((item) => !known.has(item.entryId)).map((item) => item.entryId);
}

export function applyPatchImpactOverride<
  T extends {
    impactAreas: PatchImpactArea[];
    gameModeScope: GameModeScope;
    shortSummary?: string;
    effectiveAt?: string;
    patchVersion?: string;
    reviewStatus: 'unreviewed' | 'machine-classified' | 'human-reviewed';
    evidenceCodes: string[];
  },
>(base: T, override: PatchImpactOverride): T {
  return {
    ...base,
    impactAreas: override.impactAreas ?? base.impactAreas,
    gameModeScope: override.gameModeScope ?? base.gameModeScope,
    shortSummary: override.shortSummary ?? base.shortSummary,
    effectiveAt: override.effectiveAt ?? base.effectiveAt,
    patchVersion: override.patchVersion ?? base.patchVersion,
    reviewStatus: 'human-reviewed',
    evidenceCodes: [...base.evidenceCodes, `override:${override.entryId}`],
  };
}
