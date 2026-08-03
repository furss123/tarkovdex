'use client';

import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Re-request the current server render.
 *
 * `useTransition` is what keeps this from becoming a request amplifier: the
 * button is disabled for the whole duration of the refresh, so an impatient
 * user cannot queue a dozen upstream fetches from one failed page.
 */
export function RetryAction({ label }: { label?: string }) {
  const router = useRouter();
  const t = useTranslations('status');
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="inline-flex min-h-touch shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[14px] leading-5 text-fg transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:text-muted"
    >
      <RefreshCw
        className={`size-[14px] ${pending ? 'animate-spin motion-reduce:animate-none' : ''}`}
        aria-hidden="true"
      />
      {pending ? t('retrying') : (label ?? t('retry'))}
    </button>
  );
}
