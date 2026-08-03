import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * Web app manifest (Phase 8).
 *
 * Single manifest for all locales: `start_url` lands on the default locale
 * (`/ko`). After install, locale switching uses the existing path-prefix router.
 * Icons are the real on-disk sizes only — no fake upscaled entries.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'TarkovDex',
    short_name: 'TarkovDex',
    description:
      'Unofficial Escape from Tarkov guide — flea prices, quests, maps, and live updates.',
    start_url: '/ko',
    scope: '/',
    display: 'standalone',
    background_color: '#17181b',
    theme_color: '#17181b',
    lang: 'ko',
    dir: 'ltr',
    categories: ['games', 'utilities'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    related_applications: [],
    prefer_related_applications: false,
  };
}

/** Absolute origin used by docs/tests; Next serves the relative icon paths. */
export const MANIFEST_SITE_URL = SITE_URL;
