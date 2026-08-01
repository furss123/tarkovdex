import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        // JSON data endpoints and the authenticated cron trigger, not indexable
        // content — see src/app/api.
        '/api/',
        // The operator's review desk. Also `noindex` on the page itself and
        // absent from sitemap.ts; this is the third layer, not the only one.
        '/*/admin',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
