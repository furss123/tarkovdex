import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('nav');
  return (
    <section className="mx-auto flex max-w-content flex-col items-start px-4 py-24 sm:px-6">
      <p className="text-sm text-accent">404</p>
      <h1 className="mt-2 text-2xl font-medium tracking-tight">
        {t('brand')}
      </h1>
      <Link
        href="/"
        className="mt-6 text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
      >
        {t('items')}
      </Link>
    </section>
  );
}
