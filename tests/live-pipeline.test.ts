import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestDb, withQueryHook, type TestDb } from './helpers/pglite';
import { runIngestion } from '../src/lib/live/pipeline';
import type { SourceCollector } from '../src/lib/live/collectors';
import { contentHash } from '../src/lib/live/normalize';
import { fetchXTimeline } from '../src/lib/live/x';
import { createRepository, type RawSourcePost, type SourceState } from '../src/lib/live/repository';

/**
 * The whole background pipeline against a real Postgres and a fake X, with no
 * page ever rendered. This is the test that proves the point of the rebuild:
 * collection happens on a schedule, the cursor survives, and running it twice
 * does not duplicate anything or re-spend on interpretation.
 */

const at = (offset: number) => new Date(Date.parse('2030-05-01T12:00:00.000Z') + offset).toISOString();

function post(id: string, title: string, body = 'body'): RawSourcePost {
  return {
    source: 'official_x',
    account: '@tarkov',
    postId: id,
    url: `https://example.invalid/${id}`,
    title,
    content: body,
    publishedAt: at(-Number(id) * 1000),
    contentHash: contentHash(`${title} ${body}`),
  };
}

/** A collector wired to the real `fetchXTimeline`, so the cursor round-trip
 * being tested is the production one, not a stand-in. */
function xLikeCollector(pagesByCursor: Record<string, Array<{ id: string; text: string }>>): SourceCollector & {
  seen: string[];
} {
  const seen: string[] = [];
  return {
    seen,
    key: 'official_x:tarkov',
    source: 'official_x',
    account: 'tarkov',
    enabled: () => true,
    collect: async (state: SourceState | null) => {
      const cursor = state?.sinceId ?? '';
      seen.push(cursor);
      const result = await fetchXTimeline(
        {
          source: 'official_x',
          username: 'tarkov',
          userId: state?.externalId ?? null,
          sinceId: state?.sinceId ?? null,
          maxResults: 10,
          maxPages: 1,
          includeReplies: false,
          includeReposts: false,
          includeQuotes: true,
        },
        async (path) => {
          if (path.startsWith('/users/by/username/')) return { data: { id: '999' } };
          return { data: pagesByCursor[cursor] ?? [] };
        },
        contentHash,
      );
      return {
        posts: result.posts,
        requests: result.requests,
        nextState: { externalId: result.userId, sinceId: result.newestId ?? state?.sinceId ?? null },
      };
    },
  };
}

function staticCollector(key: string, posts: RawSourcePost[], fail = false): SourceCollector {
  return {
    key,
    source: posts[0]?.source ?? 'steam',
    account: '',
    enabled: () => true,
    collect: async () => {
      if (fail) throw new Error('boom');
      return { posts, requests: 1 };
    },
  };
}

async function withDb(run: (db: TestDb) => Promise<void>) {
  const db = await createTestDb();
  try {
    await run(db);
  } finally {
    await db.close();
  }
}

test('a cron run Stage-1 auto-publishes a timeless official Steam patch', async () => {
  await withDb(async (db) => {
    const summary = await runIngestion(db.repo, {
      trigger: 'cron',
      collectors: [staticCollector('steam', [{ ...post('1', 'Patch 1.2.3.4'), source: 'steam', account: null }])],
    });

    assert.equal(summary.ok, true);
    assert.equal(summary.locked, false);
    assert.equal(summary.sources[0].newPosts, 1);
    assert.equal(summary.eventsUpserted, 1);

    const [event] = await db.repo.listEvents({ reviewStatus: ['auto_published'] });
    assert.equal(event.category, 'patch');
    assert.equal(event.reliability, 'official_confirmed');
    assert.equal(event.reviewStatus, 'auto_published');
    assert.ok(event.publishedAt);
    assert.equal(event.startsAt ?? null, null, 'no window was invented');
    assert.equal(event.sources.length, 1);

    await db.repo.updateEventFields(
      event.id,
      { reviewStatus: 'reviewed', publishedAt: at(0) },
      { manual: true, actor: 'admin:test' },
    );
    const approved = await db.repo.getEvent(event.id);
    assert.equal(approved?.reviewStatus, 'reviewed');
    assert.equal(approved?.publishedAt, new Date(at(0)).toISOString());
  });
});

test('a second run adds only what is new and never re-creates an event', async () => {
  await withDb(async (db) => {
    const collector = staticCollector('steam', [
      { ...post('1', 'Patch 1.2.3.4'), source: 'steam', account: null },
    ]);
    const first = await runIngestion(db.repo, { trigger: 'cron', collectors: [collector] });
    const second = await runIngestion(db.repo, { trigger: 'cron', collectors: [collector] });

    assert.equal(first.sources[0].newPosts, 1);
    assert.equal(second.sources[0].newPosts, 0);
    assert.equal(second.sources[0].duplicates, 1);
    assert.equal(second.eventsUpserted, 0, 'the post is already on the board');
    assert.equal((await db.repo.listEvents({ limit: 50 })).length, 1);
    assert.equal((await db.repo.listRawPosts(50)).length, 1);
  });
});

test('the X cursor is written to the database and drives the next run', async () => {
  await withDb(async (db) => {
    const collector = xLikeCollector({
      '': [
        { id: '101', text: 'First announcement' },
        { id: '102', text: 'Second announcement' },
      ],
      '102': [{ id: '103', text: 'Third announcement' }],
    });

    await runIngestion(db.repo, { trigger: 'cron', collectors: [collector] });
    const afterFirst = await db.repo.getSourceState('official_x:tarkov');
    assert.equal(afterFirst?.sinceId, '102');
    assert.equal(afterFirst?.externalId, '999');

    const second = await runIngestion(db.repo, { trigger: 'cron', collectors: [collector] });
    assert.deepEqual(collector.seen, ['', '102'], 'the second run resumed from the stored cursor');
    assert.equal(second.sources[0].newPosts, 1);
    assert.equal((await db.repo.listRawPosts(50)).length, 3);

    // A cold start is exactly this: a brand-new repository object reading the
    // same rows.
    const cold = await createTestDb();
    await cold.close();
    assert.equal((await db.repo.getSourceState('official_x:tarkov'))?.sinceId, '103');
  });
});

test('one failing source neither loses another’s posts nor its own cursor', async () => {
  await withDb(async (db) => {
    await db.repo.saveSourceState({
      sourceKey: 'official_x:tarkov',
      sourceType: 'official_x',
      account: 'tarkov',
      sinceId: '500',
      externalId: '999',
    });

    const summary = await runIngestion(db.repo, {
      trigger: 'cron',
      collectors: [
        staticCollector('steam', [{ ...post('1', 'Patch 1.2.3.4'), source: 'steam', account: null }]),
        staticCollector('official_x:tarkov', [post('2', 'anything')], true),
      ],
    });

    assert.equal(summary.ok, false);
    assert.equal(summary.sources[0].ok, true);
    assert.equal(summary.sources[1].ok, false);
    assert.equal(summary.sources[1].errorCode, 'collector_error');
    assert.equal((await db.repo.listRawPosts(50)).length, 1, 'the healthy source still stored its post');

    const state = await db.repo.getSourceState('official_x:tarkov');
    assert.equal(state?.sinceId, '500', 'a failure must not reset the cursor');
    assert.equal(state?.consecutiveFailures, 1);
    assert.ok(state?.nextRetryAt, 'backoff is scheduled');

    const runs = await db.repo.listRuns(10);
    assert.equal(runs.filter((run) => run.ok === false).length, 1);
    assert.equal(runs.filter((run) => run.ok === true).length, 1);
  });
});

test('an interval skip preserves the previous attempt and backoff state', async () => {
  await withDb(async (db) => {
    const lastAttemptAt = at(-60_000);
    const lastErrorAt = at(-30_000);
    const nextRetryAt = at(60 * 60_000);
    await db.repo.saveSourceState({
      sourceKey: 'official_x:tarkov',
      sourceType: 'official_x',
      account: 'tarkov',
      sinceId: '500',
      lastAttemptAt,
      lastError: 'x_rate_limited_429',
      lastErrorAt,
      consecutiveFailures: 2,
      nextRetryAt,
    });
    const collector: SourceCollector = {
      key: 'official_x:tarkov',
      source: 'official_x',
      account: 'tarkov',
      enabled: () => true,
      collect: async () => ({ posts: [], requests: 0, skipped: 'interval' }),
    };

    const summary = await runIngestion(db.repo, { trigger: 'cron', collectors: [collector] });
    assert.equal(summary.sources[0].skipped, 'interval');
    const state = await db.repo.getSourceState('official_x:tarkov');
    assert.equal(state?.lastAttemptAt, new Date(lastAttemptAt).toISOString());
    assert.equal(state?.lastError, 'x_rate_limited_429');
    assert.equal(state?.lastErrorAt, new Date(lastErrorAt).toISOString());
    assert.equal(state?.consecutiveFailures, 2);
    assert.equal(state?.nextRetryAt, new Date(nextRetryAt).toISOString());
    assert.equal(state?.sinceId, '500');
  });
});

test('posts, cursor state and a successful run marker roll back as one unit', async () => {
  await withDb(async (db) => {
    await db.repo.saveSourceState({
      sourceKey: 'official_x:tarkov',
      sourceType: 'official_x',
      account: 'tarkov',
      sinceId: '500',
    });
    let failed = false;
    const faultSql = withQueryHook(db.sql, (text, params) => {
      if (!failed && text.includes('update live_ingestion_runs set') && params[1] === true) {
        failed = true;
        throw new Error('finish_success_failed');
      }
    });
    const faultRepo = createRepository(faultSql);
    const collector: SourceCollector = {
      key: 'official_x:tarkov',
      source: 'official_x',
      account: 'tarkov',
      enabled: () => true,
      collect: async () => ({
        posts: [post('501', 'Atomic announcement')],
        requests: 1,
        nextState: { sinceId: '501' },
      }),
    };

    const summary = await runIngestion(faultRepo, { trigger: 'cron', collectors: [collector] });
    assert.equal(summary.sources[0].ok, false);
    assert.equal(summary.sources[0].newPosts, 0);
    assert.equal((await db.repo.listRawPosts(10)).length, 0);
    const state = await db.repo.getSourceState('official_x:tarkov');
    assert.equal(state?.sinceId, '500');
    assert.equal(state?.consecutiveFailures, 1);
    const [run] = await db.repo.listRuns(10);
    assert.equal(run.ok, false);
    assert.equal(run.newPosts, 0);
  });
});

test('overlapping scheduled invocations refuse the second run without collecting', async () => {
  // Covers GitHub Actions + Vercel Hobby fallback colliding on the same lock.
  await withDb(async (db) => {
    await db.repo.acquireLock('tarkov-live:ingestion', 60_000, 'vercel-daily-fallback');
    const summary = await runIngestion(db.repo, {
      trigger: 'cron',
      collectors: [staticCollector('steam', [{ ...post('1', 'Patch'), source: 'steam', account: null }])],
    });

    assert.equal(summary.locked, true);
    assert.equal(summary.error, 'already_running');
    assert.equal((await db.repo.listRawPosts(10)).length, 0);
  });
});

test('an event insert rolls back when its source link cannot be written', async () => {
  await withDb(async (db) => {
    let failed = false;
    const faultSql = withQueryHook(db.sql, (text) => {
      if (!failed && text.includes('insert into live_event_sources')) {
        failed = true;
        throw new Error('link_failed');
      }
    });
    const faultRepo = createRepository(faultSql);
    const summary = await runIngestion(faultRepo, {
      trigger: 'cron',
      collectors: [
        staticCollector('steam', [
          { ...post('1', 'Patch 1.2.3.4'), source: 'steam', account: null },
        ]),
      ],
    });

    assert.equal(summary.error, 'collector_error');
    assert.equal((await db.repo.listRawPosts(10)).length, 1, 'collection committed before event building');
    assert.equal((await db.repo.listEvents({ limit: 10 })).length, 0, 'the orphan event insert rolled back');
  });
});

test('two mirrors of one announcement collected in the same run make one card', async () => {
  // Regression: candidates used to be snapshotted before the event-building
  // loop, so the second mirror was compared against a list that did not yet
  // contain the first, and the board showed the announcement twice.
  await withDb(async (db) => {
    const announcement = 'Weekend double experience event';
    await runIngestion(db.repo, {
      trigger: 'cron',
      collectors: [
        staticCollector('steam', [
          { ...post('1', announcement, 'Experience is doubled.'), source: 'steam', account: null },
        ]),
        staticCollector('official_x:tarkov', [
          { ...post('2', announcement, 'Experience is doubled!'), source: 'official_x', account: '@tarkov' },
        ]),
      ],
    });

    const events = await db.repo.listEvents({ limit: 20 });
    assert.equal(events.length, 1, 'one announcement, one board item');
    assert.equal(events[0].sources.length, 2, 'both posts are kept as sources');
    assert.equal(events[0].sources.filter((source) => source.role === 'initial').length, 1);
    assert.equal((await db.repo.listRawPosts(20)).length, 2, 'both raw posts are still stored');
  });
});

test('a developer’s personal post is stored and shown, but never auto-published', async () => {
  await withDb(async (db) => {
    await runIngestion(db.repo, {
      trigger: 'cron',
      collectors: [
        staticCollector('nikita_x:nikgeneburn', [
          {
            ...post('9', 'Something is coming to the swamps'),
            source: 'nikita_x',
            account: '@nikgeneburn',
          },
        ]),
      ],
    });

    const [event] = await db.repo.listEvents({ limit: 10 });
    assert.equal(event.reliability, 'developer_hint');
    assert.equal(event.reviewStatus, 'pending_review');
    assert.equal(event.reviewNote, 'developer_personal_account');
    assert.equal(event.publishedAt, null);
    assert.deepEqual(await db.repo.listEvents({ reviewStatus: ['auto_published'] }), []);
  });
});

test('an operator approval survives the next collection run', async () => {
  await withDb(async (db) => {
    const collector = staticCollector('nikita_x:nikgeneburn', [
      { ...post('9', 'Swamp teaser'), source: 'nikita_x', account: '@nikgeneburn' },
    ]);
    await runIngestion(db.repo, { trigger: 'cron', collectors: [collector] });
    const [event] = await db.repo.listEvents({ limit: 10 });

    await db.repo.updateEventFields(
      event.id,
      { reviewStatus: 'reviewed', endsAt: at(48 * 3600_000), title: '늪지대 이벤트' },
      { manual: true, actor: 'admin:test' },
    );

    await runIngestion(db.repo, { trigger: 'cron', collectors: [collector] });

    const after = await db.repo.getEvent(event.id);
    assert.equal(after?.reviewStatus, 'reviewed');
    assert.equal(after?.endsAt, new Date(at(48 * 3600_000)).toISOString());
    assert.equal((after as unknown as { title: string }).title, '늪지대 이벤트');

    const audit = await db.repo.listAudit(20);
    assert.ok(audit.some((row) => row.actor === 'admin:test' && row.action === 'update'));
  });
});

test('interpretation is skipped, not failed, when no provider is configured', async () => {
  await withDb(async (db) => {
    const summary = await runIngestion(db.repo, {
      trigger: 'cron',
      collectors: [staticCollector('steam', [{ ...post('1', 'Patch 1.2.3.4'), source: 'steam', account: null }])],
    });
    assert.equal(summary.interpreted, 0);
    assert.equal(summary.interpretFailures, 0);
    assert.equal(summary.ok, true, 'a missing API key is not a run failure');

    // The post keeps its original text and stays queued for a later run.
    const [stored] = await db.repo.listRawPosts(10);
    assert.equal(stored.interpretStatus, 'pending');
    const [event] = await db.repo.listEvents({ limit: 10 });
    assert.equal(event.content.ko?.summary ?? null, null, 'no summary was invented');
    assert.equal(event.content.original.title, 'Patch 1.2.3.4');
  });
});
