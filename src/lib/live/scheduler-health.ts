/**
 * Operator-facing classification of the external news ingestion scheduler.
 * Reuses `live_source_states` / `live_ingestion_runs` heartbeats — no second
 * monitoring table. Pure so tests can cover every branch without I/O.
 */

import {
  isManualSchedulerTrigger,
  isNaturalScheduleTrigger,
  isTrustedNaturalScheduleTrigger,
} from '@/lib/live/cron-invocation';

/** Target cadence for the GitHub Actions scheduler (and acceptable fallback). */
export const SCHEDULER_INTERVAL_MS = 5 * 60_000;

/**
 * Heartbeat older than this is "delayed". 20 minutes covers three missed
 * 5-minute ticks plus scheduling jitter without treating a quiet no-new-post
 * run as an outage.
 */
export const SCHEDULER_DELAYED_AFTER_MS = 20 * 60_000;

export type SchedulerHealthStatus =
  | 'running'
  | 'delayed'
  | 'failed'
  | 'never'
  | 'checked_no_new'
  | 'new_posts_found'
  | 'new_posts_published';

export interface SchedulerHeartbeatInput {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
  /** Latest finished ingestion run, when available. */
  lastRunOk?: boolean | null;
  lastRunNewPosts?: number | null;
  lastRunEventsUpserted?: number | null;
  lastRunFinishedAt?: string | null;
}

function ageMs(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? now - value : null;
}

/**
 * Classify scheduler health from stored heartbeats. "No new posts" is a
 * successful check, never an error.
 */
export function classifySchedulerHealth(
  input: SchedulerHeartbeatInput,
  now: number,
  delayedAfterMs: number = SCHEDULER_DELAYED_AFTER_MS,
): SchedulerHealthStatus {
  const successAge = ageMs(input.lastSuccessAt, now);
  const attemptAge = ageMs(input.lastAttemptAt, now);
  const runAge = ageMs(input.lastRunFinishedAt ?? null, now);

  if (successAge == null && attemptAge == null) return 'never';

  const recentFailure =
    input.consecutiveFailures > 0 &&
    (attemptAge == null || attemptAge <= delayedAfterMs) &&
    (successAge == null || (attemptAge != null && attemptAge < successAge));

  if (recentFailure || (input.lastRunOk === false && (runAge == null || runAge <= delayedAfterMs))) {
    return 'failed';
  }

  if (successAge == null || successAge > delayedAfterMs) return 'delayed';

  const newPosts = input.lastRunNewPosts ?? 0;
  const published = input.lastRunEventsUpserted ?? 0;
  if (input.lastRunOk === true && newPosts > 0 && published > 0) return 'new_posts_published';
  if (input.lastRunOk === true && newPosts > 0) return 'new_posts_found';
  if (input.lastRunOk === true && newPosts === 0) return 'checked_no_new';
  return 'running';
}

/** Korean operator labels for the admin desk (not public site copy). */
export const SCHEDULER_HEALTH_LABEL_KO: Record<SchedulerHealthStatus, string> = {
  running: '스케줄러 정상 동작 중',
  delayed: '스케줄러가 최근 실행되지 않음',
  failed: '스케줄러 요청 실패',
  never: '스케줄러 실행 기록 없음',
  checked_no_new: '출처 확인 완료 · 새 게시물 없음',
  new_posts_found: '새 게시물 감지됨',
  new_posts_published: '새 게시물 게시됨',
};

/** Aggregate heartbeats across sources + the newest finished run. */
export function classifyFromSourceStates(
  states: Array<{
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    consecutiveFailures: number;
    lastError: string | null;
    active?: boolean;
  }>,
  latestRun: {
    ok: boolean | null;
    newPosts: number;
    eventsUpserted: number;
    finishedAt: string | null;
  } | null,
  now: number,
  delayedAfterMs: number = SCHEDULER_DELAYED_AFTER_MS,
): SchedulerHealthStatus {
  const active = states.filter((state) => state.active !== false);
  if (active.length === 0 && !latestRun) return 'never';

  const lastSuccessAt = active
    .map((state) => state.lastSuccessAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const lastAttemptAt = active
    .map((state) => state.lastAttemptAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const consecutiveFailures = Math.max(0, ...active.map((state) => state.consecutiveFailures));
  const lastError =
    active
      .filter((state) => state.consecutiveFailures > 0 && state.lastError)
      .map((state) => state.lastError)
      .at(-1) ?? null;

  return classifySchedulerHealth(
    {
      lastAttemptAt,
      lastSuccessAt,
      consecutiveFailures,
      lastError,
      lastRunOk: latestRun?.ok ?? null,
      lastRunNewPosts: latestRun?.newPosts ?? null,
      lastRunEventsUpserted: latestRun?.eventsUpserted ?? null,
      lastRunFinishedAt: latestRun?.finishedAt ?? null,
    },
    now,
    delayedAfterMs,
  );
}

export interface SchedulerInvocationEvidence {
  lastAnyInvocationAt: string | null;
  lastScheduledInvocationAt: string | null;
  lastManualInvocationAt: string | null;
  lastSuccessfulSourceCheckAt: string | null;
  lastScheduledSuccessAt: string | null;
  lastManualSuccessAt: string | null;
}

export type NaturalScheduleStatus = 'verified' | 'unverified' | 'delayed' | 'never';

/**
 * Split ingestion-run triggers into scheduled vs manual evidence so a manual
 * dispatch cannot falsely prove that GitHub's natural `schedule` is firing.
 */
export function extractSchedulerInvocationEvidence(
  runs: Array<{
    trigger: string;
    startedAt: string;
    finishedAt: string | null;
    ok: boolean | null;
  }>,
  sourceLastSuccessAt: string | null,
): SchedulerInvocationEvidence {
  let lastAnyInvocationAt: string | null = null;
  let lastScheduledInvocationAt: string | null = null;
  let lastManualInvocationAt: string | null = null;
  let lastScheduledSuccessAt: string | null = null;
  let lastManualSuccessAt: string | null = null;

  for (const run of runs) {
    const at = run.finishedAt ?? run.startedAt;
    if (!lastAnyInvocationAt || at > lastAnyInvocationAt) lastAnyInvocationAt = at;

    if (isNaturalScheduleTrigger(run.trigger)) {
      if (!lastScheduledInvocationAt || at > lastScheduledInvocationAt) {
        lastScheduledInvocationAt = at;
      }
      if (
        run.ok === true &&
        isTrustedNaturalScheduleTrigger(run.trigger) &&
        (!lastScheduledSuccessAt || at > lastScheduledSuccessAt)
      ) {
        lastScheduledSuccessAt = at;
      }
    }

    if (isManualSchedulerTrigger(run.trigger)) {
      if (!lastManualInvocationAt || at > lastManualInvocationAt) {
        lastManualInvocationAt = at;
      }
      if (run.ok === true && (!lastManualSuccessAt || at > lastManualSuccessAt)) {
        lastManualSuccessAt = at;
      }
    }
  }

  return {
    lastAnyInvocationAt,
    lastScheduledInvocationAt,
    lastManualInvocationAt,
    lastSuccessfulSourceCheckAt: sourceLastSuccessAt,
    lastScheduledSuccessAt,
    lastManualSuccessAt,
  };
}

/**
 * Natural GitHub `schedule` proof. Manual dispatch success leaves this
 * `unverified` / `never` — source heartbeats alone are not enough.
 */
export function classifyNaturalScheduleStatus(
  evidence: SchedulerInvocationEvidence,
  now: number,
  delayedAfterMs: number = SCHEDULER_DELAYED_AFTER_MS,
): NaturalScheduleStatus {
  // Trusted success requires a numeric GitHub run id in the trigger label.
  // Bare `github-actions:schedule` probes (or other bearer-holder headers) must
  // not mark the natural schedule verified.
  if (!evidence.lastScheduledSuccessAt) {
    if (evidence.lastScheduledInvocationAt) return 'unverified';
    return evidence.lastManualInvocationAt || evidence.lastAnyInvocationAt ? 'unverified' : 'never';
  }

  const successAge = ageMs(evidence.lastScheduledSuccessAt, now);
  if (successAge == null) return 'unverified';
  if (successAge > delayedAfterMs) return 'delayed';
  return 'verified';
}

export const NATURAL_SCHEDULE_LABEL_KO: Record<NaturalScheduleStatus, string> = {
  verified: '자연 스케줄 확인됨',
  unverified: '수동 실행만 확인됨 · 자연 스케줄 미검증',
  delayed: '자연 스케줄이 최근 실행되지 않음',
  never: '자연 스케줄 실행 기록 없음',
};
