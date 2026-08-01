import 'server-only';
import type { Locale } from '@/i18n/routing';
import { getSteamNews } from '../steam-news';
import { getLocalizedNews } from '../translate-news';
import type { CollectableAdapter } from './collect';
import { liveConfig } from './config';
import type { RawPost } from './normalize';
import manualStore from './manual-entries.json';
import { fixturePosts } from './fixtures';

/**
 * Source adapters. Adding a source means adding one object to `ADAPTERS` —
 * everything downstream (normalization, dedup, status, UI) is source-agnostic.
 *
 * Contract: `fetch` either resolves with posts or throws. A throw is caught by
 * the caller and reported as a degraded source; it never takes the page down,
 * and it never removes what the other sources returned.
 */
export type SourceAdapter = CollectableAdapter;

/**
 * Steam RSS — unchanged from the original news page, deliberately. It stays
 * the primary official source and keeps using the committed ko/zh
 * translations (`news-ko.json`/`news-zh.json`), so no post that reads Korean
 * today starts reading English after this change.
 *
 * Both the original and the localized feed are read: the original English is
 * what classification/dedup hash against (the rules are English keyword
 * rules), the localized text is what renders.
 */
const steamAdapter: SourceAdapter = {
  source: 'steam',
  enabled: () => true,
  fetch: async (locale) => {
    const [original, localized] = await Promise.all([getSteamNews(), getLocalizedNews(locale)]);
    const originals = [...original.patchNotes, ...original.events];
    const localizedById = new Map(
      [...localized.patchNotes, ...localized.events].map((item) => [item.id, item]),
    );

    return originals.map((item) => {
      const display = localizedById.get(item.id);
      const isTranslated =
        locale !== 'en' &&
        display != null &&
        (display.title !== item.title || display.content !== item.content);
      return {
        source: 'steam' as const,
        account: null,
        postId: item.id,
        url: item.url,
        title: item.title,
        content: item.content,
        publishedAt: item.publishedAt,
        translated: isTranslated ? { title: display.title, content: display.content } : null,
      };
    });
  },
};

/**
 * Manual store — `manual-entries.json`, hand-edited and committed. This is
 * both the curation surface and the review surface: it is the only place an
 * event start/end time, a corrected summary, or a `reviewStatus` can come
 * from. See docs/tarkov-live.md.
 *
 * Same pattern the project already uses for `task-ko.json` / `news-ko.json` /
 * `gunsmith-builds.json` — a typed, committed file rather than a database
 * nobody wanted to operate for a handful of rows.
 */
interface ManualEntry {
  postId: string;
  url?: string | null;
  publishedAt: string;
  /** Locale-keyed text; `ko` is required, others fall back ko -> en -> ko. */
  text: Partial<Record<Locale, { title: string; content: string }>> & {
    ko: { title: string; content: string };
  };
  /** Everything a human is allowed to set. Recorded in `manualFields` so
   * automated re-collection can never overwrite it. */
  overrides?: Record<string, unknown>;
}

const manualAdapter: SourceAdapter = {
  source: 'manual',
  enabled: () => true,
  fetch: async (locale) => {
    const entries = (manualStore as { entries: ManualEntry[] }).entries ?? [];
    return entries.map((entry) => {
      const text = entry.text[locale] ?? entry.text.en ?? entry.text.ko;
      return {
        source: 'manual' as const,
        account: null,
        postId: entry.postId,
        url: entry.url ?? null,
        title: text.title,
        content: text.content,
        publishedAt: entry.publishedAt,
        translated: null,
        overrides: entry.overrides ?? null,
      } satisfies RawPost;
    });
  },
};

const fixtureAdapter: SourceAdapter = {
  source: 'manual',
  // Always "enabled" so an off switch never reads as a broken source; it just
  // contributes nothing.
  enabled: () => true,
  fetch: async (locale) => (liveConfig.fixtures ? fixturePosts(locale) : []),
};

/**
 * The **fallback** registry, used only when no database is configured (local
 * development, CI, a preview deployment). It is deliberately limited to sources
 * that are safe to touch during a page render: Steam's RSS, which already has
 * its own 1-hour fetch cache, plus committed files.
 *
 * X and the Gemini interpreter are **not** here and must never be added. They
 * belong to the cron pipeline (`collectors.ts` / `pipeline.ts`), because a
 * metered API called from a render is billed per locale, per regeneration, for
 * as long as the page gets traffic.
 */
export const ADAPTERS: SourceAdapter[] = [steamAdapter, manualAdapter, fixtureAdapter];
