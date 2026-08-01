import type { Locale } from '@/i18n/routing';
import type { RawPost } from './normalize';

/**
 * Seed data for developing and reviewing the board with no credentials at
 * all. Enabled by `LIVE_FIXTURES` (default on outside production, never
 * silently on in production — see `config.ts`).
 *
 * Every timestamp is relative to "now", and every event is invented. Pinning
 * a real, dated event here would make the board look wrong the moment that
 * event ended, and would make any test built on it a time bomb.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function iso(offsetMs: number, now: number): string {
  return new Date(now + offsetMs).toISOString();
}

type Text = Partial<Record<Locale, { title: string; content: string }>> & {
  ko: { title: string; content: string };
};

function pick(text: Text, locale: Locale) {
  return text[locale] ?? text.en ?? text.ko;
}

export function fixturePosts(locale: Locale, now = Date.now()): RawPost[] {
  const entry = (
    postId: string,
    source: RawPost['source'],
    text: Text,
    publishedOffset: number,
    overrides?: Record<string, unknown>,
  ): RawPost => ({
    source,
    account: source === 'nikita_x' ? '@nikgeneburn' : source === 'official_x' ? '@tarkov' : null,
    postId,
    url: source === 'manual' ? null : `https://example.invalid/${postId}`,
    title: pick(text, locale).title,
    content: pick(text, locale).content,
    publishedAt: iso(publishedOffset, now),
    translated: null,
    overrides: overrides ?? null,
  });

  return [
    // 1. Official, confirmed, running now, with a real window.
    entry(
      'fixture-xp-event',
      'manual',
      {
        ko: {
          title: '주말 경험치 2배 이벤트',
          content:
            '주말 동안 모든 레이드에서 획득하는 경험치가 2배로 적용됩니다. PvP와 PvE 모두에 적용되며, 아레나는 제외됩니다.',
        },
        en: {
          title: 'Weekend double experience event',
          content:
            'Experience gained in every raid is doubled for the weekend. Applies to PvP and PvE; Arena is not included.',
        },
        zh: {
          title: '周末双倍经验活动',
          content: '周末期间所有战局获得的经验翻倍。适用于 PvP 与 PvE，不含 Arena。',
        },
      },
      -2 * DAY,
      {
        category: 'event',
        reliability: 'official_confirmed',
        reviewStatus: 'reviewed',
        gameModes: ['pvp', 'pve'],
        affects: ['xp'],
        startsAt: iso(-2 * DAY, now),
        endsAt: iso(3 * DAY, now),
        summary: '주말 동안 모든 레이드 경험치가 2배가 됩니다.',
        playerImpact: '레벨업과 스킬 성장 속도가 크게 빨라집니다.',
        recommendedAction: '경험치 보상이 큰 퀘스트를 이 기간에 처리하세요.',
      },
    ),
    // 2. Official event with no confirmed end — must never be given a guessed one.
    entry(
      'fixture-open-ended',
      'manual',
      {
        ko: {
          title: '보스 등장 확률 상향 적용 중',
          content: '일부 맵의 보스 등장 확률이 상향되었습니다. 종료 일정은 공지되지 않았습니다.',
        },
        en: {
          title: 'Increased boss appearance rates',
          content: 'Boss appearance rates are raised on several maps. No end date has been announced.',
        },
        zh: { title: '首领出现概率提升中', content: '部分地图的首领出现概率已提升，尚未公布结束时间。' },
      },
      -1 * DAY,
      {
        category: 'event',
        reliability: 'official_confirmed',
        reviewStatus: 'reviewed',
        gameModes: ['pvp'],
        affects: ['boss', 'map'],
        startsAt: iso(-1 * DAY, now),
        endsAt: null,
      },
    ),
    // 3. Scheduled maintenance, not started yet.
    entry(
      'fixture-maintenance',
      'manual',
      {
        ko: {
          title: '서버 정기 점검 예정',
          content: '서버 점검이 예정되어 있습니다. 점검 중에는 접속할 수 없습니다.',
        },
        en: {
          title: 'Scheduled server maintenance',
          content: 'Server maintenance is scheduled. The game will be unavailable during the work.',
        },
        zh: { title: '服务器定期维护预告', content: '服务器将进行维护，维护期间无法登录。' },
      },
      -3 * HOUR,
      {
        category: 'maintenance',
        reliability: 'official_confirmed',
        reviewStatus: 'reviewed',
        gameModes: ['pvp', 'pve', 'arena'],
        affects: ['server'],
        startsAt: iso(8 * HOUR, now),
        endsAt: iso(11 * HOUR, now),
      },
    ),
    // 4. Ambiguous developer hint — never auto-published as fact.
    entry(
      'fixture-dev-hint',
      'nikita_x',
      {
        ko: { title: 'Something is coming to the swamps…', content: 'Something is coming to the swamps… 👀' },
        en: { title: 'Something is coming to the swamps…', content: 'Something is coming to the swamps… 👀' },
        zh: { title: 'Something is coming to the swamps…', content: 'Something is coming to the swamps… 👀' },
      },
      -5 * HOUR,
    ),
    // 5. Already over.
    entry(
      'fixture-ended-event',
      'manual',
      {
        ko: { title: '지난 상인 할인 이벤트', content: '모든 상인의 판매 가격이 할인되었던 이벤트입니다.' },
        en: { title: 'Past trader discount event', content: 'All traders sold their stock at a discount.' },
        zh: { title: '往期商人折扣活动', content: '所有商人商品曾以折扣价出售。' },
      },
      -10 * DAY,
      {
        category: 'event',
        reliability: 'official_confirmed',
        reviewStatus: 'reviewed',
        gameModes: ['pvp'],
        affects: ['trader', 'item'],
        startsAt: iso(-10 * DAY, now),
        endsAt: iso(-3 * DAY, now),
      },
    ),
    // 6. Official post with no translation yet — renders as original text.
    entry(
      'fixture-untranslated',
      'official_x',
      {
        ko: {
          title: 'Technical work on the authorization servers is in progress',
          content: 'Technical work on the authorization servers is in progress. We will update you shortly.',
        },
        en: {
          title: 'Technical work on the authorization servers is in progress',
          content: 'Technical work on the authorization servers is in progress. We will update you shortly.',
        },
        zh: {
          title: 'Technical work on the authorization servers is in progress',
          content: 'Technical work on the authorization servers is in progress. We will update you shortly.',
        },
      },
      -90 * 60 * 1000,
    ),
    // 7. The same announcement as #1, from a second account — must merge into
    // one card rather than appearing twice.
    entry(
      'fixture-xp-event-mirror',
      'official_x',
      {
        ko: {
          title: '주말 경험치 2배 이벤트',
          content: '주말 동안 모든 레이드에서 획득하는 경험치가 2배로 적용됩니다.',
        },
        en: {
          title: 'Weekend double experience event',
          content: 'Experience gained in every raid is doubled for the weekend.',
        },
        zh: { title: '周末双倍经验活动', content: '周末期间所有战局获得的经验翻倍。' },
      },
      -2 * DAY + HOUR,
    ),
  ];
}
