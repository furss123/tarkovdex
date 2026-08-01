import { NextResponse } from 'next/server';
import { liveConfig } from '@/lib/live/config';
import { authorizeCron } from '@/lib/live/cron-auth';
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

export async function GET(request: Request) {
  if (!authorizeCron(request.headers.get('authorization'), liveConfig.ingestion.cronSecret)) {
    // No hint about whether a secret is configured, wrong, or malformed.
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!liveConfig.ingestion.enabled) {
    return NextResponse.json({ ok: false, error: 'ingestion_disabled' }, { status: 503 });
  }

  const repo = getRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: 'database_not_configured' }, { status: 503 });
  }

  try {
    await repo.migrate();
    await seedManualEntries(repo);
    const url = new URL(request.url);
    const only = url.searchParams.getAll('source').filter(Boolean);
    const summary = await runIngestion(repo, { trigger: 'cron', only });

    // 409 rather than 200 so an external scheduler's own alerting can see that
    // an overlapping run was refused, without treating it as a failure.
    return NextResponse.json(summary, { status: summary.locked ? 409 : 200 });
  } catch {
    // Deliberately opaque: an upstream error string can carry request context,
    // and this response is reachable by anyone holding the cron secret.
    return NextResponse.json({ ok: false, error: 'ingestion_failed' }, { status: 500 });
  }
}

export const POST = GET;
