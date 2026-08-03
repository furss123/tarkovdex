import assert from 'node:assert/strict';
import test from 'node:test';
import { collectFrom, type CollectableAdapter } from '../src/lib/live/collect';
import { fixturePosts } from '../src/lib/live/fixtures';
import { parseInterpretation, EMPTY_INTERPRETATION } from '../src/lib/live/interpret-schema';
import {
  classify,
  contentHash,
  decideReview,
  detectModes,
  mergeEntries,
  reliabilityFor,
  toLiveEntry,
  type RawPost,
} from '../src/lib/live/normalize';
import {
  computeEventStatus,
  latestPublicFeedEntries,
  matchesFilter,
  newsEntryAnchorId,
  publicFeedEntries,
  remainingMs,
  situationEntries,
  sortLiveEntries,
} from '../src/lib/live/status';
import { sanitizePublicFeed } from '../src/lib/live/feed';
import { formatKst } from '../src/lib/format';
import type { LiveEntry, NewsSource } from '../src/types/live';

/**
 * Everything here uses invented content at offsets from an injected `now`.
 * Pinning a real event would make these tests expire the day that event does.
 */
const NOW = Date.parse('2030-05-01T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function entry(overrides: Partial<LiveEntry> = {}): LiveEntry {
  const post: RawPost = {
    source: 'manual',
    account: null,
    postId: 'test',
    url: null,
    title: 'Test post',
    content: 'Body',
    publishedAt: new Date(NOW - HOUR).toISOString(),
  };
  return { ...toLiveEntry(post, new Date(NOW).toISOString()), ...overrides };
}

// --- event status -----------------------------------------------------------

test('event status covers every window case without inventing one', () => {
  const window = (startOffset: number | null, endOffset: number | null) =>
    computeEventStatus(
      {
        startsAt: startOffset == null ? null : new Date(NOW + startOffset).toISOString(),
        endsAt: endOffset == null ? null : new Date(NOW + endOffset).toISOString(),
        manualFields: [],
      },
      NOW,
    );

  assert.equal(window(2 * DAY, 5 * DAY), 'scheduled');
  assert.equal(window(-1 * DAY, 5 * DAY), 'active');
  assert.equal(window(-1 * DAY, 2 * HOUR), 'ending_soon');
  assert.equal(window(-5 * DAY, -1 * DAY), 'ended');
  // Started, no confirmed end: still active — never silently ended.
  assert.equal(window(-1 * DAY, null), 'active');
  // Nothing confirmed at all: unknown, never a guess.
  assert.equal(window(null, null), 'unknown');
});

test('ending-soon threshold is configurable and exclusive of longer windows', () => {
  const target = { startsAt: new Date(NOW - DAY).toISOString(), endsAt: new Date(NOW + 5 * HOUR).toISOString(), manualFields: [] };
  assert.equal(computeEventStatus(target, NOW, HOUR), 'active');
  assert.equal(computeEventStatus(target, NOW, 10 * HOUR), 'ending_soon');
});

test('unparseable dates fall back to unknown instead of a wrong countdown', () => {
  const broken = { startsAt: 'not-a-date', endsAt: 'also-not-a-date', manualFields: [] };
  assert.equal(computeEventStatus(broken, NOW), 'unknown');
  assert.equal(remainingMs(broken, 'active', NOW), null);
});

test('a human-set status overrides the computed one', () => {
  const target = {
    startsAt: new Date(NOW - DAY).toISOString(),
    endsAt: new Date(NOW + DAY).toISOString(),
    manualFields: ['status'],
    status: 'ended' as const,
  };
  assert.equal(computeEventStatus(target, NOW), 'ended');
});

test('countdown targets the start before an event and the end during it', () => {
  const target = {
    startsAt: new Date(NOW + 2 * HOUR).toISOString(),
    endsAt: new Date(NOW + 6 * HOUR).toISOString(),
  };
  assert.equal(remainingMs(target, 'scheduled', NOW), 2 * HOUR);
  assert.equal(remainingMs(target, 'active', NOW), 6 * HOUR);
  assert.equal(remainingMs({ startsAt: null, endsAt: null }, 'active', NOW), null);
});

// --- Korean time ------------------------------------------------------------

test('times render in Asia/Seoul regardless of the machine timezone', () => {
  // 2030-05-01T12:00Z is 2030-05-01 21:00 KST (UTC+9, no DST).
  const rendered = formatKst('2030-05-01T12:00:00.000Z', 'en');
  assert.match(rendered ?? '', /May 1, 2030/);
  assert.match(rendered ?? '', /9:00/);
  assert.match(rendered ?? '', /KST$/);
  // A date crossing midnight in KST proves the zone is applied, not the offset.
  assert.match(formatKst('2030-05-01T16:00:00.000Z', 'en') ?? '', /May 2, 2030/);
  assert.equal(formatKst('nonsense', 'ko'), null);
  assert.equal(formatKst(null, 'ko'), null);
});

// --- normalization ----------------------------------------------------------

test('adapter output normalizes into a complete entry', () => {
  const normalized = toLiveEntry(
    {
      source: 'steam',
      account: null,
      postId: 'guid-1',
      url: 'https://example.invalid/1',
      title: 'Patch 9.9.9.9',
      content: 'Fixed a thing.',
      publishedAt: new Date(NOW).toISOString(),
      translated: { title: '패치 9.9.9.9', content: '문제를 수정했습니다.' },
    },
    new Date(NOW).toISOString(),
  );

  assert.equal(normalized.id, 'steam:guid-1');
  assert.equal(normalized.category, 'patch');
  assert.equal(normalized.title, '패치 9.9.9.9');
  assert.equal(normalized.originalTitle, 'Patch 9.9.9.9');
  assert.equal(normalized.translated, true);
  // No adapter may produce an event window.
  assert.equal(normalized.startsAt, null);
  assert.equal(normalized.endsAt, null);
});

test('a localized title over an English body reports the body as untranslated', () => {
  // The exact production shape: `news-zh.json` carries a reviewed Chinese title
  // for "Expansions Hub 与 TarCoin" and "版本 1.0.6.0" over the untouched
  // English body. Flagging those as translated suppressed the untranslated
  // notice on /zh/news.
  const normalized = toLiveEntry(
    {
      source: 'steam',
      account: null,
      postId: 'guid-title-only',
      url: null,
      title: 'Version 1.0.6.0',
      content: 'The update is now available.',
      publishedAt: new Date(NOW).toISOString(),
      translated: { title: '版本 1.0.6.0', content: 'The update is now available.' },
      contentTranslated: false,
    },
    new Date(NOW).toISOString(),
  );

  // The reviewed title is still what renders — only the flag becomes honest.
  assert.equal(normalized.title, '版本 1.0.6.0');
  assert.equal(normalized.content, 'The update is now available.');
  assert.equal(normalized.translated, false);
  assert.equal(normalized.reviewStatus, 'pending_review');
});

test('a genuinely translated body still reports translated', () => {
  const normalized = toLiveEntry(
    {
      source: 'steam',
      account: null,
      postId: 'guid-full',
      url: null,
      title: '版本 1.0.6.0',
      content: 'The update is now available.',
      publishedAt: new Date(NOW).toISOString(),
      translated: { title: '版本 1.0.6.0', content: '更新现已上线。' },
      contentTranslated: true,
    },
    new Date(NOW).toISOString(),
  );
  assert.equal(normalized.translated, true);
});

test('an entry with no localization at all is untranslated', () => {
  const normalized = toLiveEntry(
    {
      source: 'steam',
      account: null,
      postId: 'guid-none',
      url: null,
      title: 'Version 1.0.6.0',
      content: 'The update is now available.',
      publishedAt: new Date(NOW).toISOString(),
      contentTranslated: false,
    },
    new Date(NOW).toISOString(),
  );
  assert.equal(normalized.translated, false);
});

test('an adapter that reports no content flag falls back to the translated block', () => {
  const normalized = toLiveEntry(
    {
      source: 'manual',
      account: null,
      postId: 'curated-translated',
      url: null,
      title: 'Event',
      content: 'Body',
      publishedAt: new Date(NOW).toISOString(),
      translated: { title: '이벤트', content: '본문' },
    },
    new Date(NOW).toISOString(),
  );
  assert.equal(normalized.translated, true);
});

test('classification and reliability map source and wording, not vibes', () => {
  assert.equal(classify('steam', 'Patch 1.2.3.4', ''), 'patch');
  assert.equal(classify('steam', 'Scheduled maintenance', 'servers will be down'), 'maintenance');
  assert.equal(classify('steam', 'Weekend double XP event', ''), 'event');
  assert.equal(classify('nikita_x', 'Patch 1.2.3.4', ''), 'developer_comment');

  assert.equal(reliabilityFor('steam', 'event'), 'official_confirmed');
  assert.equal(reliabilityFor('official_x', 'patch'), 'official_confirmed');
  assert.equal(reliabilityFor('official_x', 'event'), 'official_statement');
  assert.equal(reliabilityFor('nikita_x', 'announcement'), 'developer_hint');
  assert.equal(reliabilityFor('manual', 'event'), 'tarkovdex_inference');
});

test('game modes are only reported when the text names them', () => {
  assert.deepEqual(detectModes('PvE loot changes', ''), ['pve']);
  assert.deepEqual(detectModes('Arena season 3', ''), ['arena']);
  assert.deepEqual(detectModes('Something is coming', 'soon'), ['unknown']);
});

test('external entries always wait for approval and manual entries are reviewed', () => {
  assert.equal(decideReview('official_confirmed', false, false), 'pending_review');
  // A claimed event window that no human entered never auto-publishes.
  assert.equal(decideReview('official_confirmed', true, false), 'pending_review');
  assert.equal(decideReview('developer_hint', false, false), 'pending_review');
  assert.equal(decideReview('tarkovdex_inference', false, false), 'pending_review');
  assert.equal(decideReview('developer_hint', true, true), 'reviewed');
});

// --- dedup / merge ----------------------------------------------------------

test('the same post collected twice yields one entry', () => {
  const post: RawPost = {
    source: 'steam',
    account: null,
    postId: 'guid-1',
    url: 'https://example.invalid/1',
    title: 'Patch 9.9.9.9',
    content: 'Fixed a thing.',
    publishedAt: new Date(NOW).toISOString(),
  };
  const merged = mergeEntries([
    toLiveEntry(post, new Date(NOW).toISOString()),
    toLiveEntry(post, new Date(NOW).toISOString()),
  ]);
  assert.equal(merged.length, 1);
});

test('one announcement mirrored across sources merges into the highest-priority card', () => {
  const at = (offset: number) => new Date(NOW + offset).toISOString();
  const steam = toLiveEntry(
    {
      source: 'steam',
      account: null,
      postId: 'steam-1',
      url: 'https://example.invalid/steam',
      title: 'Weekend double experience event',
      content: 'Experience gained in every raid is doubled for the weekend.',
      publishedAt: at(-2 * HOUR),
    },
    at(0),
  );
  const tweet = toLiveEntry(
    {
      source: 'official_x',
      account: '@tarkov',
      postId: 'x-1',
      url: 'https://example.invalid/x',
      title: 'Weekend double experience event',
      content: 'Experience gained in every raid is doubled for the weekend!',
      publishedAt: at(-1 * HOUR),
    },
    at(0),
  );

  const merged = mergeEntries([tweet, steam]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, 'steam', 'official Steam post outranks the tweet');
  assert.equal(merged[0].confirmations.length, 1);
  assert.equal(merged[0].confirmations[0].source, 'official_x');
});

test('a confirmed window survives the merge even when the winning source lacks one', () => {
  const at = (offset: number) => new Date(NOW + offset).toISOString();
  const curated = toLiveEntry(
    {
      source: 'manual',
      account: null,
      postId: 'curated-1',
      url: null,
      title: 'Weekend double experience event',
      content: 'Experience is doubled for the weekend.',
      publishedAt: at(-2 * HOUR),
      overrides: { startsAt: at(-1 * DAY), endsAt: at(1 * DAY), reviewStatus: 'reviewed' },
    },
    at(0),
  );
  const tweet = toLiveEntry(
    {
      source: 'official_x',
      account: '@tarkov',
      postId: 'x-2',
      url: 'https://example.invalid/x2',
      title: 'Weekend double experience event',
      content: 'Experience is doubled for the weekend.',
      publishedAt: at(-1 * HOUR),
    },
    at(0),
  );

  const [merged] = mergeEntries([tweet, curated]);
  assert.equal(merged.source, 'manual');
  assert.equal(merged.endsAt, at(1 * DAY));
  assert.equal(computeEventStatus(merged, NOW), 'active');
});

test('unrelated posts are not merged by the near-duplicate rule', () => {
  const at = (offset: number) => new Date(NOW + offset).toISOString();
  const a = toLiveEntry(
    { source: 'steam', account: null, postId: 'a', url: null, title: 'Patch 9.9.9.9', content: 'Fixed a thing.', publishedAt: at(0) },
    at(0),
  );
  const b = toLiveEntry(
    { source: 'steam', account: null, postId: 'b', url: null, title: 'Halloween event begins', content: 'Cultists roam the maps.', publishedAt: at(-HOUR) },
    at(0),
  );
  assert.equal(mergeEntries([a, b]).length, 2);
});

test('content hash ignores punctuation, case and links', () => {
  assert.equal(
    contentHash('Double XP weekend! https://example.invalid/a'),
    contentHash('double xp weekend https://example.invalid/b'),
  );
  assert.notEqual(contentHash('Double XP weekend'), contentHash('Triple XP weekend'));
});

test('manual edits are recorded and never overwritten by derived values', () => {
  const curated = toLiveEntry(
    {
      source: 'manual',
      account: null,
      postId: 'curated-2',
      url: null,
      // Wording that the rule-based classifier would call "maintenance".
      title: 'Servers will be down',
      content: 'maintenance',
      publishedAt: new Date(NOW).toISOString(),
      overrides: { category: 'event', summary: '사람이 직접 적은 요약', reviewStatus: 'reviewed' },
    },
    new Date(NOW).toISOString(),
  );

  assert.equal(curated.category, 'event');
  assert.equal(curated.summary, '사람이 직접 적은 요약');
  assert.deepEqual(curated.manualFields.sort(), ['category', 'reviewStatus', 'summary']);
});

// --- ordering / selection ---------------------------------------------------

test('the situation panel shows only reviewed, current items', () => {
  const at = (offset: number) => new Date(NOW + offset).toISOString();
  const active = entry({
    id: 'active',
    startsAt: at(-DAY),
    endsAt: at(DAY),
    reviewStatus: 'reviewed',
    manualFields: ['startsAt', 'endsAt'],
  });
  const unreviewed = entry({
    id: 'unreviewed',
    startsAt: at(-DAY),
    endsAt: at(DAY),
    reviewStatus: 'pending_review',
    manualFields: ['startsAt', 'endsAt'],
  });
  const over = entry({
    id: 'over',
    startsAt: at(-10 * DAY),
    endsAt: at(-DAY),
    reviewStatus: 'reviewed',
    manualFields: ['startsAt', 'endsAt'],
  });
  const oldPatch = entry({
    id: 'old-patch',
    category: 'patch',
    reviewStatus: 'reviewed',
    publishedAt: at(-30 * DAY),
  });

  // The current patch always belongs on the panel ("which version am I on");
  // an unreviewed claim and a finished event never do.
  const shown = situationEntries([active, unreviewed, over, oldPatch], NOW).map((item) => item.id);
  assert.deepEqual(shown, ['active', 'old-patch']);
  assert.deepEqual(situationEntries([], NOW), []);

  // Only one patch card, the newest.
  const newerPatch = entry({ id: 'new-patch', category: 'patch', reviewStatus: 'reviewed', publishedAt: at(-DAY) });
  assert.deepEqual(situationEntries([oldPatch, newerPatch], NOW).map((item) => item.id), ['new-patch']);
});

test('feed order puts imminent endings first and finished events last', () => {
  const at = (offset: number) => new Date(NOW + offset).toISOString();
  const ordered = sortLiveEntries(
    [
      entry({ id: 'ended', startsAt: at(-10 * DAY), endsAt: at(-DAY), manualFields: ['endsAt'] }),
      entry({ id: 'dev', category: 'developer_comment', publishedAt: at(-HOUR) }),
      entry({ id: 'ending', startsAt: at(-DAY), endsAt: at(2 * HOUR), manualFields: ['endsAt'] }),
      entry({ id: 'scheduled', startsAt: at(DAY), endsAt: at(2 * DAY), manualFields: ['startsAt'] }),
      entry({ id: 'active', startsAt: at(-DAY), endsAt: at(5 * DAY), manualFields: ['endsAt'] }),
      entry({ id: 'outage', category: 'server_status', publishedAt: at(-2 * HOUR) }),
    ],
    NOW,
  ).map((item) => item.id);

  assert.deepEqual(ordered, ['ending', 'active', 'scheduled', 'outage', 'dev', 'ended']);
});

test('the public feed selector exposes only approved entries', () => {
  const at = (offset: number) => new Date(NOW + offset).toISOString();
  const selected = publicFeedEntries(
    [
      entry({ id: 'newer', publishedAt: at(-HOUR), reviewStatus: 'reviewed' }),
      entry({
        id: 'pending-event',
        startsAt: at(-DAY),
        endsAt: at(DAY),
        manualFields: ['endsAt'],
        publishedAt: at(-DAY),
        reviewStatus: 'pending_review',
      }),
      entry({ id: 'rejected', publishedAt: at(0), reviewStatus: 'rejected' }),
    ],
    NOW,
  ).map((item) => item.id);

  assert.deepEqual(selected, ['newer']);
});

test('the server feed boundary removes pending content before serialization', () => {
  const approved = entry({ id: 'approved', reviewStatus: 'reviewed' });
  const pending = entry({ id: 'pending', reviewStatus: 'pending_review' });
  const sanitized = sanitizePublicFeed({
    entries: [approved, pending],
    degradedSources: [],
    lastCheckedAt: null,
    renderedAt: new Date(NOW).toISOString(),
      freshness: 'ok',
    sources: [],
  });

  assert.deepEqual(sanitized.entries.map((item) => item.id), ['approved']);
});

test('the home preview is newest-first even when an older event is active', () => {
  const at = (offset: number) => new Date(NOW + offset).toISOString();
  const selected = latestPublicFeedEntries([
    entry({
      id: 'older-active-event',
      startsAt: at(-DAY),
      endsAt: at(DAY),
      manualFields: ['endsAt'],
      publishedAt: at(-DAY),
      reviewStatus: 'reviewed',
    }),
    entry({ id: 'new-announcement', publishedAt: at(-HOUR), reviewStatus: 'reviewed' }),
    entry({ id: 'pending-newest', publishedAt: at(0), reviewStatus: 'pending_review' }),
    entry({ id: 'rejected-newest', publishedAt: at(0), reviewStatus: 'rejected' }),
  ]).map((item) => item.id);

  assert.deepEqual(selected, ['new-announcement', 'older-active-event']);
  assert.notEqual(newsEntryAnchorId('steam:one'), newsEntryAnchorId('steam:two'));
});

test('filters select what their label promises', () => {
  const at = (offset: number) => new Date(NOW + offset).toISOString();
  const active = entry({ id: 'a', startsAt: at(-DAY), endsAt: at(DAY), manualFields: ['endsAt'] });
  const dev = entry({ id: 'd', source: 'nikita_x', category: 'developer_comment' });
  const patch = entry({ id: 'p', category: 'patch' });
  const outage = entry({ id: 'o', category: 'maintenance' });

  assert.ok(matchesFilter(active, 'active_events', NOW));
  assert.ok(!matchesFilter(patch, 'active_events', NOW));
  const officialTweet = entry({ id: 'x', source: 'official_x', category: 'announcement' });
  assert.ok(matchesFilter(dev, 'twitter', NOW));
  assert.ok(matchesFilter(officialTweet, 'twitter', NOW));
  assert.ok(!matchesFilter(patch, 'twitter', NOW));
  assert.ok(matchesFilter(patch, 'official', NOW));
  assert.ok(matchesFilter(outage, 'status', NOW));
  assert.ok(!matchesFilter(active, 'ended', NOW));
  for (const item of [active, dev, patch, outage]) assert.ok(matchesFilter(item, 'all', NOW));
});

// --- interpretation schema --------------------------------------------------

test('interpretation output is validated, fenced JSON included', () => {
  const parsed = parseInterpretation(
    '```json\n{"summary":"요약","playerImpact":"영향","recommendedAction":"","gameModes":["pve","bogus","pve"]}\n```',
  );
  assert.equal(parsed.summary, '요약');
  assert.equal(parsed.recommendedAction, null, 'blank fields become null, not empty strings');
  assert.deepEqual(parsed.gameModes, ['pve'], 'invalid modes are dropped, duplicates collapsed');
});

test('a hedging or malformed interpretation is rejected rather than published', () => {
  assert.equal(parseInterpretation('{"summary":"unknown"}').summary, null);
  assert.deepEqual(parseInterpretation('{}'), EMPTY_INTERPRETATION);
  assert.throws(() => parseInterpretation('not json at all'));
  assert.throws(() => parseInterpretation('[1,2,3]'));
});

// --- source isolation -------------------------------------------------------

function adapter(source: NewsSource, options: { enabled?: boolean; fail?: boolean }): CollectableAdapter {
  return {
    source,
    enabled: () => options.enabled !== false,
    fetch: async () => {
      if (options.fail) throw new Error('boom');
      return [
        {
          source,
          account: null,
          postId: `${source}-1`,
          url: null,
          title: `${source} post`,
          content: 'body',
          publishedAt: new Date(NOW).toISOString(),
        },
      ];
    },
  };
}

test('a failing or disabled source never removes another source’s posts', async () => {
  const { posts, degraded } = await collectFrom(
    [
      adapter('steam', {}),
      adapter('official_x', { enabled: false }),
      adapter('official_telegram', { enabled: false }),
      adapter('nikita_x', { fail: true }),
    ],
    'ko',
  );

  assert.deepEqual(
    posts.map((post) => post.source),
    ['steam'],
  );
  // Off-by-configuration is silent; an enabled source that failed is reported.
  assert.deepEqual(degraded, ['nikita_x']);
});

test('every source failing degrades to an empty board, not a thrown page', async () => {
  const { posts, degraded } = await collectFrom([adapter('steam', { fail: true })], 'ko');
  assert.deepEqual(posts, []);
  assert.deepEqual(degraded, ['steam']);
});

// --- fixtures ---------------------------------------------------------------

test('fixtures cover the states the board has to render', () => {
  const now = NOW;
  const entries = mergeEntries(
    fixturePosts('ko', now).map((post) => toLiveEntry(post, new Date(now).toISOString())),
  );

  const byStatus = new Map(entries.map((item) => [item.id, computeEventStatus(item, now)]));
  assert.equal(byStatus.get('manual:fixture-xp-event'), 'active');
  assert.equal(byStatus.get('manual:fixture-maintenance'), 'scheduled');
  assert.equal(byStatus.get('manual:fixture-ended-event'), 'ended');
  assert.equal(byStatus.get('nikita_x:fixture-dev-hint'), 'unknown');

  const openEnded = entries.find((item) => item.id === 'manual:fixture-open-ended');
  assert.equal(openEnded?.endsAt, null, 'an unconfirmed end stays unconfirmed');
  assert.equal(computeEventStatus(openEnded!, now), 'active');

  const hint = entries.find((item) => item.id === 'nikita_x:fixture-dev-hint');
  assert.equal(hint?.reliability, 'developer_hint');
  assert.equal(hint?.reviewStatus, 'pending_review', 'a teaser never auto-publishes');

  // The mirrored announcement merged into the curated one.
  assert.ok(!entries.some((item) => item.id === 'official_x:fixture-xp-event-mirror'));
  const xp = entries.find((item) => item.id === 'manual:fixture-xp-event');
  assert.equal(xp?.confirmations.length, 1);

  // Every locale resolves text, including one with no dedicated translation.
  for (const locale of ['ko', 'en', 'zh'] as const) {
    for (const post of fixturePosts(locale, now)) {
      assert.ok(post.title.length > 0 && post.content.length > 0, `${locale}:${post.postId}`);
    }
  }
});
