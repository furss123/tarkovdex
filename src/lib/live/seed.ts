import 'server-only';
import type { Locale } from '@/i18n/routing';
import type { AffectedArea, LiveGameMode, NewsCategory, ReliabilityLevel } from '@/types/live';
import manualStore from './manual-entries.json';
import { contentHash } from './normalize';
import type { EventContent, LiveRepository } from './repository';

/**
 * One-way import of the committed curation file into the database.
 *
 * `manual-entries.json` was the MVP's entire review surface. It stays in the
 * repository as a seed and as an emergency fallback for the no-database path,
 * but once a database exists the database is the source of truth: this import
 * **only creates rows that don't exist yet** and never writes over an operator's
 * later edits. Re-running it on every cron would otherwise silently revert every
 * change made in the admin screen back to whatever was last committed.
 */

interface ManualEntry {
  postId: string;
  url?: string | null;
  publishedAt: string;
  text: Partial<Record<Locale, { title: string; content: string }>> & {
    ko: { title: string; content: string };
  };
  overrides?: Record<string, unknown>;
}

export async function seedManualEntries(repo: LiveRepository): Promise<number> {
  const entries = (manualStore as { entries?: ManualEntry[] }).entries ?? [];
  let created = 0;

  for (const entry of entries) {
    const id = `manual:${entry.postId}`;
    if (await repo.getEvent(id)) continue;

    const base = entry.text.en ?? entry.text.ko;
    const content: EventContent = { original: { title: base.title, content: base.content } };
    for (const locale of ['ko', 'en', 'zh'] as const) {
      const text = entry.text[locale] ?? base;
      content[locale] = { title: text.title, content: text.content, translated: text !== base };
    }

    const overrides = entry.overrides ?? {};
    await repo.upsertRawPost({
      source: 'manual',
      account: null,
      postId: entry.postId,
      url: entry.url ?? null,
      title: base.title,
      content: base.content,
      publishedAt: entry.publishedAt,
      contentHash: contentHash(`${base.title} ${base.content}`),
      payload: { seeded: true },
    });

    await repo.createOrUpdateEvent({
      id,
      slug: `manual-${entry.postId}`,
      category: (overrides.category as NewsCategory) ?? 'unknown',
      reliability: (overrides.reliability as ReliabilityLevel) ?? 'tarkovdex_inference',
      // Curated by a human by definition — it is committed to the repository.
      reviewStatus: 'reviewed',
      gameModes: (overrides.gameModes as LiveGameMode[]) ?? ['unknown'],
      affects: (overrides.affects as AffectedArea[]) ?? [],
      startsAt: (overrides.startsAt as string | null) ?? null,
      endsAt: (overrides.endsAt as string | null) ?? null,
      endConfirmed: Boolean(overrides.endsAt),
      content,
      primaryPostId: id,
      publishedAt: entry.publishedAt,
    });
    await repo.linkPostToEvent(id, id, 'initial');
    if (Object.keys(overrides).length > 0) {
      await repo.updateEventFields(id, overrides, { manual: true, actor: 'seed', note: 'manual-entries.json' });
    }
    created += 1;
  }

  return created;
}
