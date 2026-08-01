import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The cryptographic half of admin auth, with no `next/headers` dependency, so
 * every security property below is covered by an actual test rather than by
 * reading the code and hoping. `admin-auth.ts` is the thin cookie plumbing over
 * this.
 */

export interface AdminSession {
  id: string;
  expiresAt: number;
}


export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function newSessionId(): string {
  return randomBytes(16).toString('hex');
}

export function encodeSession(session: AdminSession, secret: string): string {
  const payload = `${session.expiresAt}.${session.id}`;
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Null for anything that isn't a currently-valid session: malformed, tampered
 * with, signed by a different secret, or expired. There is no "expired but
 * otherwise fine" branch — an expired cookie is simply not a session.
 */
export function decodeSession(raw: string | undefined, secret: string | undefined, now = Date.now()): AdminSession | null {
  if (!raw || !secret) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [expires, id, signature] = parts;
  if (!expires || !id || !signature) return null;
  if (!safeEqual(signature, sign(`${expires}.${id}`, secret))) return null;
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  return { id, expiresAt };
}

/** Bound to the session id, so a token minted for one session cannot be
 * replayed against another. */
export function csrfFor(session: AdminSession, secret: string): string {
  return sign(`csrf:${session.id}`, secret);
}
