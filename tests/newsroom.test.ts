import test from 'node:test';
import assert from 'node:assert/strict';
import type { NewsCategoryV2, NewsStory, OfficialSourcePost } from '../src/types/newsroom';
import { classifyOfficialPost } from '../src/lib/newsroom/news-classify';
import { normalizeOfficialSourcePost, NewsSourceValidationError, newsTextHash } from '../src/lib/newsroom/news-source-normalize';
import { canonicalStoryKey, dedupeOfficialPosts, duplicateReason } from '../src/lib/newsroom/news-dedupe';
import { inferStoryStatus, mergeStoryUpdate, storyTimeline } from '../src/lib/newsroom/news-story-merge';
import { lifecycleVisible, selectLifecycleFeed } from '../src/lib/newsroom/news-lifecycle';
import { matchesNewsFilters, parseNewsFeedFilters } from '../src/lib/newsroom/news-feed-filter';
import { checkTranslationStyle } from '../src/lib/newsroom/news-translation-style';
import { canAutoPublish, validateTranslationDraft } from '../src/lib/newsroom/news-translation-validate';

const ALLOWLIST = { telegramEn: 'escapefromtarkovEN', telegramRu: 'escapefromtarkovRU', officialHosts: ['escapefromtarkov.com', 'tarkov.com'] };

function post(overrides: Partial<OfficialSourcePost> = {}): OfficialSourcePost {
  const normalizedText = overrides.normalizedText ?? 'Patch 1.1.0.0 installation has begun.';
  return { id: 'telegram-en:escapefromtarkoven:1', source: 'telegram-en', sourceMessageId: '1',
    sourceUrl: 'https://t.me/escapefromtarkovEN/1', channelUsername: 'escapefromtarkovEN', sourceLanguage: 'en',
    publishedAt: '2026-08-03T00:00:00.000Z', normalizedText, textHash: newsTextHash(normalizedText), linkedOfficialUrls: [],
    mediaKinds: [], importedAt: '2026-08-03T00:01:00.000Z', ...overrides };
}

const CLASSIFICATION_FIXTURES: Array<{ sourceText: string; expectedCategory: NewsCategoryV2; expectedSection: 'game' | 'media-promo' }> = [
  { sourceText: 'Tomorrow we plan to install Patch 1.1.0.0 for #EscapefromTarkov.', expectedCategory: 'patch', expectedSection: 'game' },
  { sourceText: 'Patch 1.1.0.0 installation has begun.', expectedCategory: 'patch', expectedSection: 'game' },
  { sourceText: 'Technical maintenance has been extended by 2 hours.', expectedCategory: 'maintenance', expectedSection: 'game' },
  { sourceText: 'Maintenance is completed and services are available.', expectedCategory: 'maintenance', expectedSection: 'game' },
  { sourceText: 'There is currently a server outage affecting #EscapefromTarkov.', expectedCategory: 'outage', expectedSection: 'game' },
  { sourceText: 'The server outage has been resolved.', expectedCategory: 'outage', expectedSection: 'game' },
  { sourceText: 'The in-game event is now live in #EscapefromTarkov.', expectedCategory: 'event', expectedSection: 'game' },
  { sourceText: 'The in-game event has been extended until August 8.', expectedCategory: 'event', expectedSection: 'game' },
  { sourceText: 'Experience points and rewards are increased by 50%.', expectedCategory: 'xp-reward', expectedSection: 'game' },
  { sourceText: 'Changes were made to the quest requirements.', expectedCategory: 'quest', expectedSection: 'game' },
  { sourceText: 'Trader assortments have been updated.', expectedCategory: 'trader', expectedSection: 'game' },
  { sourceText: 'A new season is now live in EFT: Arena.', expectedCategory: 'season-wipe', expectedSection: 'game' },
  { sourceText: 'A new official video episode is available on YouTube.', expectedCategory: 'video', expectedSection: 'media-promo' },
  { sourceText: 'The official gameplay trailer is now available.', expectedCategory: 'trailer', expectedSection: 'media-promo' },
  { sourceText: 'Join the developer broadcast live on Twitch.', expectedCategory: 'broadcast', expectedSection: 'media-promo' },
  { sourceText: 'Battlestate Games is attending Gamescom expo.', expectedCategory: 'expo', expectedSection: 'media-promo' },
  { sourceText: 'The EFT: Arena Cup Series tournament starts Friday.', expectedCategory: 'tournament', expectedSection: 'media-promo' },
  { sourceText: 'The screenshot contest is accepting entries.', expectedCategory: 'contest', expectedSection: 'media-promo' },
  { sourceText: 'Twitch Drops are active during the broadcast.', expectedCategory: 'drops', expectedSection: 'media-promo' },
  { sourceText: 'A 25% discount sale is available on all editions.', expectedCategory: 'sale', expectedSection: 'media-promo' },
];

const NATURALNESS_FIXTURES = CLASSIFICATION_FIXTURES.map((fixture) => ({
  ...fixture,
  requiredFacts: [] as string[],
  prohibitedPhrases: ['기쁜 마음으로 알려드립니다', '놓치지 마세요'],
  requiredTerms: [] as string[],
  maximumSummaryLength: 360,
}));

test('20 representative BSG fixtures classify into one section and category', () => {
  assert.equal(CLASSIFICATION_FIXTURES.length, 20);
  for (const fixture of CLASSIFICATION_FIXTURES) {
    const result = classifyOfficialPost(post({ normalizedText: fixture.sourceText }));
    assert.equal(result.category, fixture.expectedCategory, fixture.sourceText);
    assert.equal(result.section, fixture.expectedSection, fixture.sourceText);
  }
});

test('20 naturalness fixtures carry fact, prohibited phrase, glossary, and length contracts', () => {
  assert.equal(NATURALNESS_FIXTURES.length, 20);
  for (const fixture of NATURALNESS_FIXTURES) {
    assert.ok(Array.isArray(fixture.requiredFacts));
    assert.ok(fixture.prohibitedPhrases.length > 0);
    assert.ok(Array.isArray(fixture.requiredTerms));
    assert.ok(fixture.maximumSummaryLength > 0);
  }
});

test('normalization accepts only configured Telegram channel and strips raw HTML', () => {
  const result = normalizeOfficialSourcePost({ source: 'telegram-en', sourceMessageId: '42', sourceUrl: 'https://t.me/escapefromtarkovEN/42',
    channelUsername: '@escapefromtarkovEN', sourceLanguage: 'en', publishedAt: '2026-08-03T00:00:00Z', originalText: '<b>Patch</b> ready<script>bad()</script>' }, ALLOWLIST);
  assert.equal(result.normalizedText, 'Patch ready');
  assert.equal(result.channelUsername, 'escapefromtarkoven');
  assert.throws(() => normalizeOfficialSourcePost({ source: 'telegram-en', sourceMessageId: '1', sourceUrl: 'https://t.me/random/1', sourceLanguage: 'en', publishedAt: '2026-08-03', originalText: 'x' }, ALLOWLIST), (error) => error instanceof NewsSourceValidationError && error.code === 'invalid_channel');
});

test('official web validation rejects third-party hosts and unsafe protocols', () => {
  assert.throws(() => normalizeOfficialSourcePost({ source: 'official-web', sourceMessageId: 'a', sourceUrl: 'https://evil.example/post', sourceLanguage: 'en', publishedAt: '2026-08-03', originalText: 'x' }, ALLOWLIST));
  assert.throws(() => normalizeOfficialSourcePost({ source: 'official-web', sourceMessageId: 'a', sourceUrl: 'http://tarkov.com/post', sourceLanguage: 'en', publishedAt: '2026-08-03', originalText: 'x' }, ALLOWLIST));
});

test('EN and RU copies dedupe by normalized text hash while edits replace the prior revision', () => {
  const en = post();
  const ru = post({ id: 'telegram-ru:escapefromtarkovru:2', source: 'telegram-ru', sourceMessageId: '2', sourceUrl: 'https://t.me/escapefromtarkovRU/2' });
  assert.equal(duplicateReason(en, ru), 'same-text');
  assert.equal(dedupeOfficialPosts([en, ru]).length, 1);
  const edited = post({ editedAt: '2026-08-03T02:00:00Z', normalizedText: 'Patch 1.1.0.0 installation is complete.', textHash: en.textHash });
  assert.equal(dedupeOfficialPosts([en, edited])[0].editedAt, edited.editedAt);
});

test('canonical patch keys merge language copies but do not use title similarity', () => {
  const item = post();
  assert.equal(canonicalStoryKey({ post: item, category: 'patch', game: 'eft' }), 'patch:1.1.0.0:eft');
  const other = post({ normalizedText: 'A similarly titled event', textHash: 'abcdef12', sourceMessageId: '9' });
  assert.notEqual(canonicalStoryKey({ post: other, category: 'event', game: 'eft' }), canonicalStoryKey({ post: item, category: 'patch', game: 'eft' }));
});

function story(overrides: Partial<NewsStory> = {}): NewsStory {
  return { id: 's1', canonicalKey: 'patch:1.1.0.0:eft', section: 'game', category: 'patch', tags: [], game: 'eft', gameModes: [], status: 'scheduled', importance: 'high', sourcePostIds: ['p1'], sourceUrls: ['https://t.me/escapefromtarkovEN/1'], publishedAt: '2026-08-03T00:00:00Z', updatedAt: '2026-08-03T00:00:00Z', ...overrides };
}

test('story updates follow scheduled, active, extended, completed lifecycle and preserve sources', () => {
  let current = story();
  for (const [text, expected] of [['Installation has begun', 'active'], ['Maintenance has been extended', 'extended'], ['Installation is complete', 'completed']] as const) {
    const update = post({ id: `p-${expected}`, sourceMessageId: expected, normalizedText: text, publishedAt: new Date(Date.parse(current.updatedAt) + 1000).toISOString() });
    current = mergeStoryUpdate(current, update);
    assert.equal(current.status, expected);
  }
  assert.equal(current.sourcePostIds.length, 4);
  assert.equal(storyTimeline([post({ normalizedText: 'Installation is complete' }), post({ id: 'p0', publishedAt: '2026-08-02T00:00:00Z', normalizedText: 'Tomorrow installation will begin' })])[0].status, 'scheduled');
  assert.equal(inferStoryStatus('The outage has been resolved'), 'resolved');
});

test('lifecycle keeps active/latest stories and applies terminal retention windows', () => {
  const now = Date.parse('2026-08-10T00:00:00Z');
  assert.equal(lifecycleVisible(story({ status: 'active', publishedAt: '2025-01-01T00:00:00Z' }), now), true);
  assert.equal(lifecycleVisible(story({ category: 'maintenance', status: 'completed', updatedAt: new Date(now - 25 * 60 * 60 * 1000).toISOString() }), now), false);
  assert.equal(lifecycleVisible(story({ category: 'outage', status: 'resolved', updatedAt: new Date(now - 47 * 60 * 60 * 1000).toISOString() }), now), true);
  assert.equal(selectLifecycleFeed(Array.from({ length: 60 }, (_, index) => story({ id: `s${index}`, canonicalKey: `event:${index}`, category: 'event', status: 'active' })), now).length, 50);
});

test('URL filter parser falls back safely and matching respects section/category/game/status', () => {
  const parsed = parseNewsFeedFilters({ section: 'bad', category: 'bad', game: 'bad', status: 'bad' }, ['patch']);
  assert.deepEqual(parsed, { section: 'game', category: 'all', game: 'all', status: 'all' });
  assert.equal(matchesNewsFilters(story(), { section: 'game', category: 'patch', game: 'eft', status: 'scheduled' }), true);
  assert.equal(matchesNewsFilters(story(), { section: 'media-promo', category: 'all', game: 'all', status: 'all' }), false);
});

test('translation style and schema checks block cliché, invented facts, and unsupported mode scope', () => {
  const source = post({ normalizedText: 'Patch 1.1.0.0 installation has begun.' });
  const bad = { title: '놀라운 패치 2.0', summary: '기쁜 마음으로 알려드립니다.', facts: [], warnings: [], confidence: 'high' as const, gameModes: ['pve' as const] };
  const style = checkTranslationStyle({ sourceText: source.normalizedText, title: bad.title, summary: bad.summary, facts: [] });
  assert.equal(style.requiresReview, true);
  const validation = validateTranslationDraft({ post: source, draft: bad, section: 'game', category: 'patch' });
  assert.equal(validation.valid, false);
  assert.equal(canAutoPublish({ sourceVerified: true, duplicate: false, classificationConfirmed: true, draft: bad, validation }), false);
});
