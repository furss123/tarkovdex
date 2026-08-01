import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestDb } from './helpers/pglite';
import { MIGRATIONS } from '../src/lib/live/db/migrations';
import type { RawSourcePost } from '../src/lib/live/repository';

const NOW = Date.parse('2030-05-01T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const at = (offset: number) => new Date(NOW + offset).toISOString();

function post(overrides: Partial<RawSourcePost> = {}): RawSourcePost {
  return {
    source: 'official_x',
    account: '@tarkov',
    postId: 'x-1',
    url: 'https://example.invalid/x-1',
    title: 'Weekend event',
    content: 'Double experience this weekend.',
    publishedAt: at(-HOUR),
    contentHash: 'abcd1234',
    ...overrides,
  };
}

// --- migrations -------------------------------------------------------------

test('migrations create the schema and re-running them is a no-op', async () => {
  const db = await createTestDb();
  try {
    // createTestDb already migrated once.
    const second = await db.repo.migrate();
    assert.deepEqual(second, [], 'a second run applies nothing');

    const tables = (
      await db.sql<{ table_name: string }>(
        "select table_name from information_schema.tables where table_schema = 'public'",
      )
    ).map((row) => row.table_name);

    for (const table of [
      'live_migrations',
      'live_source_states',
      'live_raw_posts',
      'live_interpretations',
      'live_events',
      'live_event_sources',
      'live_audit_logs',
      'live_ingestion_runs',
      'live_locks',
    ]) {
      assert.ok(tables.includes(table), `missing table ${table}`);
    }

    const ledger = await db.sql<{ id: string }>('select id from live_migrations');
    assert.deepEqual(
      ledger.map((row) => row.id),
      MIGRATIONS.map((migration) => migration.id),
    );
  } finally {
    await db.close();
  }
});

test('migrations converge even when the ledger was lost', async () => {
  const db = await createTestDb();
  try {
    await db.sql('delete from live_migrations');
    const ran = await db.repo.migrate();
    assert.deepEqual(ran, MIGRATIONS.map((migration) => migration.id));
    // And the tables still exist exactly once.
    await db.repo.upsertRawPost(post());
    assert.equal((await db.repo.listRawPosts(10)).length, 1);
  } finally {
    await db.close();
  }
});

// --- raw posts --------------------------------------------------------------

test('the same post collected twice is stored once', async () => {
  const db = await createTestDb();
  try {
    const first = await db.repo.upsertRawPost(post());
    const second = await db.repo.upsertRawPost(post());

    assert.equal(first.inserted, true);
    assert.equal(second.inserted, false, 'a re-collected post is an update, not an insert');
    assert.equal(second.changed, false, 'unchanged text is not queued for re-interpretation');
    assert.equal((await db.repo.listRawPosts(10)).length, 1);

    // Different account, same numeric id => a different post.
    await db.repo.upsertRawPost(post({ account: '@nikgeneburn', source: 'nikita_x' }));
    assert.equal((await db.repo.listRawPosts(10)).length, 2);
  } finally {
    await db.close();
  }
});

test('an edited post is re-queued for interpretation, an identical one is not', async () => {
  const db = await createTestDb();
  try {
    const { id } = await db.repo.upsertRawPost(post());
    await db.repo.setInterpretStatus(id, 'done');
    assert.equal((await db.repo.getPendingInterpretations(10)).length, 0);

    await db.repo.upsertRawPost(post());
    assert.equal((await db.repo.getPendingInterpretations(10)).length, 0, 'no text change, no re-run');

    await db.repo.upsertRawPost(post({ content: 'Rewritten body.', contentHash: 'ffff0000' }));
    const pending = await db.repo.getPendingInterpretations(10);
    assert.deepEqual(pending.map((row) => row.id), [id]);
  } finally {
    await db.close();
  }
});

test('repeatedly failing interpretation stops being retried', async () => {
  const db = await createTestDb();
  try {
    const { id } = await db.repo.upsertRawPost(post());
    for (let i = 0; i < 3; i++) await db.repo.setInterpretStatus(id, 'failed', 'provider_error');
    assert.equal((await db.repo.getPendingInterpretations(10)).length, 0);
    const stored = await db.repo.getRawPost(id);
    assert.equal(stored?.interpretAttempts, 3);
  } finally {
    await db.close();
  }
});

// --- source cursors ---------------------------------------------------------

test('source cursors persist per account and survive a cold start', async () => {
  const db = await createTestDb();
  try {
    await db.repo.saveSourceState({
      sourceKey: 'official_x:tarkov',
      sourceType: 'official_x',
      account: 'tarkov',
      externalId: '111',
      sinceId: '900',
      lastSuccessAt: at(0),
    });
    await db.repo.saveSourceState({
      sourceKey: 'nikita_x:nikgeneburn',
      sourceType: 'nikita_x',
      account: 'nikgeneburn',
      externalId: '222',
      sinceId: '500',
    });

    // A fresh repository object == a cold start: state comes back from storage.
    const official = await db.repo.getSourceState('official_x:tarkov');
    const nikita = await db.repo.getSourceState('nikita_x:nikgeneburn');
    assert.equal(official?.sinceId, '900');
    assert.equal(nikita?.sinceId, '500', 'the two accounts keep separate cursors');
    assert.equal(official?.externalId, '111');

    // A later failure must not wipe the cursor or the resolved user id.
    await db.repo.saveSourceState({
      sourceKey: 'official_x:tarkov',
      sourceType: 'official_x',
      account: 'tarkov',
      lastError: 'X API responded 429',
      lastErrorAt: at(HOUR),
      consecutiveFailures: 1,
      nextRetryAt: at(2 * HOUR),
    });
    const afterFailure = await db.repo.getSourceState('official_x:tarkov');
    assert.equal(afterFailure?.sinceId, '900');
    assert.equal(afterFailure?.externalId, '111');
    assert.equal(afterFailure?.consecutiveFailures, 1);
    assert.equal(afterFailure?.lastSuccessAt, new Date(at(0)).toISOString());
  } finally {
    await db.close();
  }
});

// --- events -----------------------------------------------------------------

async function seedEvent(db: Awaited<ReturnType<typeof createTestDb>>) {
  const { id } = await db.repo.upsertRawPost(post());
  const event = await db.repo.createOrUpdateEvent({
    id: 'evt-1',
    slug: 'weekend-event',
    category: 'event',
    reliability: 'official_confirmed',
    reviewStatus: 'pending_review',
    gameModes: ['pvp'],
    affects: ['xp'],
    content: { original: { title: 'Weekend event', content: 'Double experience this weekend.' } },
    primaryPostId: id,
  });
  await db.repo.linkPostToEvent(event.id, id, 'initial');
  return { event, postId: id };
}

test('an event links many sources and a post belongs to one event', async () => {
  const db = await createTestDb();
  try {
    const { event, postId } = await seedEvent(db);
    const mirror = await db.repo.upsertRawPost(
      post({ source: 'steam', account: null, postId: 'steam-1', contentHash: 'abcd1234' }),
    );
    await db.repo.linkPostToEvent(event.id, mirror.id, 'confirmation');

    const stored = await db.repo.getEvent(event.id);
    assert.equal(stored?.sources.length, 2);
    assert.deepEqual(stored?.sources.map((s) => s.role).sort(), ['confirmation', 'initial']);
    assert.equal(await db.repo.findEventIdForPost(postId), event.id);

    // Re-linking the same post elsewhere moves it rather than duplicating it.
    await db.repo.createOrUpdateEvent({
      id: 'evt-2',
      slug: 'other',
      category: 'patch',
      reliability: 'official_confirmed',
      reviewStatus: 'auto_published',
      gameModes: [],
      affects: [],
      content: { original: { title: 'Patch', content: 'notes' } },
      primaryPostId: null,
    });
    await db.repo.linkPostToEvent('evt-2', mirror.id, 'update');
    assert.equal((await db.repo.getEvent(event.id))?.sources.length, 1);
  } finally {
    await db.close();
  }
});

test('a manual edit survives re-collection and can be reverted', async () => {
  const db = await createTestDb();
  try {
    const { event } = await seedEvent(db);

    await db.repo.updateEventFields(
      event.id,
      { title: '운영자가 고친 제목', reviewStatus: 'reviewed', endsAt: at(24 * HOUR) },
      { manual: true, actor: 'admin' },
    );

    // The automated pipeline runs again with its own, different derived values.
    await db.repo.createOrUpdateEvent({
      id: event.id,
      slug: 'weekend-event',
      category: 'event',
      reliability: 'official_confirmed',
      reviewStatus: 'pending_review',
      gameModes: ['pvp', 'pve'],
      affects: ['xp'],
      content: { original: { title: 'Weekend event', content: 'Double experience this weekend.' } },
      primaryPostId: event.primaryPostId,
    });

    const after = await db.repo.getEvent(event.id);
    assert.equal((after as unknown as { title: string }).title, '운영자가 고친 제목');
    assert.equal(after?.reviewStatus, 'reviewed', 'a reviewed item is never demoted by the pipeline');
    assert.equal(after?.endsAt, new Date(at(24 * HOUR)).toISOString(), 'a curated end time is not dropped');
    assert.ok(after?.manualFields.includes('title'));

    const reverted = await db.repo.clearEventOverride(event.id, 'title', 'admin');
    assert.equal(reverted?.content.original.title, 'Weekend event');
    assert.ok(!reverted?.manualFields.includes('title'));
  } finally {
    await db.close();
  }
});

test('every review action is written to the audit log', async () => {
  const db = await createTestDb();
  try {
    const { event } = await seedEvent(db);
    await db.repo.updateEventFields(event.id, { reviewStatus: 'reviewed' }, { manual: true, actor: 'admin', note: 'ok' });
    await db.repo.updateEventFields(event.id, { reviewStatus: 'rejected' }, { manual: true, actor: 'admin' });
    await db.repo.clearEventOverride(event.id, 'reviewStatus', 'admin');

    const log = await db.repo.listAudit(10);
    assert.equal(log.length, 3);
    assert.deepEqual(log.map((row) => row.action), ['clear_override', 'update', 'update']);
    assert.equal(log[2].note, 'ok');
    assert.ok(log.every((row) => row.actor === 'admin'));
  } finally {
    await db.close();
  }
});

test('pending reviews are listable and separated from published items', async () => {
  const db = await createTestDb();
  try {
    await seedEvent(db);
    await db.repo.createOrUpdateEvent({
      id: 'evt-pub',
      slug: 'published',
      category: 'patch',
      reliability: 'official_confirmed',
      reviewStatus: 'auto_published',
      gameModes: [],
      affects: [],
      content: { original: { title: 'Patch 1.2.3', content: 'notes' } },
      primaryPostId: null,
      publishedAt: at(0),
    });

    const pending = await db.repo.listEvents({ reviewStatus: ['pending_review'] });
    const published = await db.repo.listEvents({ reviewStatus: ['auto_published', 'reviewed'] });
    assert.deepEqual(pending.map((row) => row.id), ['evt-1']);
    assert.deepEqual(published.map((row) => row.id), ['evt-pub']);
  } finally {
    await db.close();
  }
});

// --- runs and locks ---------------------------------------------------------

test('ingestion runs record what happened', async () => {
  const db = await createTestDb();
  try {
    const id = await db.repo.startRun('official_x', 'cron');
    await db.repo.finishRun(id, { ok: true, requests: 2, fetched: 10, newPosts: 3, duplicates: 7, durationMs: 412 });
    const [run] = await db.repo.listRuns(5);
    assert.equal(run.ok, true);
    assert.equal(run.newPosts, 3);
    assert.equal(run.duplicates, 7);
    assert.equal(run.durationMs, 412);
    assert.ok(run.finishedAt);
  } finally {
    await db.close();
  }
});

test('the ingestion lock is exclusive across instances and expires', async () => {
  const db = await createTestDb();
  try {
    assert.equal(await db.repo.acquireLock('ingest', 60_000, 'instance-a'), true);
    assert.equal(
      await db.repo.acquireLock('ingest', 60_000, 'instance-b'),
      false,
      'a second instance is refused while the first holds it',
    );

    await db.repo.releaseLock('ingest', 'instance-a');
    assert.equal(await db.repo.acquireLock('ingest', 60_000, 'instance-b'), true);

    // A crashed holder must not wedge collection forever.
    await db.sql("update live_locks set expires_at = now() - interval '1 minute'");
    assert.equal(await db.repo.acquireLock('ingest', 60_000, 'instance-c'), true);
  } finally {
    await db.close();
  }
});
