import { NextResponse } from 'next/server';
import { allCollectors } from '@/lib/live/collectors';
import { liveConfig } from '@/lib/live/config';
import { authorizeCron } from '@/lib/live/cron-auth';
import { parseCronInvocationMeta } from '@/lib/live/cron-invocation';
import { runIngestion } from '@/lib/live/pipeline';
import { getRepository } from '@/lib/live/repository-client';
import { seedManualEntries } from '@/lib/live/seed';

/**
 * The authenticated collection endpoint. This — not a page render — is what
 * keeps Tarkov Live current, so the board stays fresh whether or not anyone is
 * looking at it, and a burst of traffic across three locales costs nothing
 * extra at the X and Gemini APIs.
 *
 * Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`, which is also
 * the contract for any external scheduler (see docs/tarkov-live.md — Vercel's
 * Hobby plan only fires crons once a day, so a shorter interval needs one).
 * There is no query-parameter secret: URLs end up in logs and referrers.
 */

// Never prerendered, never cached: it has side effects and reads a header.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const RESPONSE_INIT = {
  headers: { 'Cache-Control': 'private, no-store, max-age=0' },
} as const;

function json(body: unknown, status: number) {
  return NextResponse.json(body, { ...RESPONSE_INIT, status });
}

export async function GET(request: Request) {
  if (!authorizeCron(request.headers.get('authorization'), liveConfig.ingestion.cronSecret)) {
    // No hint about whether a secret is configured, wrong, or malformed.
    return json({ error: 'unauthorized' }, 401);
  }

  if (!liveConfig.ingestion.enabled) {
    return json({ ok: false, error: 'ingestion_disabled' }, 503);
  }

  const repo = getRepository();
  if (!repo) {
    return json({ ok: false, error: 'database_not_configured' }, 503);
  }

  try {
    await repo.migrate();
    await seedManualEntries(repo);
    const url = new URL(request.url);
    const only = url.searchParams.getAll('source').filter(Boolean);
    const allowedSources = new Set(allCollectors().map((collector) => collector.key));
    if (only.some((source) => !allowedSources.has(source))) {
      return json({ ok: false, error: 'invalid_source' }, 400);
    }
    // Headers distinguish schedule vs manual vs Vercel for operator evidence.
    // They are never used for authorization.
    const invocation = parseCronInvocationMeta(request.headers);
    const summary = await runIngestion(repo, { trigger: invocation.triggerLabel, only });

    // Status codes mirror the body so an external scheduler cannot mistake a
    // failed source run for a successful invocation.
    const status = summary.locked ? 409 : summary.ok ? 200 : 502;
    return json(
      {
        ...summary,
        scheduler: invocation.scheduler,
        triggerKind: invocation.triggerKind,
        workflowRunId: invocation.workflowRunId,
      },
      status,
    );
  } catch {
    // Deliberately opaque: an upstream error string can carry request context,
    // and this response is reachable by anyone holding the cron secret.
    return json({ ok: false, error: 'ingestion_failed' }, 500);
  }
}

export const POST = GET;
