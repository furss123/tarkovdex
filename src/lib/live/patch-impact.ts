/**
 * PatchImpact — read-time projection over `LiveEntry` (Phase 7).
 *
 * Does not replace Tarkov Live, invent facts from titles, or treat instance
 * `fetchedAt` as proof that site data reflects a patch. Unknown stays unknown.
 */

import type { DataDomainId } from '@/lib/data-status';
import type {
  AffectedArea,
  EventStatus,
  LiveEntry,
  LiveGameMode,
  NewsCategory,
  ReviewStatus,
} from '@/types/live';
import {
  applyPatchImpactOverride,
  findPatchImpactOverride,
  type PatchImpactOverride,
} from './patch-impact-overrides';
import { computeEventStatus } from './status';

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

export type PatchReviewStatus = 'unreviewed' | 'machine-classified' | 'human-reviewed';

export type PatchDataSyncStatus =
  | 'reflected'
  | 'partially-reflected'
  | 'not-yet-confirmed'
  | 'unknown';

export type PatchConfidence = 'high' | 'medium' | 'low';

export type PatchEventState = 'upcoming' | 'active' | 'ended' | 'unknown';

export type PatchKind = 'patch' | 'hotfix' | 'maintenance' | 'event' | 'announcement' | 'other';

export interface PatchDataSyncDomain {
  domain: DataDomainId | 'none';
  status: PatchDataSyncStatus;
  checkedAt?: string;
  reasonCode: string;
}

export interface PatchImpact {
  id: string;
  liveEntryId: string;
  sourceUrl: string | null;
  sourceType: LiveEntry['source'];
  publishedAt: string;
  effectiveAt?: string;
  updatedAt?: string;
  patchVersion?: string;
  title: string;
  shortSummary?: string;
  impactAreas: PatchImpactArea[];
  gameModeScope: GameModeScope;
  eventState: PatchEventState;
  kind: PatchKind;
  reviewStatus: PatchReviewStatus;
  dataSync: {
    overall: PatchDataSyncStatus;
    domains: PatchDataSyncDomain[];
  };
  confidence: PatchConfidence;
  evidenceCodes: string[];
}

export interface DomainSyncObservation {
  domain: DataDomainId;
  /** Upstream content stamp only — never a fetch clock. */
  sourceUpdatedAt?: string | null;
  supportsSourceTimestamp: boolean;
  availability?: 'available' | 'partial' | 'unavailable';
}

export interface RelatedToolLink {
  area: PatchImpactArea;
  href: string;
  messageKey: string;
}

/** Central registry: impact area → TarkovDex data domains. */
export const IMPACT_AREA_DOMAINS: Record<PatchImpactArea, DataDomainId[]> = {
  economy: ['itemPrices', 'traderPrices'],
  quests: ['quests'],
  items: ['itemPrices'],
  crafting: ['crafts', 'barters'],
  ammo: ['ammunition'],
  armor: ['armor'],
  maps: ['maps'],
  bosses: ['bosses'],
  traders: ['traderPrices', 'barters'],
  events: ['events', 'news'],
  technical: [],
  unknown: [],
};

const AFFECT_TO_IMPACT: Record<AffectedArea, PatchImpactArea[]> = {
  xp: ['events'],
  boss: ['bosses'],
  map: ['maps'],
  quest: ['quests'],
  trader: ['traders'],
  item: ['items'],
  spawn: ['bosses', 'maps'],
  server: ['technical'],
  other: ['unknown'],
};

const PATCH_VERSION_RE = /^patch\s+([\d.]+)/i;
const HOTFIX_RE = /\bhotfix\b/i;

export function extractPatchVersion(title: string, originalTitle?: string): string | undefined {
  for (const candidate of [originalTitle, title]) {
    if (!candidate) continue;
    const match = candidate.trim().match(PATCH_VERSION_RE);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

export function classifyPatchKind(entry: Pick<LiveEntry, 'category' | 'title' | 'originalTitle'>): PatchKind {
  const text = `${entry.originalTitle}\n${entry.title}`;
  if (entry.category === 'maintenance' || entry.category === 'server_status') return 'maintenance';
  if (entry.category === 'event' || entry.category === 'sale') return 'event';
  if (entry.category === 'patch') {
    return HOTFIX_RE.test(text) ? 'hotfix' : 'patch';
  }
  if (entry.category === 'announcement') return 'announcement';
  return 'other';
}

export function mapAffectedAreas(affects: AffectedArea[]): {
  areas: PatchImpactArea[];
  evidenceCodes: string[];
} {
  const areas = new Set<PatchImpactArea>();
  const evidenceCodes: string[] = [];
  for (const affect of affects) {
    const mapped = AFFECT_TO_IMPACT[affect] ?? ['unknown'];
    for (const area of mapped) {
      if (area !== 'unknown') areas.add(area);
    }
    evidenceCodes.push(`affect:${affect}`);
  }
  return { areas: [...areas], evidenceCodes };
}

export function classifyImpactAreasFromCategory(category: NewsCategory): {
  areas: PatchImpactArea[];
  evidenceCodes: string[];
} {
  switch (category) {
    case 'maintenance':
    case 'server_status':
      return { areas: ['technical'], evidenceCodes: [`category:${category}`] };
    case 'event':
    case 'sale':
      return { areas: ['events'], evidenceCodes: [`category:${category}`] };
    case 'patch':
      // A patch title alone does not prove which systems changed.
      return { areas: ['unknown'], evidenceCodes: ['category:patch-unscoped'] };
    default:
      return { areas: ['unknown'], evidenceCodes: [`category:${category}`] };
  }
}

export function classifyImpactAreas(entry: Pick<LiveEntry, 'affects' | 'category' | 'manualFields'>): {
  areas: PatchImpactArea[];
  evidenceCodes: string[];
} {
  if (entry.affects.length > 0) {
    const mapped = mapAffectedAreas(entry.affects);
    if (mapped.areas.length > 0) return mapped;
  }
  return classifyImpactAreasFromCategory(entry.category);
}

export function classifyGameModeScope(modes: LiveGameMode[]): GameModeScope {
  const meaningful = modes.filter((mode) => mode === 'pvp' || mode === 'pve');
  if (meaningful.length === 0) return 'unknown';
  const hasPvp = meaningful.includes('pvp');
  const hasPve = meaningful.includes('pve');
  if (hasPvp && hasPve) return 'both';
  if (hasPvp) return 'regular';
  if (hasPve) return 'pve';
  return 'unknown';
}

export function mapEventStatusToPatchState(status: EventStatus): PatchEventState {
  switch (status) {
    case 'scheduled':
      return 'upcoming';
    case 'active':
    case 'ending_soon':
      return 'active';
    case 'ended':
      return 'ended';
    case 'unknown':
      return 'unknown';
  }
}

export function determineEventState(
  entry: Pick<LiveEntry, 'startsAt' | 'endsAt' | 'status' | 'manualFields'>,
  now: number,
): PatchEventState {
  return mapEventStatusToPatchState(computeEventStatus(entry, now));
}

export function mapLiveReviewStatus(
  reviewStatus: ReviewStatus,
  hasStructuredImpact: boolean,
  humanReviewed: boolean,
): PatchReviewStatus {
  if (humanReviewed || reviewStatus === 'reviewed') return 'human-reviewed';
  if (reviewStatus === 'auto_published' && hasStructuredImpact) return 'machine-classified';
  if (hasStructuredImpact && reviewStatus !== 'pending_review') return 'machine-classified';
  return 'unreviewed';
}

export function calculatePatchConfidence(input: {
  reviewStatus: PatchReviewStatus;
  evidenceCodes: string[];
  impactAreas: PatchImpactArea[];
  gameModeScope: GameModeScope;
}): PatchConfidence {
  if (input.reviewStatus === 'human-reviewed') return 'high';
  const onlyUnknown =
    input.impactAreas.length === 0 ||
    (input.impactAreas.length === 1 && input.impactAreas[0] === 'unknown');
  if (onlyUnknown) return 'low';
  if (input.reviewStatus === 'machine-classified' && input.evidenceCodes.some((c) => c.startsWith('affect:'))) {
    return input.gameModeScope === 'unknown' ? 'medium' : 'medium';
  }
  if (input.evidenceCodes.some((c) => c.startsWith('override:'))) return 'high';
  return 'low';
}

/**
 * Conservative data-sync: only `sourceUpdatedAt` (content stamp) can support
 * `reflected`. Fetch clocks alone never do.
 */
export function determinePatchDataSync(input: {
  effectiveAt?: string | null;
  impactAreas: PatchImpactArea[];
  observations?: DomainSyncObservation[];
  now?: number;
}): PatchImpact['dataSync'] {
  const effectiveMs = input.effectiveAt ? Date.parse(input.effectiveAt) : Number.NaN;
  const hasEffective = Number.isFinite(effectiveMs);
  const observations = input.observations ?? [];
  const domains: PatchDataSyncDomain[] = [];

  const relevantDomains = new Set<DataDomainId>();
  for (const area of input.impactAreas) {
    for (const domain of IMPACT_AREA_DOMAINS[area] ?? []) {
      relevantDomains.add(domain);
    }
  }

  if (relevantDomains.size === 0) {
    return {
      overall: 'unknown',
      domains: [
        {
          domain: 'none',
          status: 'unknown',
          reasonCode: input.impactAreas.includes('technical')
            ? 'technical-no-comparable-domain'
            : 'no-mapped-domains',
        },
      ],
    };
  }

  for (const domain of relevantDomains) {
    const obs = observations.find((item) => item.domain === domain);
    if (!obs) {
      domains.push({
        domain,
        status: 'unknown',
        reasonCode: 'no-observation',
      });
      continue;
    }
    if (obs.availability === 'unavailable') {
      domains.push({
        domain,
        status: 'unknown',
        reasonCode: 'domain-unavailable',
        checkedAt: obs.sourceUpdatedAt ?? undefined,
      });
      continue;
    }
    if (!obs.supportsSourceTimestamp) {
      domains.push({
        domain,
        status: 'unknown',
        reasonCode: 'no-content-timestamp-contract',
        checkedAt: obs.sourceUpdatedAt ?? undefined,
      });
      continue;
    }
    if (!hasEffective) {
      domains.push({
        domain,
        status: 'unknown',
        reasonCode: 'no-effective-at',
        checkedAt: obs.sourceUpdatedAt ?? undefined,
      });
      continue;
    }
    if (!obs.sourceUpdatedAt) {
      domains.push({
        domain,
        status: 'not-yet-confirmed',
        reasonCode: 'missing-source-updated-at',
      });
      continue;
    }
    const sourceMs = Date.parse(obs.sourceUpdatedAt);
    if (!Number.isFinite(sourceMs)) {
      domains.push({
        domain,
        status: 'unknown',
        reasonCode: 'unparseable-source-updated-at',
      });
      continue;
    }
    if (sourceMs >= effectiveMs) {
      domains.push({
        domain,
        status: obs.availability === 'partial' ? 'partially-reflected' : 'reflected',
        checkedAt: obs.sourceUpdatedAt,
        reasonCode:
          obs.availability === 'partial' ? 'source-after-effective-partial' : 'source-after-effective',
      });
    } else {
      domains.push({
        domain,
        status: 'not-yet-confirmed',
        checkedAt: obs.sourceUpdatedAt,
        reasonCode: 'source-before-effective',
      });
    }
  }

  const statuses = domains.map((d) => d.status);
  let overall: PatchDataSyncStatus = 'unknown';
  if (statuses.every((s) => s === 'reflected')) overall = 'reflected';
  else if (statuses.some((s) => s === 'reflected' || s === 'partially-reflected')) {
    overall = 'partially-reflected';
  } else if (statuses.every((s) => s === 'not-yet-confirmed')) overall = 'not-yet-confirmed';
  else if (statuses.some((s) => s === 'not-yet-confirmed') && statuses.every((s) => s !== 'reflected')) {
    overall = 'not-yet-confirmed';
  } else {
    overall = 'unknown';
  }

  return { overall, domains };
}

export function resolvePatchSummary(input: {
  overrideSummary?: string;
  entrySummary?: string | null;
  playerImpact?: string | null;
  kind: PatchKind;
  patchVersion?: string;
  impactAreas: PatchImpactArea[];
  gameModeScope: GameModeScope;
}): string | undefined {
  if (input.overrideSummary?.trim()) return input.overrideSummary.trim();
  if (input.entrySummary?.trim()) return input.entrySummary.trim();
  if (input.playerImpact?.trim()) return input.playerImpact.trim();

  // Template summaries only use structured fields already on the entry.
  const areas = input.impactAreas.filter((area) => area !== 'unknown');
  if (areas.length === 0 && !input.patchVersion) return undefined;

  const parts: string[] = [];
  if (input.patchVersion) parts.push(`Patch ${input.patchVersion}`);
  else if (input.kind === 'hotfix') parts.push('Hotfix');
  else if (input.kind === 'maintenance') parts.push('Maintenance');
  else if (input.kind === 'event') parts.push('Event');

  if (areas.length > 0) parts.push(`areas: ${areas.join(', ')}`);
  if (input.gameModeScope !== 'unknown') parts.push(`scope: ${input.gameModeScope}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function buildRelatedToolLinks(areas: PatchImpactArea[]): RelatedToolLink[] {
  const links: RelatedToolLink[] = [];
  const seen = new Set<string>();
  for (const area of areas) {
    let link: RelatedToolLink | null = null;
    switch (area) {
      case 'economy':
      case 'items':
        link = { area, href: '/economy/items', messageKey: 'tools.items' };
        break;
      case 'crafting':
        link = { area, href: '/economy/craft-calculator', messageKey: 'tools.crafting' };
        break;
      case 'quests':
        link = { area, href: '/progression/tasks/tracker', messageKey: 'tools.quests' };
        break;
      case 'ammo':
        link = { area, href: '/combat/ammo', messageKey: 'tools.ammo' };
        break;
      case 'armor':
        link = { area, href: '/combat/armor', messageKey: 'tools.armor' };
        break;
      case 'maps':
      case 'bosses':
        link = { area, href: '/maps', messageKey: 'tools.maps' };
        break;
      case 'traders':
        link = { area, href: '/economy/barters', messageKey: 'tools.traders' };
        break;
      case 'events':
        link = { area, href: '/news', messageKey: 'tools.events' };
        break;
      default:
        link = null;
    }
    if (!link || seen.has(link.href)) continue;
    seen.add(link.href);
    links.push(link);
  }
  return links;
}

export function normalizePatchImpact(
  entry: LiveEntry,
  options: {
    now: number;
    observations?: DomainSyncObservation[];
    overrides?: PatchImpactOverride[];
  },
): PatchImpact {
  const override = findPatchImpactOverride(entry.id, options.overrides);
  const classified = classifyImpactAreas(entry);
  const scope = classifyGameModeScope(entry.gameModes);
  const kind = classifyPatchKind(entry);
  const version = extractPatchVersion(entry.title, entry.originalTitle);

  let impactAreas = classified.areas;
  let evidenceCodes = [...classified.evidenceCodes];
  let gameModeScope = scope;
  let shortSummary = resolvePatchSummary({
    entrySummary: entry.summary,
    playerImpact: entry.playerImpact,
    kind,
    patchVersion: version,
    impactAreas,
    gameModeScope,
  });
  let effectiveAt = entry.startsAt ?? undefined;
  let patchVersion = version;
  let reviewStatus = mapLiveReviewStatus(
    entry.reviewStatus,
    impactAreas.length > 0 && !(impactAreas.length === 1 && impactAreas[0] === 'unknown'),
    entry.manualFields.includes('affects') ||
      entry.manualFields.includes('summary') ||
      entry.reviewStatus === 'reviewed',
  );

  if (override) {
    const applied = applyPatchImpactOverride(
      {
        impactAreas,
        gameModeScope,
        shortSummary,
        effectiveAt,
        patchVersion,
        reviewStatus,
        evidenceCodes,
      },
      override,
    );
    impactAreas = applied.impactAreas;
    gameModeScope = applied.gameModeScope;
    shortSummary = applied.shortSummary;
    effectiveAt = applied.effectiveAt;
    patchVersion = applied.patchVersion;
    reviewStatus = applied.reviewStatus;
    evidenceCodes = applied.evidenceCodes;
  }

  // Never leave a silent empty list — unclassified is explicit.
  if (impactAreas.length === 0) {
    impactAreas = ['unknown'];
    evidenceCodes.push('empty-areas-normalized');
  }

  const confidence = calculatePatchConfidence({
    reviewStatus,
    evidenceCodes,
    impactAreas,
    gameModeScope,
  });

  const dataSync = determinePatchDataSync({
    effectiveAt: effectiveAt ?? entry.publishedAt,
    impactAreas,
    observations: options.observations,
    now: options.now,
  });

  return {
    id: `impact:${entry.id}`,
    liveEntryId: entry.id,
    sourceUrl: entry.url,
    sourceType: entry.source,
    publishedAt: entry.publishedAt,
    effectiveAt,
    updatedAt: entry.lastCheckedAt,
    patchVersion,
    title: entry.title,
    shortSummary,
    impactAreas,
    gameModeScope,
    eventState: determineEventState(entry, options.now),
    kind,
    reviewStatus,
    dataSync,
    confidence,
    evidenceCodes,
  };
}

export function sortPatchImpacts(impacts: PatchImpact[]): PatchImpact[] {
  return [...impacts].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export interface PatchImpactFilters {
  area?: PatchImpactArea | 'all';
  mode?: GameModeScope | 'all';
  kind?: PatchKind | 'all';
  state?: PatchEventState | 'all';
  review?: PatchReviewStatus | 'all';
}

const IMPACT_AREAS = new Set<string>([
  'economy',
  'quests',
  'items',
  'crafting',
  'ammo',
  'armor',
  'maps',
  'bosses',
  'traders',
  'events',
  'technical',
  'unknown',
]);

const MODE_SCOPES = new Set<string>(['regular', 'pve', 'both', 'unknown']);
const KINDS = new Set<string>(['patch', 'hotfix', 'maintenance', 'event', 'announcement', 'other']);
const STATES = new Set<string>(['upcoming', 'active', 'ended', 'unknown']);
const REVIEWS = new Set<string>(['unreviewed', 'machine-classified', 'human-reviewed']);

export function parsePatchImpactFilters(input: Record<string, string | string[] | undefined | null>): PatchImpactFilters {
  const one = (key: string): string | undefined => {
    const value = input[key];
    if (Array.isArray(value)) return value[0];
    return value ?? undefined;
  };
  const area = one('area');
  const mode = one('mode');
  const kind = one('kind') ?? one('type');
  const state = one('state');
  const review = one('review');
  return {
    area: area && IMPACT_AREAS.has(area) ? (area as PatchImpactArea) : 'all',
    mode: mode && MODE_SCOPES.has(mode) ? (mode as GameModeScope) : 'all',
    kind: kind && KINDS.has(kind) ? (kind as PatchKind) : 'all',
    state: state && STATES.has(state) ? (state as PatchEventState) : 'all',
    review: review && REVIEWS.has(review) ? (review as PatchReviewStatus) : 'all',
  };
}

export function filterPatchImpacts(impacts: PatchImpact[], filters: PatchImpactFilters): PatchImpact[] {
  return impacts.filter((impact) => {
    if (filters.area && filters.area !== 'all' && !impact.impactAreas.includes(filters.area)) {
      return false;
    }
    if (filters.mode && filters.mode !== 'all') {
      if (filters.mode === 'both') {
        if (impact.gameModeScope !== 'both') return false;
      } else if (impact.gameModeScope !== filters.mode && impact.gameModeScope !== 'both') {
        return false;
      }
    }
    if (filters.kind && filters.kind !== 'all' && impact.kind !== filters.kind) return false;
    if (filters.state && filters.state !== 'all' && impact.eventState !== filters.state) return false;
    if (filters.review && filters.review !== 'all' && impact.reviewStatus !== filters.review) {
      return false;
    }
    return true;
  });
}

export function selectCurrentPatchImpact(impacts: PatchImpact[]): PatchImpact | null {
  const patches = impacts
    .filter((item) => item.kind === 'patch' || item.kind === 'hotfix')
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return patches[0] ?? null;
}

export function projectLiveEntriesToPatchImpacts(
  entries: LiveEntry[],
  options: {
    now: number;
    observations?: DomainSyncObservation[];
    overrides?: PatchImpactOverride[];
  },
): PatchImpact[] {
  return sortPatchImpacts(entries.map((entry) => normalizePatchImpact(entry, options)));
}
