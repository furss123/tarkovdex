import 'server-only';
import type { Locale } from '@/i18n/routing';
import type { LiveEntry } from '@/types/live';
import { getLiveFeed } from '@/lib/live/feed';
import {
  parseOfficialPatchText,
  validateStructuredAgainstSource,
  type StructuredPatchNote,
} from './parse-patch-notes';
import { projectOfficialEntry } from './newsroom-projection';

export interface PatchNotePageModel {
  entry: LiveEntry;
  cardTitle: string;
  structured: StructuredPatchNote;
  validation: ReturnType<typeof validateStructuredAgainstSource>;
  explanation: string | null;
  playerImpact: string | null;
  officialSources: Array<{ type: string; url: string; title?: string }>;
}

function slugCandidates(slug: string): string[] {
  const dotted = slug.replace(/-/g, '.');
  return [...new Set([slug, dotted, `patch-${slug}`, `Patch ${dotted}`])];
}

function matchesSlug(entry: LiveEntry, locale: Locale, slug: string): boolean {
  const card = projectOfficialEntry(entry, locale);
  if (card?.patchSlug === slug) return true;
  const candidates = slugCandidates(slug);
  const haystack = `${entry.originalTitle}\n${entry.title}\n${entry.id}`.toLowerCase();
  return candidates.some((value) => haystack.includes(value.toLowerCase()));
}

export async function getPatchNotePage(
  locale: Locale,
  slug: string,
): Promise<PatchNotePageModel | null> {
  const feed = await getLiveFeed(locale);
  const entry = feed.entries.find((item) => matchesSlug(item, locale, slug)) ?? null;
  if (!entry) return null;

  const structured = parseOfficialPatchText({
    title: entry.title,
    content: entry.content || entry.originalContent,
    eventId: entry.id,
  });
  const validation = validateStructuredAgainstSource(entry.originalContent, structured);
  return {
    entry,
    cardTitle: entry.title,
    structured,
    validation,
    explanation: entry.summary,
    playerImpact: entry.playerImpact,
    officialSources: [
      ...(entry.url
        ? [{ type: entry.source, url: entry.url, title: entry.originalTitle }]
        : []),
      ...entry.confirmations
        .filter((item) => item.url)
        .map((item) => ({ type: item.source, url: item.url, title: item.postId })),
    ],
  };
}
