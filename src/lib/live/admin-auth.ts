import 'server-only';
import { cookies, headers } from 'next/headers';
import { liveConfig } from './config';
import { CSRF_INPUT_NAME } from './admin-constants';
import {
  csrfFor,
  decodeSession,
  encodeSession,
  newSessionId,
  safeEqual,
  type AdminSession,
} from './admin-session';

/**
 * Admin authentication: one shared secret, a signed HttpOnly cookie, and
 * nothing else.
 *
 * A fan site with exactly one operator does not need an identity provider, a
 * user table, or a password reset flow — all of which would be more code, more
 * dependencies and more attack surface than the thing being protected. What it
 * does need, and has: the secret never leaves the server, the cookie is signed
 * so it can't be forged, sessions expire, every mutating action re-checks
 * authorization *and* a CSRF token, and failed logins are throttled.
 *
 * The secret is compared with `timingSafeEqual`, is never echoed in an error,
 * and no response reveals whether one is even configured.
 */

const COOKIE = 'tarkovdex_admin';

export type { AdminSession };

/**
 * In-memory throttle, per instance rather than global. On serverless that is a
 * real ceiling and it is stated rather than hidden: it slows a brute-force
 * attempt substantially without a shared store, and what it protects is a long
 * random secret, not a human-chosen password.
 */
// ponytail: per-instance login throttle. Move the counter into live_locks if a
// distributed limit ever actually matters.
const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

async function clientKey(): Promise<string> {
  const store = await headers();
  return (store.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
}

async function throttled(): Promise<boolean> {
  const record = attempts.get(await clientKey());
  return Boolean(record && record.until > Date.now() && record.count >= MAX_ATTEMPTS);
}

async function recordFailure(): Promise<void> {
  const key = await clientKey();
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || record.until < now) attempts.set(key, { count: 1, until: now + WINDOW_MS });
  else record.count += 1;
}

/** True on success; sets the session cookie as a side effect. */
export async function login(password: string): Promise<boolean> {
  const secret = liveConfig.admin.secret;
  const signing = liveConfig.admin.sessionSecret;
  if (!secret || !signing || (await throttled()) || !safeEqual(password, secret)) {
    await recordFailure();
    return false;
  }

  attempts.delete(await clientKey());
  const session: AdminSession = {
    id: newSessionId(),
    expiresAt: Date.now() + liveConfig.admin.sessionHours * 60 * 60 * 1000,
  };

  const store = await cookies();
  store.set(COOKIE, encodeSession(session, signing), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(session.expiresAt),
  });
  return true;
}

export async function logout(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<AdminSession | null> {
  if (!liveConfig.admin.enabled) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  return decodeSession(raw, liveConfig.admin.sessionSecret);
}

export function csrfToken(session: AdminSession): string {
  return csrfFor(session, liveConfig.admin.sessionSecret ?? '');
}

export class AdminAuthError extends Error {}

/** Every mutating admin action starts here. Throws rather than returning a flag
 * so a forgotten check is a crash, not a silent privilege escalation. */
export async function requireSession(form?: FormData): Promise<AdminSession> {
  const session = await getSession();
  if (!session) throw new AdminAuthError('unauthorized');
  if (form && !safeEqual(String(form.get(CSRF_INPUT_NAME) ?? ''), csrfToken(session))) {
    throw new AdminAuthError('bad_csrf');
  }
  return session;
}

export function actorFor(session: AdminSession): string {
  // The session id, never the secret or the cookie — audit rows are shown in
  // the admin UI and would otherwise leak a live credential.
  return `admin:${session.id.slice(0, 8)}`;
}
