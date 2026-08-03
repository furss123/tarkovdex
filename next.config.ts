import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

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
      // Service worker must revalidate quickly so rollbacks/kill-switches land.
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      {
        source: '/offline.html',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/:locale(ko|zh|en)/items',
        destination: '/:locale/economy/items',
        permanent: true,
      },
      {
        source: '/:locale(ko|zh|en)/tasks',
        destination: '/:locale/progression/tasks',
        permanent: true,
      },
      {
        source: '/:locale(ko|zh|en)/economy',
        destination: '/:locale/economy/items',
        permanent: true,
      },
      {
        source: '/:locale(ko|zh|en)/progression',
        destination: '/:locale/progression/tasks',
        permanent: true,
      },
      {
        source: '/:locale(ko|zh|en)/combat',
        destination: '/:locale/combat/ammo',
        permanent: true,
      },
    ];
  },
  images: {
    // tarkov.dev serves item icons/images from assets.tarkov.dev.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'assets.tarkov.dev',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
