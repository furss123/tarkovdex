import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
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
