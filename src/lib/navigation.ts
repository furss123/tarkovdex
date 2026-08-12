/**
 * Single source of truth for public navigation and the sitemap.
 *
 * The site is a dashboard plus three topic pages, each of which exists because
 * people arrive at it directly from search — Gunsmith especially, which is the
 * single most-searched thing this project covers. A summary on the home page
 * cannot rank for those queries; a page with the whole answer on it can. The
 * remaining two routes (donation, privacy policy) exist for reasons other than
 * content and stay in the footer.
 */

export type NavLink = {
  /** Key under the `nav` message namespace. */
  key: 'bosses' | 'hideout' | 'gunsmith';
  href: string;
};

/** Primary navigation, in header order. */
export const NAV_LINKS: readonly NavLink[] = [
  { key: 'bosses', href: '/bosses' },
  { key: 'hideout', href: '/hideout' },
  { key: 'gunsmith', href: '/gunsmith' },
] as const;

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
  ...NAV_LINKS.map((link) => link.href),
  '/support',
  '/privacy',
] as const;
