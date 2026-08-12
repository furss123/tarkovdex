/**
 * Single source of truth for public navigation and the sitemap.
 *
 * Scope note (single-page redesign): TarkovDex is now one dashboard plus two
 * standalone pages that exist for reasons other than content — a donation page
 * and a privacy policy (the latter is a hard requirement for serving ads, so it
 * cannot be folded into the dashboard). There is no primary nav any more: the
 * header carries only the mode and language controls, and these links live in
 * the footer.
 */

export type FooterLink = {
  key: 'support' | 'privacy';
  href: string;
};

export const FOOTER_LINKS: readonly FooterLink[] = [
  { key: 'support', href: '/support' },
  { key: 'privacy', href: '/privacy' },
] as const;

/** Every indexable route, relative to the locale prefix. */
export const SITEMAP_ROUTES: readonly string[] = [
  '',
  '/support',
  '/privacy',
] as const;
