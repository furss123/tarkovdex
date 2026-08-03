import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { newsroomConfig } from '@/lib/newsroom/newsroom-config';
import { getRepository } from '@/lib/live/repository-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Newsroom heartbeat cron.
 *
 * Telegram channel history still has no authorized adapter, so collection stays
 * manual via `/api/internal/news/import`. Steam automatic detection continues
 * through `/api/cron/tarkov-live`. This endpoint records an operator-visible
 * heartbeat so a silent newsroom outage is observable in admin source health.
 */
export async function GET(request: Request) {
  const header = request.headers.get('authorization');
  const secret = newsroomConfig.cronSecret;
  const supplied = header?.startsWith('Bearer ') ? Buffer.from(header.slice(7)) : Buffer.alloc(0);
  const expected = secret ? Buffer.from(secret) : Buffer.alloc(1);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const checkedAt = new Date().toISOString();
  const repo = getRepository();
  if (repo) {
    await repo.migrate();
    await repo.saveSourceState({
      sourceKey: 'newsroom',
      sourceType: 'official_telegram',
      account: 'newsroom',
      active: true,
      lastAttemptAt: checkedAt,
      lastSuccessAt: checkedAt,
      consecutiveFailures: 0,
      lastError: newsroomConfig.ingestionMode === 'manual' ? 'adapter_not_configured' : null,
    });
  }

  return NextResponse.json({
    ok: true,
    mode: newsroomConfig.ingestionMode,
    heartbeatAt: checkedAt,
    adapter: newsroomConfig.ingestionMode === 'manual' ? 'not_configured' : 'pending',
    automaticPaths: ['steam_via_tarkov_live_cron', 'protected_official_import'],
  });
}

export const POST = GET;
