import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <section className="mx-auto flex max-w-content flex-col items-start px-4 py-20 sm:px-6 sm:py-24">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="mt-2 text-2xl font-medium tracking-tight text-fg">
        {t('notFoundTitle')}
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        {t('notFoundBody')}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/"
          className="inline-flex min-h-touch items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          {t('home')}
        </Link>
        <Link
          href="/progression/tasks"
          className="inline-flex min-h-touch items-center rounded-md border border-border px-5 text-sm font-medium text-fg hover:border-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          {t('browseTasks')}
        </Link>
      </div>
    </section>
  );
}
