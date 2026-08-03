import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { importOfficialPost } from '@/lib/newsroom/import-official-post';
import { newsroomConfig } from '@/lib/newsroom/newsroom-config';
import { NewsSourceValidationError, type OfficialSourcePostInput } from '@/lib/newsroom/news-source-normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const MAX_BODY_BYTES = 64 * 1024;
const attempts = new Map<string, number[]>();

function authorized(value: string | null, secret: string | undefined): boolean {
  if (!secret || !value?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(value.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function limited(key: string, now = Date.now()): boolean {
  const recent = (attempts.get(key) ?? []).filter((time) => now - time < 60_000);
  recent.push(now); attempts.set(key, recent);
  return recent.length > 10;
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get('authorization'), newsroomConfig.importSecret)) return json({ error: 'unauthorized' }, 401);
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (limited(key)) return json({ error: 'rate_limited' }, 429);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ error: 'body_too_large' }, 413);
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return json({ error: 'body_too_large' }, 413);
  let input: OfficialSourcePostInput;
  try { input = JSON.parse(raw) as OfficialSourcePostInput; } catch { return json({ error: 'invalid_json' }, 400); }
  try { return json({ ok: true, result: await importOfficialPost(input) }, 200); }
  catch (error) {
    if (error instanceof NewsSourceValidationError) return json({ error: error.code }, 400);
    if (error instanceof Error && error.message === 'database_not_configured') return json({ error: error.message }, 503);
    return json({ error: 'import_failed' }, 500);
  }
}
