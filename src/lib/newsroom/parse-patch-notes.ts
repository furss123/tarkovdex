/**
 * Deterministic patch-note structuring from official plain text.
 * Preserves every meaningful bullet; does not invent impact analysis.
 */

export type PatchChangeType = 'new' | 'changed' | 'removed' | 'fixed' | 'other';
export type PatchImportance = 'critical' | 'high' | 'medium' | 'low';
export type PatchVerification =
  | 'official'
  | 'data_verified'
  | 'impact_analysis'
  | 'needs_verification';

export type PatchCategoryKey =
  | 'overview'
  | 'major'
  | 'seasonal'
  | 'character'
  | 'quests'
  | 'traders'
  | 'economy'
  | 'hideout'
  | 'weapons'
  | 'ammo'
  | 'maps'
  | 'ai'
  | 'combat'
  | 'interface'
  | 'graphics'
  | 'sound'
  | 'performance'
  | 'bugfixes'
  | 'arena'
  | 'other';

export interface PatchNoteItem {
  id: string;
  sourceReferenceId: string;
  category: PatchCategoryKey;
  title: string;
  changeType: PatchChangeType;
  importance: PatchImportance;
  officialContent: string;
  detailedExplanation?: string;
  playerImpact?: string;
  beforeValue?: string;
  afterValue?: string;
  affectedModes?: Array<'pvp' | 'pve' | 'seasonal' | 'arena'>;
  statuses: PatchVerification[];
}

export interface StructuredPatchNote {
  version: string | null;
  title: string;
  summary: string[];
  categories: Array<{ key: PatchCategoryKey; count: number }>;
  items: PatchNoteItem[];
  sourceItemCount: number;
  retainedItemCount: number;
}

const CATEGORY_RULES: Array<[PatchCategoryKey, RegExp]> = [
  ['bugfixes', /\bbug\s*fix|fixed|crash|desync|exploit/i],
  ['quests', /\bquest|task|objective/i],
  ['traders', /\btrader|prapor|therapist|mechanic|jaeger|ragman|skier|peacekeeper|fence|ref\b/i],
  ['economy', /\bflea|market|fee|tax|price|barter|currency|ruble/i],
  ['hideout', /\bhideout|craft|bitcoin|generator/i],
  ['weapons', /\bweapon|gun|recoil|ergonomics|magazine|attachment|mod\b/i],
  ['ammo', /\bammo|ammunition|cartridge|penetration|armor.?class/i],
  ['maps', /\bmap|customs|factory|woods|shoreline|reserve|interchange|lighthouse|streets|labs|ground zero/i],
  ['ai', /\bboss|ai\b|scav|pmc bot|cultist/i],
  ['combat', /\barmor|durability|damage|ballistic|healing|stamina/i],
  ['interface', /\bui\b|interface|inventory|menu|hud/i],
  ['graphics', /\bgraphic|visual|shader|texture|lighting/i],
  ['sound', /\bsound|audio|voice/i],
  ['performance', /\bperformance|optimization|fps|memory|stutter/i],
  ['arena', /\barena\b/i],
  ['seasonal', /\bseason|wipe|pve zone|seasonal/i],
  ['character', /\bcharacter|skill|level|prestige|pmc\b/i],
  ['major', /\bnew feature|added|introduc/i],
];

const HEADING_CATEGORY: Array<[RegExp, PatchCategoryKey]> = [
  [/bug\s*fix/i, 'bugfixes'],
  [/quest/i, 'quests'],
  [/trader/i, 'traders'],
  [/flea|econom/i, 'economy'],
  [/hideout/i, 'hideout'],
  [/weapon|firearm/i, 'weapons'],
  [/ammo|ammunition/i, 'ammo'],
  [/map|location/i, 'maps'],
  [/boss|ai/i, 'ai'],
  [/combat|armor/i, 'combat'],
  [/ui|interface/i, 'interface'],
  [/graphic/i, 'graphics'],
  [/sound|audio/i, 'sound'],
  [/performance|optim/i, 'performance'],
  [/arena/i, 'arena'],
  [/season/i, 'seasonal'],
];

function slugPart(value: string, index: number): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${base || 'item'}-${index + 1}`;
}

function changeTypeOf(text: string): PatchChangeType {
  if (/\b(fixed|fix(ed)?|resolved)\b/i.test(text)) return 'fixed';
  if (/\b(removed|deleted|disabled)\b/i.test(text)) return 'removed';
  if (/\b(added|new|introduc)\b/i.test(text)) return 'new';
  if (/\b(changed|updated|increased|decreased|adjusted|reworked|nerf|buff)\b/i.test(text)) {
    return 'changed';
  }
  return 'other';
}

function importanceOf(text: string, changeType: PatchChangeType): PatchImportance {
  if (/progress.?block|data loss|item loss|exploit|critical/i.test(text)) return 'critical';
  if (changeType === 'fixed' && /quest|trader|flea|server|matchmaking/i.test(text)) return 'high';
  if (changeType === 'new' || /balance|damage|recoil|fee|xp\b/i.test(text)) return 'high';
  if (/typo|text|animation|visual|icon/i.test(text)) return 'low';
  return 'medium';
}

function categoryOf(text: string, headingCategory: PatchCategoryKey | null): PatchCategoryKey {
  if (headingCategory) return headingCategory;
  for (const [key, pattern] of CATEGORY_RULES) {
    if (pattern.test(text)) return key;
  }
  return 'other';
}

function headingCategory(line: string): PatchCategoryKey | null {
  for (const [pattern, key] of HEADING_CATEGORY) {
    if (pattern.test(line)) return key;
  }
  return null;
}

function extractBeforeAfter(text: string): { before?: string; after?: string } {
  const arrow = text.match(/(\d+(?:\.\d+)?%?)\s*(?:→|->|to|에서)\s*(\d+(?:\.\d+)?%?)/i);
  if (arrow) return { before: arrow[1], after: arrow[2] };
  const fromTo = text.match(/from\s+(\d+(?:\.\d+)?%?)\s+to\s+(\d+(?:\.\d+)?%?)/i);
  if (fromTo) return { before: fromTo[1], after: fromTo[2] };
  return {};
}

function modesOf(text: string): Array<'pvp' | 'pve' | 'seasonal' | 'arena'> {
  const modes: Array<'pvp' | 'pve' | 'seasonal' | 'arena'> = [];
  if (/\bpvp\b|regular/i.test(text)) modes.push('pvp');
  if (/\bpve\b/i.test(text)) modes.push('pve');
  if (/\bseasonal\b/i.test(text)) modes.push('seasonal');
  if (/\barena\b/i.test(text)) modes.push('arena');
  return modes;
}

function isHeading(line: string): boolean {
  if (/^##\s+/.test(line)) return true;
  if (/^[A-Z][A-Za-z0-9 /&-]{2,60}:$/.test(line)) return true;
  if (/^[가-힣A-Za-z0-9 /&-]{2,40}$/.test(line) && !/[.!?]$/.test(line) && line.length < 48) {
    return /^[A-Z가-힣]/.test(line) && !/^\d/.test(line);
  }
  return false;
}

function listLines(body: string): string[] {
  return body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function extractPatchVersion(title: string): string | null {
  const match = title.match(/patch\s+([\d.]+)/i) ?? title.match(/\b(\d+\.\d+\.\d+(?:\.\d+)?)\b/);
  return match?.[1] ?? null;
}

export function parseOfficialPatchText(input: {
  title: string;
  content: string;
  eventId: string;
}): StructuredPatchNote {
  const lines = listLines(input.content);
  const items: PatchNoteItem[] = [];
  let currentHeading: PatchCategoryKey | null = null;
  let sourceItemCount = 0;

  for (const raw of lines) {
    const line = raw.replace(/^##\s+/, '').replace(/^[-*•]\s+/, '').trim();
    if (!line) continue;
    if (isHeading(line) && line.length < 80 && !/^[-*•]/.test(raw)) {
      currentHeading = headingCategory(line);
      continue;
    }
    // Skip very short leftovers that are not change entries.
    if (line.length < 12 && !/\d/.test(line)) continue;
    sourceItemCount += 1;
    const changeType = changeTypeOf(line);
    const { before, after } = extractBeforeAfter(line);
    const title =
      line.length > 90 ? `${line.slice(0, 87).trim()}…` : line;
    const id = `${input.eventId}:${slugPart(title, items.length)}`;
    items.push({
      id,
      sourceReferenceId: id,
      category: categoryOf(line, currentHeading),
      title,
      changeType,
      importance: importanceOf(line, changeType),
      officialContent: line,
      beforeValue: before,
      afterValue: after,
      affectedModes: modesOf(line),
      statuses: ['official'],
    });
  }

  const summary = items
    .filter((item) => item.importance === 'critical' || item.importance === 'high')
    .slice(0, 10)
    .map((item) => item.title);

  const counts = new Map<PatchCategoryKey, number>();
  for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);

  return {
    version: extractPatchVersion(input.title),
    title: input.title,
    summary: summary.length > 0 ? summary : items.slice(0, 8).map((item) => item.title),
    categories: [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
    items,
    sourceItemCount,
    retainedItemCount: items.length,
  };
}

/** Numbers/units that must survive structuring. */
export function extractComparableTokens(text: string): string[] {
  const tokens = text.match(
    /\d+(?:\.\d+)?%?|\b(?:xp|ms|m|kg|sec|secs|seconds|min|mins|minutes|hour|hours|lvl|level)\b/gi,
  );
  return (tokens ?? []).map((token) => token.toLowerCase()).sort();
}

export function validateStructuredAgainstSource(
  sourceText: string,
  structured: StructuredPatchNote,
): { ok: boolean; missingTokens: string[]; itemGap: number } {
  const sourceTokens = extractComparableTokens(sourceText);
  const structuredTokens = extractComparableTokens(
    structured.items.map((item) => item.officialContent).join('\n'),
  );
  const structuredSet = new Set(structuredTokens);
  const missingTokens = sourceTokens.filter((token) => !structuredSet.has(token));
  // Allow small gaps for heading noise; large loss means over-summarization.
  const itemGap = Math.max(0, structured.sourceItemCount - structured.retainedItemCount);
  const ok = missingTokens.length <= Math.max(3, Math.floor(sourceTokens.length * 0.15)) && itemGap === 0;
  return { ok, missingTokens, itemGap };
}
