/**
 * Single source of truth for public navigation visibility. Routes and page
 * code stay in the tree; only entry points (header, footer, sitemap) read
 * this. Flip `visibility` to re-publish without restoring deleted code.
 */

export type VisibilityStatus = 'visible' | 'hidden';

export type HiddenReason =
  | 'incomplete'
  | 'support'
  | 'locale-disabled'
  | 'internal';

export type NavigationItem = {
  key: string;
  href?: string;
  /** Path prefix used for active-state matching; defaults to `href`. */
  activePath?: string;
  visibility: VisibilityStatus;
  hiddenReason?: HiddenReason;
  children?: NavigationItem[];
};

/**
 * Desktop/mobile primary nav. Groups whose children are all hidden are
 * dropped by `getVisibleNavigation()`.
 */
export const NAVIGATION: NavigationItem[] = [
  {
    key: 'news',
    href: '/news',
    visibility: 'visible',
  },
  {
    key: 'trade',
    visibility: 'visible',
    children: [
      {
        key: 'items',
        href: '/economy/items',
        visibility: 'visible',
      },
      {
        key: 'watchlist',
        href: '/economy/watchlist',
        visibility: 'visible',
      },
    ],
  },
  {
    key: 'hideout',
    visibility: 'visible',
    children: [
      {
        key: 'barters',
        href: '/economy/barters',
        visibility: 'visible',
      },
      {
        key: 'craftCalculator',
        href: '/economy/craft-calculator',
        visibility: 'visible',
      },
    ],
  },
  {
    key: 'progression',
    visibility: 'visible',
    children: [
      {
        key: 'tasks',
        href: '/progression/tasks',
        // Tracker lives under the same prefix; keep the list page active only
        // for exact /tasks and /tasks/:slug, not /tasks/tracker.
        activePath: '/progression/tasks',
        visibility: 'visible',
      },
      {
        key: 'gunsmith',
        href: '/progression/gunsmith',
        visibility: 'visible',
      },
      {
        key: 'questTracker',
        href: '/progression/tasks/tracker',
        visibility: 'visible',
      },
      {
        key: 'beginner',
        href: '/beginner',
        visibility: 'hidden',
        hiddenReason: 'incomplete',
      },
    ],
  },
  {
    key: 'combat',
    visibility: 'visible',
    children: [
      {
        key: 'ammo',
        href: '/combat/ammo',
        visibility: 'visible',
      },
      {
        key: 'armor',
        href: '/combat/armor',
        visibility: 'visible',
      },
      {
        key: 'budgetBuilder',
        href: '/combat/budget-builder',
        visibility: 'visible',
      },
    ],
  },
  {
    key: 'maps',
    href: '/maps',
    visibility: 'visible',
  },
  {
    key: 'about',
    href: '/about',
    visibility: 'hidden',
    hiddenReason: 'internal',
  },
  {
    key: 'support',
    href: '/support',
    visibility: 'hidden',
    hiddenReason: 'support',
  },
];

/**
 * Footer utility links. Share visibility rules with the header so a hidden
 * feature cannot leak through a second public surface.
 */
export const FOOTER_LINKS: NavigationItem[] = [
  { key: 'news', href: '/news', visibility: 'visible' },
  { key: 'items', href: '/economy/items', visibility: 'visible' },
  { key: 'watchlist', href: '/economy/watchlist', visibility: 'visible' },
  { key: 'barters', href: '/economy/barters', visibility: 'visible' },
  {
    key: 'craftCalculator',
    href: '/economy/craft-calculator',
    visibility: 'visible',
  },
  {
    key: 'budgetBuilder',
    href: '/combat/budget-builder',
    visibility: 'visible',
  },
  { key: 'tasks', href: '/progression/tasks', visibility: 'visible' },
  { key: 'gunsmith', href: '/progression/gunsmith', visibility: 'visible' },
  {
    key: 'questTracker',
    href: '/progression/tasks/tracker',
    visibility: 'visible',
  },
  { key: 'ammo', href: '/combat/ammo', visibility: 'visible' },
  { key: 'armor', href: '/combat/armor', visibility: 'visible' },
  { key: 'maps', href: '/maps', visibility: 'visible' },
  {
    key: 'beginner',
    href: '/beginner',
    visibility: 'hidden',
    hiddenReason: 'incomplete',
  },
  { key: 'status', href: '/status', visibility: 'visible' },
  { key: 'localData', href: '/local-data', visibility: 'visible' },
  { key: 'about', href: '/about', visibility: 'visible' },
  {
    key: 'support',
    href: '/support',
    visibility: 'hidden',
    hiddenReason: 'support',
  },
];

/** Category routes worth listing in the sitemap (visible public content). */
export const SITEMAP_ROUTES: readonly string[] = [
  '',
  '/about',
  '/news',
  '/economy/items',
  '/economy/watchlist',
  '/economy/barters',
  '/economy/craft-calculator',
  '/progression/tasks',
  '/progression/gunsmith',
  '/progression/tasks/tracker',
  '/combat/ammo',
  '/combat/armor',
  '/combat/budget-builder',
  '/maps',
  '/status',
  '/local-data',
] as const;

function isVisible(item: NavigationItem): boolean {
  return item.visibility === 'visible';
}

/** Header/mobile tree with hidden leaves and empty groups removed. */
export function getVisibleNavigation(
  items: NavigationItem[] = NAVIGATION,
): NavigationItem[] {
  const result: NavigationItem[] = [];
  for (const item of items) {
    if (!isVisible(item)) continue;
    if (item.children) {
      const children = item.children.filter(isVisible);
      if (children.length === 0) continue;
      result.push({ ...item, children });
      continue;
    }
    result.push(item);
  }
  return result;
}

export function getVisibleFooterLinks(
  items: NavigationItem[] = FOOTER_LINKS,
): NavigationItem[] {
  return items.filter((item) => isVisible(item) && item.href);
}

export function activePathFor(item: NavigationItem): string {
  return item.activePath ?? item.href ?? '';
}

/**
 * Active matching for leaf links. Quest list must not light up for the
 * tracker URL that shares the `/progression/tasks` prefix.
 */
export function isActivePath(pathname: string, item: NavigationItem): boolean {
  const activePath = activePathFor(item);
  if (!activePath) return false;
  if (item.key === 'tasks') {
    if (pathname === '/progression/tasks') return true;
    if (pathname.startsWith('/progression/tasks/')) {
      return !pathname.startsWith('/progression/tasks/tracker');
    }
    return false;
  }
  return pathname === activePath || pathname.startsWith(`${activePath}/`);
}

/** True when any visible descendant matches the current path. */
export function isGroupActive(
  pathname: string,
  item: NavigationItem,
): boolean {
  if (!item.children) return isActivePath(pathname, item);
  return item.children.some((child) => isActivePath(pathname, child));
}
