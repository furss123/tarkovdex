import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { isValidLocale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getCombatDataset } from '@/lib/tarkov-tools';
import { getTasks } from '@/lib/tarkov';
import { settleModePair } from '@/lib/settle-mode-pair';
import { BeginnerFlow } from '@/components/beginner/BeginnerFlow';
import { DataError } from '@/components/tools/ToolShell';

type Props = { params: Promise<{ locale: string }> };

export const revalidate = 900;

export async function generateMetadata({ params }: Props) {
  const raw = (await params).locale;
  const locale = (isValidLocale(raw) ? raw : 'ko') as Locale;
  return buildPageMetadata({ locale, page: 'beginner', path: '/beginner' });
}

export default async function BeginnerPage({ params }: Props) {
  const raw = (await params).locale;
  const locale = (isValidLocale(raw) ? raw : 'ko') as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('beginner');

  const [combat, tasks] = await Promise.all([
    settleModePair({
      regular: getCombatDataset(locale, 'regular'),
      pve: getCombatDataset(locale, 'pve'),
    }),
    settleModePair({
      regular: getTasks({ locale, gameMode: 'regular' }),
      pve: getTasks({ locale, gameMode: 'pve' }),
    }),
  ]);

  if (!combat.regular && !combat.pve) {
    return (
      <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <DataError message={t('error')} />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-content px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-[28px] font-medium leading-9 tracking-tight text-fg sm:text-[30px] sm:leading-10">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-3xl text-[16px] leading-6 text-muted">{t('description')}</p>
      </header>
      <BeginnerFlow
        regularCombat={combat.regular}
        pveCombat={combat.pve}
        regularTasks={tasks.regular ?? []}
        pveTasks={tasks.pve ?? []}
      />
    </section>
  );
}
