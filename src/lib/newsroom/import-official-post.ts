import 'server-only';
import type { NewsCategory } from '@/types/live';
import type { OfficialSourcePostInput } from './news-source-normalize';
import { normalizeOfficialSourcePost } from './news-source-normalize';
import { classifyOfficialPost } from './news-classify';
import { canonicalStoryKey } from './news-dedupe';
import { inferStoryStatus } from './news-story-merge';
import { newsroomConfig } from './newsroom-config';
import { fetchOfficialArticle } from './fetch-official-article';
import { getRepository } from '@/lib/live/repository-client';
import { revalidatePath } from 'next/cache';

function legacyCategory(category: string): NewsCategory {
  if (['patch', 'hotfix'].includes(category)) return 'patch';
  if (category === 'maintenance') return 'maintenance';
  if (category === 'outage') return 'server_status';
  if (category === 'event' || category === 'drops' || category === 'contest') return 'event';
  if (category === 'sale') return 'sale';
  if (
    ['community', 'video', 'trailer', 'teaser', 'broadcast', 'expo', 'tournament', 'esports'].includes(
      category,
    )
  ) {
    return 'community';
  }
  return 'announcement';
}

function revalidateNews() {
  try {
    revalidatePath('/[locale]/news', 'page');
    revalidatePath('/[locale]/news/patch/[slug]', 'page');
    revalidatePath('/[locale]', 'page');
  } catch {
    // Build-time / non-request contexts may not support revalidation.
  }
}

export async function importOfficialPost(input: OfficialSourcePostInput) {
  const repo = getRepository();
  if (!repo) throw new Error('database_not_configured');
  const post = normalizeOfficialSourcePost(input, newsroomConfig.allowlist);
  const classification = classifyOfficialPost(post);
  const status = inferStoryStatus(post.normalizedText);
  const canonicalKey = canonicalStoryKey({
    post,
    category: classification.category,
    game: classification.game,
  });

  // Stage 2 attempt: follow allowlisted official links when present.
  let fullText = post.normalizedText;
  let linkedFetched = 0;
  const linkedErrors: string[] = [];
  for (const url of post.linkedOfficialUrls.slice(0, 3)) {
    try {
      const article = await fetchOfficialArticle(url, newsroomConfig.allowlist);
      fullText = `${fullText}\n\n## ${article.title ?? 'Official article'}\n${article.text}`.trim();
      linkedFetched += 1;
    } catch (error) {
      linkedErrors.push(error instanceof Error ? error.message : 'fetch_failed');
    }
  }

  const autoPublish = newsroomConfig.publicationMode === 'auto';
  const processingPartial = linkedErrors.length > 0 || (post.linkedOfficialUrls.length > 0 && linkedFetched === 0);
  const title = fullText.split('\n')[0]?.slice(0, 140) || classification.category;

  await repo.migrate();
  const result = await repo.transaction(async (transactionRepo) => {
    const stored = await transactionRepo.upsertRawPost({
      source: post.source === 'official-web' ? 'official_website' : 'official_telegram',
      account: post.channelUsername ?? new URL(post.sourceUrl).hostname,
      postId: post.sourceMessageId,
      url: post.sourceUrl,
      title,
      content: fullText,
      publishedAt: post.publishedAt,
      contentHash: post.textHash,
      media: post.mediaKinds,
      payload: {
        newsroom: post,
        classification,
        processingStatus: processingPartial ? 'partially_published' : 'published',
        linkedFetched,
        linkedErrors,
      },
    });
    const eventId = `newsroom:${canonicalKey}`;
    const tags = [
      ...classification.tags,
      `newsroom:section:${classification.section}`,
      `newsroom:category:${classification.category}`,
      ...post.linkedOfficialUrls.map((url) => `newsroom:linked:${url}`),
      ...(processingPartial ? ['newsroom:processing:partial'] : ['newsroom:processing:complete']),
    ];
    const event = await transactionRepo.createOrUpdateEvent({
      id: eventId,
      slug: canonicalKey.replace(/[^a-z0-9]+/gi, '-').slice(0, 120),
      category: legacyCategory(classification.category),
      reliability: 'official_confirmed',
      reviewStatus: autoPublish ? 'auto_published' : 'pending_review',
      status:
        status === 'completed' || status === 'resolved' || status === 'cancelled'
          ? 'ended'
          : status === 'extended'
            ? 'active'
            : status,
      gameModes: classification.game === 'arena' ? ['arena'] : classification.game === 'both' ? ['pvp', 'arena'] : [],
      affects: classification.section === 'game' ? ['other'] : [],
      tags,
      content: {
        original: { title, content: fullText },
        ...(autoPublish
          ? {
              ko: {
                title,
                content: processingPartial
                  ? `${fullText}\n\n공식 소식이 확인되었습니다.\n상세 내용을 정리하고 있습니다.`
                  : fullText,
                translated: false,
                summary: processingPartial
                  ? '공식 소식이 확인되었습니다.\n상세 내용을 정리하고 있습니다.'
                  : fullText.slice(0, 360),
              },
            }
          : {}),
      },
      primaryPostId: stored.id,
      publishedAt: autoPublish ? new Date().toISOString() : null,
    });
    await transactionRepo.linkPostToEvent(event.id, stored.id, stored.inserted ? 'initial' : 'update');
    await transactionRepo.appendAudit({
      targetType: 'official_source_post',
      targetId: post.id,
      action: stored.inserted ? 'import' : stored.changed ? 'revision' : 'duplicate',
      actor: 'protected-endpoint',
      after: {
        eventId: event.id,
        section: classification.section,
        category: classification.category,
        linkedFetched,
        processingPartial,
      },
    });
    return {
      postId: post.id,
      eventId: event.id,
      inserted: stored.inserted,
      changed: stored.changed,
      reviewStatus: autoPublish ? ('auto_published' as const) : ('needs-review' as const),
      section: classification.section,
      category: classification.category,
      linkedFetched,
      processingStatus: processingPartial ? ('partially_published' as const) : ('published' as const),
    };
  });

  if (autoPublish) revalidateNews();
  return result;
}
