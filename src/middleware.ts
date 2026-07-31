import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match the root and every path except Next internals, Vercel internals,
  // API routes, and files with an extension (images, fonts, etc.).
  matcher: ['/', '/(ko|zh|en)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
