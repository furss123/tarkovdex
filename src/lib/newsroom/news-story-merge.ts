import type { NewsStory, NewsStoryStatus, OfficialSourcePost } from '@/types/newsroom';

const STATUS_RANK: Record<NewsStoryStatus, number> = {
  unknown: 0, scheduled: 1, active: 2, extended: 3, resolved: 4, completed: 4, cancelled: 4,
};

export function inferStoryStatus(text: string): NewsStoryStatus {
  if (/cancelled|canceled|отмен/i.test(text)) return 'cancelled';
  if (/restored|resolved|completed|concluded|installation is complete|заверш|восстанов/i.test(text)) return /outage|issue|problem|недоступ/i.test(text) ? 'resolved' : 'completed';
  if (/extended|продлен|продлён/i.test(text)) return 'extended';
  if (/has begun|has started|is now live|currently|начал|стартовал/i.test(text)) return 'active';
  if (/tomorrow|will (?:begin|start|take place)|planned|планируем|состоится/i.test(text)) return 'scheduled';
  return 'unknown';
}

export function mergeStoryUpdate(story: NewsStory, post: OfficialSourcePost, status = inferStoryStatus(post.normalizedText)): NewsStory {
  if (story.sourcePostIds.includes(post.id)) return story;
  const nextStatus = STATUS_RANK[status] >= STATUS_RANK[story.status] ? status : story.status;
  return {
    ...story, status: nextStatus,
    sourcePostIds: [...story.sourcePostIds, post.id],
    sourceUrls: [...new Set([...story.sourceUrls, post.sourceUrl, ...post.linkedOfficialUrls])],
    publishedAt: Date.parse(post.publishedAt) < Date.parse(story.publishedAt) ? post.publishedAt : story.publishedAt,
    updatedAt: post.editedAt ?? post.publishedAt,
  };
}

export interface NewsTimelineItem { postId: string; at: string; status: NewsStoryStatus; sourceUrl: string; }
export function storyTimeline(posts: OfficialSourcePost[]): NewsTimelineItem[] {
  return [...posts].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt)).map((post) => ({
    postId: post.id, at: post.publishedAt, status: inferStoryStatus(post.normalizedText), sourceUrl: post.sourceUrl,
  }));
}
