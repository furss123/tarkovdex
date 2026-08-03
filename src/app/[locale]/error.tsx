'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    // Keep development diagnostics without exposing exception details or
    // stack traces in visitors' production consoles.
    if (process.env.NODE_ENV !== 'production') console.error(error);
  }, [error]);

  return (
    <section
      role="alert"
      className="mx-auto flex max-w-content flex-col items-start px-4 py-20 sm:px-6 sm:py-24"
    >
      <h1 className="text-2xl font-medium tracking-tight text-fg">
        {t('unexpectedTitle')}
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        {t('unexpectedBody')}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-touch items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          {t('retry')}
        </button>
        <Link
          href="/"
          className="inline-flex min-h-touch items-center rounded-md border border-border bg-surface px-5 text-sm font-medium text-fg hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {t('home')}
        </Link>
      </div>
    </section>
  );
}
