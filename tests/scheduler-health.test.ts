import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeCron } from '../src/lib/live/cron-auth';
import {
  SCHEDULER_DELAYED_AFTER_MS,
  classifyFromSourceStates,
  classifyNaturalScheduleStatus,
  classifySchedulerHealth,
  extractSchedulerInvocationEvidence,
} from '../src/lib/live/scheduler-health';
import {
  isManualSchedulerTrigger,
  isNaturalScheduleTrigger,
  isTrustedNaturalScheduleTrigger,
  parseCronInvocationMeta,
} from '../src/lib/live/cron-invocation';
import {
  excludeFeaturedStoryIds,
  hasNewerOfficialPost,
} from '../src/lib/newsroom/news-refresh-signal';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NOW = Date.parse('2030-05-01T12:00:00.000Z');
const SECRET = 'scheduler-secret-value-0123456789abcdef';

test('external scheduler auth accepts only a correct bearer secret', () => {
  assert.equal(authorizeCron(`Bearer ${SECRET}`, SECRET), true);
  assert.equal(authorizeCron(`Bearer wrong`, SECRET), false);
  assert.equal(authorizeCron(null, SECRET), false);
  assert.equal(authorizeCron(`Bearer ${SECRET}`, undefined), false);
});

test('unauthorized scheduler requests are refused when the secret is missing', () => {
  assert.equal(authorizeCron(`Bearer ${SECRET}`, ''), false);
  assert.equal(authorizeCron('Bearer ', SECRET), false);
});

test('stale heartbeat detection uses the 5-minute schedule threshold', () => {
  assert.equal(
    classifySchedulerHealth(
      {
        lastAttemptAt: new Date(NOW - 5 * 60_000).toISOString(),
        lastSuccessAt: new Date(NOW - 5 * 60_000).toISOString(),
        consecutiveFailures: 0,
        lastError: null,
        lastRunOk: true,
        lastRunNewPosts: 0,
        lastRunEventsUpserted: 0,
        lastRunFinishedAt: new Date(NOW - 5 * 60_000).toISOString(),
      },
      NOW,
    ),
    'checked_no_new',
  );

  assert.equal(
    classifySchedulerHealth(
      {
        lastAttemptAt: new Date(NOW - SCHEDULER_DELAYED_AFTER_MS - 1).toISOString(),
        lastSuccessAt: new Date(NOW - SCHEDULER_DELAYED_AFTER_MS - 1).toISOString(),
        consecutiveFailures: 0,
        lastError: null,
      },
      NOW,
    ),
    'delayed',
  );
});

test('failed invocation is recorded as failed, not as no-new-posts', () => {
  assert.equal(
    classifySchedulerHealth(
      {
        lastAttemptAt: new Date(NOW - 60_000).toISOString(),
        lastSuccessAt: new Date(NOW - 30 * 60_000).toISOString(),
        consecutiveFailures: 2,
        lastError: 'collector_error',
        lastRunOk: false,
        lastRunNewPosts: 0,
        lastRunFinishedAt: new Date(NOW - 60_000).toISOString(),
      },
      NOW,
    ),
    'failed',
  );
});

test('no-new-post execution still counts as a successful source check', () => {
  assert.equal(
    classifySchedulerHealth(
      {
        lastAttemptAt: new Date(NOW - 60_000).toISOString(),
        lastSuccessAt: new Date(NOW - 60_000).toISOString(),
        consecutiveFailures: 0,
        lastError: null,
        lastRunOk: true,
        lastRunNewPosts: 0,
        lastRunEventsUpserted: 0,
        lastRunFinishedAt: new Date(NOW - 60_000).toISOString(),
      },
      NOW,
    ),
    'checked_no_new',
  );
});

test('new posts found and published are distinct healthy outcomes', () => {
  assert.equal(
    classifySchedulerHealth(
      {
        lastAttemptAt: new Date(NOW - 60_000).toISOString(),
        lastSuccessAt: new Date(NOW - 60_000).toISOString(),
        consecutiveFailures: 0,
        lastError: null,
        lastRunOk: true,
        lastRunNewPosts: 2,
        lastRunEventsUpserted: 0,
        lastRunFinishedAt: new Date(NOW - 60_000).toISOString(),
      },
      NOW,
    ),
    'new_posts_found',
  );
  assert.equal(
    classifySchedulerHealth(
      {
        lastAttemptAt: new Date(NOW - 60_000).toISOString(),
        lastSuccessAt: new Date(NOW - 60_000).toISOString(),
        consecutiveFailures: 0,
        lastError: null,
        lastRunOk: true,
        lastRunNewPosts: 2,
        lastRunEventsUpserted: 1,
        lastRunFinishedAt: new Date(NOW - 60_000).toISOString(),
      },
      NOW,
    ),
    'new_posts_published',
  );
});

test('aggregate source states prefer the newest heartbeat', () => {
  assert.equal(
    classifyFromSourceStates(
      [
        {
          lastAttemptAt: new Date(NOW - 10 * 60_000).toISOString(),
          lastSuccessAt: new Date(NOW - 10 * 60_000).toISOString(),
          consecutiveFailures: 0,
          lastError: null,
          active: true,
        },
        {
          lastAttemptAt: new Date(NOW - 60_000).toISOString(),
          lastSuccessAt: new Date(NOW - 60_000).toISOString(),
          consecutiveFailures: 0,
          lastError: null,
          active: true,
        },
      ],
      { ok: true, newPosts: 0, eventsUpserted: 0, finishedAt: new Date(NOW - 60_000).toISOString() },
      NOW,
    ),
    'checked_no_new',
  );
});

test('Latest News refresh banner signals only when a newer official post arrives', () => {
  assert.equal(hasNewerOfficialPost(null, '2030-05-01T12:00:00.000Z'), false);
  assert.equal(
    hasNewerOfficialPost('2030-05-01T12:00:00.000Z', '2030-05-01T12:00:00.000Z'),
    false,
  );
  assert.equal(
    hasNewerOfficialPost('2030-05-01T11:00:00.000Z', '2030-05-01T12:00:00.000Z'),
    true,
  );
  assert.equal(
    hasNewerOfficialPost('2030-05-01T12:00:00.000Z', '2030-05-01T11:00:00.000Z'),
    false,
  );
});

test('featured stories are excluded from the normal Latest list', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(
    excludeFeaturedStoryIds(list, new Set(['a', 'c'])).map((story) => story.id),
    ['b'],
  );
  assert.deepEqual(
    excludeFeaturedStoryIds(list, new Set()).map((story) => story.id),
    ['a', 'b', 'c'],
  );
});

test('GitHub Actions scheduler workflow calls the protected cron endpoint safely', () => {
  const workflow = readFileSync(
    join(process.cwd(), '.github/workflows/tarkov-live-news-ingestion.yml'),
    'utf8',
  );
  assert.match(
    workflow,
    /cron: "2,7,12,17,22,27,32,37,42,47,52,57 \* \* \* \*"/,
  );
  assert.doesNotMatch(workflow, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /tarkov-live-news-ingestion/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /api\/cron\/tarkov-live/);
  assert.match(workflow, /secrets\.CRON_SECRET/);
  assert.match(workflow, /Authorization: Bearer/);
  assert.match(workflow, /X-TarkovDex-Scheduler: github-actions/);
  assert.match(workflow, /X-TarkovDex-Trigger:/);
  assert.match(workflow, /X-TarkovDex-Workflow-Run:/);
  assert.doesNotMatch(workflow, /CRON_SECRET:\s*['"]?[a-zA-Z0-9]{16,}/);
  assert.match(workflow, /"\$status" == "200" \|\| "\$status" == "409"/);
});

test('cron invocation metadata distinguishes schedule from manual dispatch', () => {
  const schedule = parseCronInvocationMeta(
    new Headers({
      'x-tarkovdex-scheduler': 'github-actions',
      'x-tarkovdex-trigger': 'schedule',
      'x-tarkovdex-workflow-run': '123',
    }),
  );
  assert.equal(schedule.triggerLabel, 'github-actions:schedule#123');
  assert.equal(schedule.triggerKind, 'schedule');
  assert.equal(isNaturalScheduleTrigger(schedule.triggerLabel), true);
  assert.equal(isTrustedNaturalScheduleTrigger(schedule.triggerLabel), true);
  assert.equal(isManualSchedulerTrigger(schedule.triggerLabel), false);

  const probe = parseCronInvocationMeta(
    new Headers({
      'x-tarkovdex-scheduler': 'github-actions',
      'x-tarkovdex-trigger': 'schedule',
      'x-tarkovdex-workflow-run': 'header-parse-check',
    }),
  );
  assert.equal(probe.triggerLabel, 'github-actions:schedule');
  assert.equal(isTrustedNaturalScheduleTrigger(probe.triggerLabel), false);

  const manual = parseCronInvocationMeta(
    new Headers({
      'x-tarkovdex-scheduler': 'github-actions',
      'x-tarkovdex-trigger': 'workflow_dispatch',
      'x-tarkovdex-workflow-run': '456',
    }),
  );
  assert.equal(manual.triggerLabel, 'github-actions:workflow_dispatch#456');
  assert.equal(isManualSchedulerTrigger(manual.triggerLabel), true);
  assert.equal(isNaturalScheduleTrigger(manual.triggerLabel), false);

  const vercel = parseCronInvocationMeta(new Headers({ 'x-vercel-cron': '1' }));
  assert.equal(vercel.triggerLabel, 'vercel:cron');

  const direct = parseCronInvocationMeta(new Headers());
  assert.equal(direct.triggerLabel, 'cron');
});

test('manual heartbeat does not falsely prove natural schedule health', () => {
  const evidence = extractSchedulerInvocationEvidence(
    [
      {
        trigger: 'github-actions:workflow_dispatch#1',
        startedAt: new Date(NOW - 60_000).toISOString(),
        finishedAt: new Date(NOW - 60_000).toISOString(),
        ok: true,
      },
      {
        trigger: 'manual',
        startedAt: new Date(NOW - 30_000).toISOString(),
        finishedAt: new Date(NOW - 30_000).toISOString(),
        ok: true,
      },
      {
        trigger: 'github-actions:schedule',
        startedAt: new Date(NOW - 10_000).toISOString(),
        finishedAt: new Date(NOW - 10_000).toISOString(),
        ok: true,
      },
    ],
    new Date(NOW - 30_000).toISOString(),
  );
  assert.equal(evidence.lastManualSuccessAt != null, true);
  assert.equal(evidence.lastScheduledSuccessAt, null);
  assert.equal(classifyNaturalScheduleStatus(evidence, NOW), 'unverified');
});

test('successful scheduled no-new-post run verifies natural schedule health', () => {
  const evidence = extractSchedulerInvocationEvidence(
    [
      {
        trigger: 'github-actions:schedule#999',
        startedAt: new Date(NOW - 60_000).toISOString(),
        finishedAt: new Date(NOW - 60_000).toISOString(),
        ok: true,
      },
    ],
    new Date(NOW - 60_000).toISOString(),
  );
  assert.equal(classifyNaturalScheduleStatus(evidence, NOW), 'verified');
  assert.equal(
    classifyNaturalScheduleStatus(evidence, NOW + SCHEDULER_DELAYED_AFTER_MS + 1),
    'delayed',
  );
});
