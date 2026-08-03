import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Locale } from '@/i18n/routing';
import { buildDetailPageMetadata } from '@/lib/metadata';
import { getPatchNotePage } from '@/lib/newsroom/patch-note-page';
import { PatchNoteExplorer } from '@/components/news/PatchNoteExplorer';
import { Link } from '@/i18n/navigation';

type PageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export const revalidate = 300;
export const maxDuration = 30;

export async function generateMetadata({ params }: PageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale = rawLocale as Locale;
  try {
    const model = await getPatchNotePage(locale, slug);
    if (!model) {
      return buildDetailPageMetadata({
        locale,
        path: `/news/patch/${slug}`,
        title: 'Patch notes',
        description: 'Official Escape from Tarkov patch notes on TarkovDex.',
      });
    }
    const description =
      model.structured.summary.slice(0, 3).join(' · ') ||
      model.entry.content.slice(0, 160);
    return buildDetailPageMetadata({
      locale,
      path: `/news/patch/${slug}`,
      title: model.structured.version
        ? `Patch ${model.structured.version} — ${model.cardTitle}`
        : model.cardTitle,
      description,
    });
  } catch {
    return buildDetailPageMetadata({
      locale,
      path: `/news/patch/${slug}`,
      title: 'Patch notes',
      description: 'Official Escape from Tarkov patch notes on TarkovDex.',
    });
  }
}

export default async function PatchNotePage({ params }: PageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('patchNotes');
  const model = await getPatchNotePage(locale, slug);
  if (!model) notFound();

  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <p className="mb-6 text-xs text-muted">
        <Link
          href="/news"
          className="min-h-touch inline-flex items-center text-fg underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {t('backToNews')}
        </Link>
      </p>
      <PatchNoteExplorer model={model} locale={locale} />
    </section>
  );
}
