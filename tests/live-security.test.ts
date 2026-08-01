import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { authorizeCron } from '../src/lib/live/cron-auth';
import {
  csrfFor,
  decodeSession,
  encodeSession,
  newSessionId,
  type AdminSession,
} from '../src/lib/live/admin-session';
import { errorCode } from '../src/lib/live/collectors';
import { XApiError } from '../src/lib/live/x';
import { decidePublication, linkPost, type PublicationInput } from '../src/lib/live/publish-rules';
import { parseEnvelope, parseExplicitInstant } from '../src/lib/live/interpret-schema';
import { freshnessOf } from '../src/lib/live/feed-freshness';
import { instantToKstInput, kstInputToInstant } from '../src/lib/live/status';

const SECRET = 'a'.repeat(64);
const NOW = Date.parse('2030-05-01T12:00:00.000Z');

// --- cron authorization -----------------------------------------------------

test('the cron endpoint accepts only a correct bearer secret', () => {
  assert.equal(authorizeCron(`Bearer ${SECRET}`, SECRET), true);
  assert.equal(authorizeCron(`Bearer ${SECRET}x`, SECRET), false);
  assert.equal(authorizeCron(`Bearer ${'b'.repeat(64)}`, SECRET), false);
  assert.equal(authorizeCron(SECRET, SECRET), false, 'the Bearer prefix is required');
  assert.equal(authorizeCron(null, SECRET), false);
  assert.equal(authorizeCron('', SECRET), false);
});

test('an unconfigured secret refuses everything rather than allowing everything', () => {
  assert.equal(authorizeCron(`Bearer ${SECRET}`, undefined), false);
  assert.equal(authorizeCron('Bearer ', ''), false);
  assert.equal(authorizeCron(null, undefined), false);
});

// --- admin sessions ---------------------------------------------------------

function session(offsetMs = 60 * 60 * 1000): AdminSession {
  return { id: newSessionId(), expiresAt: NOW + offsetMs };
}

test('a session round-trips and a tampered one is rejected', () => {
  const original = session();
  const cookie = encodeSession(original, SECRET);
  assert.deepEqual(decodeSession(cookie, SECRET, NOW), original);

  const [expires, id, signature] = cookie.split('.');
  assert.equal(decodeSession(`${expires}.${id}.${'0'.repeat(signature.length)}`, SECRET, NOW), null);
  assert.equal(decodeSession(`${NOW + 10 ** 9}.${id}.${signature}`, SECRET, NOW), null, 'expiry is signed');
  assert.equal(decodeSession(`${expires}.deadbeef.${signature}`, SECRET, NOW), null, 'id is signed');
  assert.equal(decodeSession(cookie, 'a different secret', NOW), null);
  assert.equal(decodeSession('garbage', SECRET, NOW), null);
  assert.equal(decodeSession(undefined, SECRET, NOW), null);
  assert.equal(decodeSession(cookie, undefined, NOW), null);
});

test('an expired session is simply not a session', () => {
  const cookie = encodeSession(session(-1000), SECRET);
  assert.equal(decodeSession(cookie, SECRET, NOW), null);
  // Valid a moment before it expires, invalid at the boundary.
  const edge = session(0);
  assert.equal(decodeSession(encodeSession(edge, SECRET), SECRET, NOW - 1)?.id, edge.id);
  assert.equal(decodeSession(encodeSession(edge, SECRET), SECRET, NOW), null);
});

test('a CSRF token is bound to its session and cannot be replayed', () => {
  const a = session();
  const b = session();
  assert.equal(csrfFor(a, SECRET), csrfFor(a, SECRET), 'stable for the same session');
  assert.notEqual(csrfFor(a, SECRET), csrfFor(b, SECRET));
  assert.notEqual(csrfFor(a, SECRET), csrfFor(a, 'other secret'));
});

// --- error and log hygiene --------------------------------------------------

test('an upstream error message never reaches the run log', () => {
  assert.equal(errorCode(new Error('401 Unauthorized: Bearer AAAA.BBBB')), 'collector_error');
  assert.equal(errorCode(new Error('boom')), 'collector_error');
  assert.equal(errorCode('a string'), 'collector_error');
  // Our own classified codes do pass through — that is the point of them.
  assert.equal(errorCode(new XApiError('rate_limited', 429)), 'x_rate_limited_429');
  assert.equal(errorCode(new Error('telegram_not_implemented')), 'telegram_not_implemented');
});

test('no secret-bearing module can be pulled into a client bundle', () => {
  for (const file of [
    'src/lib/live/x.ts',
    'src/lib/live/interpret.ts',
    'src/lib/live/config.ts',
    'src/lib/live/admin-auth.ts',
    'src/lib/live/collectors.ts',
    'src/lib/live/pipeline.ts',
    'src/lib/live/db/sql.ts',
  ]) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    const reads =
      source.includes('process.env') || source.includes('liveConfig') || source.includes("from './config'");
    if (!reads) continue;
    assert.ok(
      source.startsWith("import 'server-only'") || file === 'src/lib/live/x.ts',
      `${file} reads configuration but is not server-only`,
    );
  }
  // x.ts is the exception by design: it takes the token as an argument so its
  // logic stays testable, and therefore must not read the environment itself.
  const x = readFileSync(join(process.cwd(), 'src/lib/live/x.ts'), 'utf8');
  assert.ok(!x.includes('process.env'), 'x.ts must never read a credential itself');
});

test('the news read path cannot reach a metered API', () => {
  const feed = readFileSync(join(process.cwd(), 'src/lib/live/feed.ts'), 'utf8');
  const sources = readFileSync(join(process.cwd(), 'src/lib/live/sources.ts'), 'utf8');
  const page = readFileSync(join(process.cwd(), 'src/app/[locale]/news/page.tsx'), 'utf8');

  for (const [name, source] of [
    ['feed.ts', feed],
    ['sources.ts', sources],
    ['news/page.tsx', page],
  ] as const) {
    assert.ok(!/from '\.\/x'|from '@\/lib\/live\/x'/.test(source), `${name} imports the X collector`);
    assert.ok(
      !/from '\.\/interpret'|from '@\/lib\/live\/interpret'/.test(source),
      `${name} imports the interpreter`,
    );
    assert.ok(
      !/from '\.\/collectors'|from '\.\/pipeline'/.test(source),
      `${name} imports the collection pipeline`,
    );
  }
});

test('fixtures never default on in a production build', () => {
  const config = readFileSync(join(process.cwd(), 'src/lib/live/config.ts'), 'utf8');
  assert.ok(
    config.includes("flag('LIVE_FIXTURES', process.env.NODE_ENV !== 'production')"),
    'LIVE_FIXTURES must default to off in production',
  );
});

// --- what a machine may assert ---------------------------------------------

function decision(overrides: Partial<PublicationInput> = {}) {
  return decidePublication({
    source: 'steam',
    reliability: 'official_confirmed',
    category: 'announcement',
    intent: 'start',
    hasWindow: false,
    windowEvidenced: true,
    requiresReview: false,
    interpreted: true,
    ...overrides,
  });
}

test('only an unambiguous official post auto-publishes', () => {
  assert.equal(decision().reviewStatus, 'auto_published');
  assert.equal(decision({ source: 'nikita_x' }).reviewStatus, 'pending_review');
  assert.equal(decision({ reliability: 'official_statement' }).reviewStatus, 'pending_review');
  assert.equal(decision({ intent: 'teaser' }).reviewStatus, 'pending_review');
  assert.equal(decision({ requiresReview: true }).reviewStatus, 'pending_review');
  assert.equal(
    decision({ hasWindow: true, windowEvidenced: false }).reviewStatus,
    'pending_review',
    'a claimed schedule with no source text behind it waits for a human',
  );
  assert.equal(decision({ hasWindow: true, windowEvidenced: true }).reviewStatus, 'auto_published');
  assert.equal(
    decision({ intent: 'unknown', category: 'event' }).reviewStatus,
    'pending_review',
    'an event post whose intent is unclear waits',
  );
  assert.equal(
    decision({ intent: 'unknown', category: 'event', interpreted: false }).reviewStatus,
    'auto_published',
    'but an absent interpretation is not itself a red flag',
  );
});

test('a developer post cannot be auto-published by any combination of flags', () => {
  for (const intent of ['start', 'update', 'end', 'patch', 'maintenance', 'unknown'] as const) {
    assert.equal(
      decision({ source: 'nikita_x', reliability: 'official_confirmed', intent }).reviewStatus,
      'pending_review',
    );
  }
});

// --- event linking ----------------------------------------------------------

const candidate = {
  id: 'evt-1',
  title: 'Weekend double experience event',
  contentHashes: ['hash-1'],
  urls: ['https://example.invalid/a'],
  publishedAt: new Date(NOW - 3600_000).toISOString(),
  maps: ['Customs'],
  bosses: [],
  gameModes: ['pvp'],
};

function subject(overrides: Partial<Parameters<typeof linkPost>[0]> = {}) {
  return {
    title: 'Weekend double experience event',
    contentHash: 'hash-2',
    url: null,
    publishedAt: new Date(NOW).toISOString(),
    maps: [],
    bosses: [],
    gameModes: [],
    intent: 'start' as const,
    ...overrides,
  };
}

test('the same announcement from a second source joins the existing event', () => {
  assert.deepEqual(linkPost(subject({ contentHash: 'hash-1' }), [candidate]), {
    kind: 'same',
    eventId: 'evt-1',
    role: 'confirmation',
  });
  assert.deepEqual(linkPost(subject({ url: 'https://example.invalid/a' }), [candidate]), {
    kind: 'same',
    eventId: 'evt-1',
    role: 'confirmation',
  });
  assert.deepEqual(linkPost(subject(), [candidate]), { kind: 'same', eventId: 'evt-1', role: 'confirmation' });
});

test('an unrelated post starts its own event', () => {
  assert.deepEqual(linkPost(subject({ title: 'Server maintenance tonight' }), [candidate]), { kind: 'new' });
  assert.deepEqual(linkPost(subject(), []), { kind: 'new' });
  // Too old to be the same announcement.
  assert.deepEqual(
    linkPost(subject({ publishedAt: new Date(NOW + 10 * 86_400_000).toISOString() }), [candidate]),
    { kind: 'new' },
  );
});

test('an end notice is only auto-attached on an exact match, never on a guess', () => {
  assert.deepEqual(linkPost(subject({ intent: 'end', contentHash: 'hash-1' }), [candidate]), {
    kind: 'same',
    eventId: 'evt-1',
    role: 'end',
  });
  // Same wording, different post: a candidate for the operator, not a decision.
  assert.deepEqual(linkPost(subject({ intent: 'end' }), [candidate]), {
    kind: 'review',
    eventId: 'evt-1',
    role: 'end',
  });
  assert.deepEqual(linkPost(subject({ intent: 'update', maps: ['Customs'], title: 'x y z' }), [candidate]), {
    kind: 'review',
    eventId: 'evt-1',
    role: 'update',
  });
});

// --- time discipline --------------------------------------------------------

test('only an explicit, zoned timestamp is accepted', () => {
  assert.equal(parseExplicitInstant('2030-05-01T12:00:00Z'), '2030-05-01T12:00:00.000Z');
  assert.equal(parseExplicitInstant('2030-05-01T21:00+09:00'), '2030-05-01T12:00:00.000Z');
  assert.equal(parseExplicitInstant('2030-05-01 21:00:00+0900'), '2030-05-01T12:00:00.000Z');
  // No timezone: rejected outright rather than assumed to be KST.
  assert.equal(parseExplicitInstant('2030-05-01T21:00:00'), null);
  assert.equal(parseExplicitInstant('2030-05-01'), null);
  assert.equal(parseExplicitInstant('this weekend'), null);
  assert.equal(parseExplicitInstant(null), null);
});

test('a model-reported time survives only with a quote that is really in the source', () => {
  const source = 'The event runs until 2030-05-08T23:59:00Z. Do not miss it.';
  const good = parseEnvelope(
    JSON.stringify({
      ko: { summary: '요약', playerImpact: '영향', recommendedAction: '' },
      endsAt: {
        value: '2030-05-08T23:59:00Z',
        evidenceText: 'runs until 2030-05-08T23:59:00Z',
        confidence: 'high',
      },
      eventIntent: 'start',
      requiresReview: false,
    }),
    source,
  );
  assert.equal(good.endsAt.value, '2030-05-08T23:59:00.000Z');

  const fabricated = parseEnvelope(
    JSON.stringify({
      ko: { summary: '요약' },
      endsAt: { value: '2030-05-08T23:59:00Z', evidenceText: 'ends next Sunday at midnight', confidence: 'high' },
      requiresReview: false,
    }),
    source,
  );
  assert.equal(fabricated.endsAt.value, null, 'the quote is not in the source, so the time is discarded');

  const unquoted = parseEnvelope(
    JSON.stringify({ ko: { summary: '요약' }, endsAt: { value: '2030-05-08T23:59:00Z' } }),
    source,
  );
  assert.equal(unquoted.endsAt.value, null, 'no quote, no time');
});

test('the model can raise a review flag but never clear one', () => {
  const source = 'Something is coming.';
  const teaser = parseEnvelope(
    JSON.stringify({ ko: { summary: 's' }, eventIntent: 'teaser', requiresReview: false }),
    source,
  );
  assert.equal(teaser.requiresReview, true);

  const ambiguous = parseEnvelope(
    JSON.stringify({ ko: { summary: 's' }, requiresReview: false, ambiguity: ['mode unclear'] }),
    source,
  );
  assert.equal(ambiguous.requiresReview, true);
});

test('a malformed or empty envelope is rejected rather than published', () => {
  assert.throws(() => parseEnvelope('not json', 'source'));
  assert.throws(() => parseEnvelope('[1,2,3]', 'source'));
  assert.throws(() => parseEnvelope('{"gameModes":["pvp"]}', 'source'), /no localized text/);
  // Fenced JSON is tolerated — the provider adds fences despite being told not to.
  const fenced = parseEnvelope('```json\n{"ko":{"summary":"요약"},"gameModes":["pve","nonsense"]}\n```', 's');
  assert.equal(fenced.locales.ko?.summary, '요약');
  assert.deepEqual(fenced.gameModes, ['pve']);
});

test('an operator’s KST input round-trips and refuses nonsense', () => {
  assert.equal(kstInputToInstant('2030-05-01T21:00'), '2030-05-01T12:00:00.000Z');
  assert.equal(kstInputToInstant('2030-05-01T21:00:00'), '2030-05-01T12:00:00.000Z');
  assert.equal(kstInputToInstant('2030-05-01T12:00:00Z'), '2030-05-01T12:00:00.000Z');
  assert.equal(kstInputToInstant(''), null);
  assert.equal(kstInputToInstant('later'), null);
  assert.equal(instantToKstInput('2030-05-01T12:00:00.000Z'), '2030-05-01T21:00');
  assert.equal(instantToKstInput(null), '');
});

// --- freshness --------------------------------------------------------------

function health(overrides: Partial<Parameters<typeof freshnessOf>[0][number]> = {}) {
  return {
    key: 'steam',
    source: 'steam' as const,
    account: null,
    enabled: true,
    lastSuccessAt: new Date(NOW - 60_000).toISOString(),
    lastErrorAt: null,
    errorCode: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

test('"nothing is running" and "we could not check" are different answers', () => {
  const STALE_AFTER = 60 * 60 * 1000;
  assert.equal(freshnessOf([health()], NOW, STALE_AFTER), 'ok');
  assert.equal(
    freshnessOf([health({ lastSuccessAt: new Date(NOW - 3 * STALE_AFTER).toISOString() })], NOW, STALE_AFTER),
    'stale',
  );
  assert.equal(freshnessOf([health({ consecutiveFailures: 3 })], NOW, STALE_AFTER), 'down');
  assert.equal(
    freshnessOf([health(), health({ key: 'official_x', source: 'official_x', consecutiveFailures: 2 })], NOW, STALE_AFTER),
    'partial',
  );
  assert.equal(freshnessOf([health({ lastSuccessAt: null })], NOW, STALE_AFTER), 'never');
  assert.equal(freshnessOf([], NOW, STALE_AFTER), 'never');
  // A disabled source is a deployment choice, not a fault.
  assert.equal(freshnessOf([health(), health({ key: 'x', enabled: false, lastSuccessAt: null })], NOW, STALE_AFTER), 'ok');
});
