import type { LiveEntry } from '@/types/live';
import type { NewsStory, NewsStoryTranslation, OfficialSourcePost } from '@/types/newsroom';
import { classifyOfficialPost } from './news-classify';
import { canonicalStoryKey } from './news-dedupe';
import { extractNewsFacts } from './news-fact-extract';
import { inferStoryStatus } from './news-story-merge';
import { extractPatchVersion } from './parse-patch-notes';

export interface NewsroomCard {
  story: NewsStory;
  translation: NewsStoryTranslation;
  entry: LiveEntry;
  processingStatus?: 'partially_published' | 'published';
  patchSlug?: string;
}

export function isOfficialNewsroomEntry(entry: LiveEntry): boolean {
  return (
    entry.source === 'official_telegram' ||
    entry.source === 'official_website' ||
    entry.source === 'steam'
  );
}

function sourcePost(entry: LiveEntry): OfficialSourcePost {
  const source =
    entry.source === 'official_website'
      ? 'official-web'
      : entry.source === 'steam'
        ? 'official-web'
        : /ru/i.test(entry.account ?? '')
          ? 'telegram-ru'
          : 'telegram-en';
  const language = source === 'telegram-ru' ? 'ru' : 'en';
  return {
    id: entry.id,
    source,
    sourceMessageId: entry.sourcePostId,
    sourceUrl: entry.url ?? 'https://escapefromtarkov.com/',
    channelUsername: entry.account?.replace(/^@/, ''),
    sourceLanguage: language,
    publishedAt: entry.publishedAt,
    normalizedText: `${entry.originalTitle}\n${entry.originalContent}`.trim(),
    textHash: entry.contentHash,
    linkedOfficialUrls: entry.tags
      .filter((tag) => tag.startsWith('newsroom:linked:'))
      .map((tag) => tag.slice('newsroom:linked:'.length)),
    mediaKinds: [entry.youtubeVideoId ? 'video' : entry.imageUrl ? 'image' : 'link'],
    importedAt: entry.collectedAt,
  };
}

function gameOf(entry: LiveEntry): NewsStory['game'] {
  const arena = entry.gameModes.includes('arena');
  const eft = entry.gameModes.some((mode) => mode === 'pvp' || mode === 'pve');
  return arena && eft ? 'both' : arena ? 'arena' : eft ? 'eft' : 'unknown';
}

function patchSlugFor(entry: LiveEntry): string | undefined {
  const version =
    extractPatchVersion(entry.originalTitle) ??
    extractPatchVersion(entry.title) ??
    extractPatchVersion(entry.originalContent.slice(0, 200));
  if (version) return version.replace(/\./g, '-');
  if (!['patch', 'hotfix', 'maintenance'].includes(entry.category)) return undefined;
  const body = entry.originalContent || entry.content;
  if (body.length < 400) return undefined;
  return entry.id.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80);
}

export function projectOfficialEntry(entry: LiveEntry, locale: 'ko' | 'en' | 'zh'): NewsroomCard | null {
  if (!isOfficialNewsroomEntry(entry) || !entry.url) return null;
  const post = sourcePost(entry);
  const classified = classifyOfficialPost(post);
  const taggedCategory = entry.tags.find((tag) => tag.startsWith('newsroom:category:'))?.split(':').at(-1);
  const taggedSection = entry.tags.find((tag) => tag.startsWith('newsroom:section:'))?.split(':').at(-1);
  const category = (
    entry.source === 'steam' && entry.category === 'patch'
      ? 'patch'
      : taggedCategory || classified.category
  ) as NewsStory['category'];
  const section = (taggedSection || classified.section) as NewsStory['section'];
  const status = inferStoryStatus(post.normalizedText);
  const game = gameOf(entry) === 'unknown' ? classified.game : gameOf(entry);
  const processing =
    entry.tags.includes('newsroom:processing:partial') ||
    (entry.reviewStatus === 'auto_published' && !entry.summary && entry.content.length < 280)
      ? 'partially_published'
      : 'published';
  const story: NewsStory = {
    id: entry.id,
    canonicalKey: canonicalStoryKey({
      post,
      category,
      game,
      startsAt: entry.startsAt ?? undefined,
    }),
    section,
    category,
    tags: [...new Set([...classified.tags, ...entry.tags])],
    game,
    gameModes: [
      ...new Set(
        entry.gameModes.flatMap((mode) =>
          mode === 'pve' ? (['pve'] as const) : mode === 'pvp' ? (['regular'] as const) : [],
        ),
      ),
    ],
    status,
    importance:
      category === 'outage'
        ? 'critical'
        : ['maintenance', 'patch', 'event'].includes(category)
          ? 'high'
          : 'normal',
    startsAt: entry.startsAt ?? undefined,
    endsAt: entry.endsAt ?? undefined,
    sourcePostIds: [entry.id, ...entry.confirmations.map((item) => `${item.source}:${item.postId}`)],
    sourceUrls: [...new Set([entry.url, ...entry.confirmations.map((item) => item.url)])],
    publishedAt: entry.publishedAt,
    updatedAt: entry.lastCheckedAt || entry.publishedAt,
  };
  const facts = extractNewsFacts(entry.originalContent);
  const processingNotice =
    locale === 'ko'
      ? '공식 소식이 확인되었습니다.\n상세 내용을 정리하고 있습니다.'
      : locale === 'zh'
        ? '已确认官方消息。\n正在整理详细内容。'
        : 'Official news confirmed.\nDetailed notes are being prepared.';
  const translation: NewsStoryTranslation = {
    storyId: story.id,
    locale,
    title: entry.title,
    summary:
      processing === 'partially_published'
        ? processingNotice
        : entry.summary || entry.content.slice(0, 360),
    facts,
    translationStatus:
      entry.reviewStatus === 'reviewed'
        ? 'reviewed'
        : entry.translated
          ? 'machine-draft'
          : locale === 'en'
            ? 'source'
            : 'fallback',
    reviewedAt: entry.reviewStatus === 'reviewed' ? entry.lastCheckedAt : undefined,
    sourceLanguage: post.sourceLanguage,
  };
  return {
    story,
    translation,
    entry,
    processingStatus: processing,
    patchSlug: patchSlugFor(entry),
  };
}

export function projectOfficialFeed(entries: LiveEntry[], locale: 'ko' | 'en' | 'zh'): NewsroomCard[] {
  return entries
    .map((entry) => projectOfficialEntry(entry, locale))
    .filter((item): item is NewsroomCard => Boolean(item));
}

export function selectHomepageOfficialEntries(entries: LiveEntry[], now = Date.now()): LiveEntry[] {
  return entries
    .filter(isOfficialNewsroomEntry)
    .sort((a, b) => {
      const score = (entry: LiveEntry) => {
        const card = projectOfficialEntry(entry, 'en');
        if (!card) return 0;
        if (card.story.importance === 'critical') return 5;
        if (['active', 'extended'].includes(card.story.status) && card.story.section === 'game') return 4;
        if (card.story.section === 'game') return 2;
        return 1;
      };
      return score(b) - score(a) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || now - now;
    })
    .slice(0, 3);
}
