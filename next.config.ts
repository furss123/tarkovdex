import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Routes that existed before the single-page redesign. They are 301'd to the
 * dashboard rather than left to 404 because they are indexed and linked: a
 * redirect keeps a visitor arriving from a search result or an old bookmark on
 * a working page, and tells the crawler the address is retired rather than
 * temporarily broken.
 *
 * Listed as prefixes with a wildcard tail so quest detail URLs
 * (`/ko/progression/tasks/:slug`) are covered as well as the section roots.
 */
const RETIRED_SECTIONS = [
  'news',
  'items',
  'tasks',
  'maps',
  'economy',
  'progression',
  'combat',
  'beginner',
  'search',
  'status',
  'local-data',
  'about',
  'admin',
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
      // The service worker is now a kill switch (see public/sw.js). It must
      // revalidate on every check so clients still holding the old worker pick
      // this replacement up promptly.
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
        ],
      },
    ];
  },
  async redirects() {
    return RETIRED_SECTIONS.flatMap((section) => [
      {
        source: `/:locale(ko|zh|en)/${section}`,
        destination: '/:locale',
        permanent: true,
      },
      {
        source: `/:locale(ko|zh|en)/${section}/:path*`,
        destination: '/:locale',
        permanent: true,
      },
    ]);
  },
  images: {
    // tarkov.dev serves item icons and boss portraits from assets.tarkov.dev.
    remotePatterns: [{ protocol: 'https', hostname: 'assets.tarkov.dev' }],
  },
};

export default withNextIntl(nextConfig);
