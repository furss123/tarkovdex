import { timingSafeEqual } from 'node:crypto';

/**
 * Cron authorization, in its own module so it can actually be tested — a route
 * file may only export Next's own handlers, so a helper defined inside one is
 * unreachable from a test.
 *
 * `Authorization: Bearer <secret>` only. Never a query parameter: URLs end up in
 * access logs, referrer headers and browser history.
 */
export function authorizeCron(headerValue: string | null, secret: string | undefined): boolean {
  // Refusing everything when unset is the safe default. An unauthenticated
  // endpoint that triggers collection is a free way for anyone to spend the X
  // and Gemini quota this whole design exists to control.
  if (!secret) return false;

  const provided = headerValue?.startsWith('Bearer ') ? headerValue.slice(7) : '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
