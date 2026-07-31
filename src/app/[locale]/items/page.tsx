import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { permanentRedirect } from 'next/navigation';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'items', path: '/economy/items' });
}

/**
 * No `searchParams` here on purpose — reading them makes a Next.js route
 * fully dynamic, which was defeating ISR for this page's 15.8MB `items`
 * fetch (see CLAUDE.md > "items — client-side search"). Search/filtering now
 * happens entirely in ItemsExplorer, client-side, over the full catalog.
 *
 * Fetches both PvP (regular) and PvE modes at build time, so the toggle
 * has no load time.
 */
export default async function ItemsPage({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  permanentRedirect(`/${locale}/economy/items`);
}
