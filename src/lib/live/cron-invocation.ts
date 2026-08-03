/**
 * Safe, non-auth metadata about who invoked `/api/cron/tarkov-live`.
 * Headers are informational only — authorization remains Bearer CRON_SECRET.
 */

export type CronSchedulerKind = 'github-actions' | 'vercel' | 'direct';
export type CronTriggerKind = 'schedule' | 'workflow_dispatch' | 'cron' | 'manual' | 'unknown';

export interface CronInvocationMeta {
  scheduler: CronSchedulerKind;
  triggerKind: CronTriggerKind;
  workflowRunId: string | null;
  /** Stored on `live_ingestion_runs.trigger` for operator evidence. */
  triggerLabel: string;
}

const HEADER_SCHEDULER = 'x-tarkovdex-scheduler';
const HEADER_TRIGGER = 'x-tarkovdex-trigger';
const HEADER_RUN = 'x-tarkovdex-workflow-run';

function header(headers: Headers, name: string): string | null {
  const value = headers.get(name)?.trim();
  return value ? value : null;
}

function normalizeTriggerKind(raw: string | null): CronTriggerKind {
  if (!raw) return 'unknown';
  const value = raw.toLowerCase();
  if (value === 'schedule') return 'schedule';
  if (value === 'workflow_dispatch') return 'workflow_dispatch';
  if (value === 'cron') return 'cron';
  if (value === 'manual') return 'manual';
  return 'unknown';
}

/**
 * Derive a stable trigger label from request headers. Never trusts headers for
 * auth; only for distinguishing schedule vs manual evidence after a valid bearer.
 */
export function parseCronInvocationMeta(headers: Headers): CronInvocationMeta {
  const schedulerHeader = header(headers, HEADER_SCHEDULER)?.toLowerCase() ?? null;
  const triggerKind = normalizeTriggerKind(header(headers, HEADER_TRIGGER));
  const workflowRunId = header(headers, HEADER_RUN);
  const vercelCron = header(headers, 'x-vercel-cron') === '1';

  let scheduler: CronSchedulerKind = 'direct';
  if (schedulerHeader === 'github-actions') scheduler = 'github-actions';
  else if (vercelCron || schedulerHeader === 'vercel') scheduler = 'vercel';

  let kind = triggerKind;
  if (kind === 'unknown') {
    if (scheduler === 'github-actions') kind = 'workflow_dispatch';
    else if (scheduler === 'vercel') kind = 'cron';
    else kind = 'cron';
  }

  const triggerLabel =
    scheduler === 'direct' && kind === 'cron'
      ? 'cron'
      : `${scheduler}:${kind}`;

  return { scheduler, triggerKind: kind, workflowRunId, triggerLabel };
}

export function isNaturalScheduleTrigger(trigger: string): boolean {
  return trigger === 'github-actions:schedule' || trigger.endsWith(':schedule');
}

export function isManualSchedulerTrigger(trigger: string): boolean {
  return (
    trigger === 'manual' ||
    trigger === 'github-actions:workflow_dispatch' ||
    trigger.endsWith(':workflow_dispatch')
  );
}