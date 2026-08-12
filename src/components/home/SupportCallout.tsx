import { getTranslations } from 'next-intl/server';
import { Heart } from 'lucide-react';
import { KOFI_URL } from '@/lib/site';

/**
 * The donation ask, at the bottom of the dashboard.
 *
 * Placed last and styled as a quiet bordered row rather than a filled button:
 * this is a tool people leave open, and a support prompt competing with live
 * data for attention is the fastest way to make both feel like advertising.
 * Amber is limited to the icon and the hover state.
 */
export async function SupportCallout() {
  const t = await getTranslations('home');

  return (
    <aside className="flex flex-col items-start justify-between gap-3 rounded-lg border border-border bg-surface/20 px-4 py-3 sm:flex-row sm:items-center">
      <p className="min-w-0 text-sm text-muted">{t('supportPrompt')}</p>
      <a
        href={KOFI_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-touch shrink-0 items-center gap-2 rounded-md border border-border px-4 text-sm text-fg transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <Heart className="size-4 text-accent" aria-hidden="true" />
        {t('supportCta')}
      </a>
    </aside>
  );
}
