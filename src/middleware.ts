import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { rewritePrivateLocalePath } from './lib/locale-availability';

const intlMiddleware = createMiddleware(routing);

/**
 * Temporary (non-permanent) redirect for unpublished locales such as Chinese.
 * Pathname and query string are preserved so indexed `/zh` URLs land on the
 * equivalent Korean page instead of 404ing. Hash is client-only and follows
 * browser redirect behaviour.
 */
function redirectPrivateLocale(request: NextRequest): NextResponse | null {
  const nextPath = rewritePrivateLocalePath(request.nextUrl.pathname);
  if (!nextPath) return null;
  const url = request.nextUrl.clone();
  url.pathname = nextPath;
  return NextResponse.redirect(url);
}

export default function middleware(request: NextRequest) {
  const privateRedirect = redirectPrivateLocale(request);
  if (privateRedirect) return privateRedirect;
  return intlMiddleware(request);
}

export const config = {
  // Match the root and every path except Next internals, Vercel internals,
  // API routes, and files with an extension (images, fonts, etc.).
  matcher: ['/', '/(ko|zh|en)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
