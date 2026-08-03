'use client';

import { formatRoubles } from '@/lib/format';
import type { EnrichedSearchHit, SearchDocument, SearchDomain } from '@/lib/search';
import { Link } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import { WatchlistToggle } from '@/components/economy/WatchlistToggle';
import { AddToBudgetButton } from '@/components/combat/AddToBudgetButton';

function domainLabel(
  t: ReturnType<typeof useTranslations<'search'>>,
  domain: SearchDomain,
): string {
  return t(`domains.${domain}`);
}

function HitMeta({ hit, locale }: { hit: EnrichedSearchHit; locale: Locale }) {
  const t = useTranslations('search');
  const { document: doc, ownedCount, questStatus, requiredByActiveQuests } = hit;
  const bits: string[] = [];

  if (doc.subtitle) bits.push(doc.subtitle);
  if (doc.numeric?.price != null) {
    bits.push(`${t('price')} ${formatRoubles(doc.numeric.price, locale)}`);
  }
  if (doc.numeric?.traderPrice != null) {
    bits.push(`${t('traderPrice')} ${formatRoubles(doc.numeric.traderPrice, locale)}`);
  }
  if (doc.numeric?.valuePerSlot != null) {
    bits.push(`${t('valuePerSlot')} ${formatRoubles(doc.numeric.valuePerSlot, locale)}`);
  }
  if (doc.numeric?.penetration != null) bits.push(`PEN ${doc.numeric.penetration}`);
  if (doc.numeric?.damage != null) bits.push(`DMG ${doc.numeric.damage}`);
  if (doc.numeric?.armorClass != null) bits.push(`Class ${doc.numeric.armorClass}`);
  if (doc.numeric?.profit != null) bits.push(formatRoubles(doc.numeric.profit, locale));
  if (doc.numeric?.raidDuration != null) bits.push(`${doc.numeric.raidDuration} min`);
  if (ownedCount != null) bits.push(`${t('ownedCount')} ${ownedCount}`);
  if (requiredByActiveQuests) bits.push(t('requiredByActive'));
  if (questStatus === 'active') bits.push(t('activeQuest'));
  if (questStatus === 'completed') bits.push(t('completedQuest'));

  if (bits.length === 0) return null;
  return <p className="mt-0.5 truncate text-xs text-muted">{bits.join(' · ')}</p>;
}

export function SearchHitButton({
  hit,
  active,
  id,
  onSelect,
}: {
  hit: EnrichedSearchHit;
  active: boolean;
  id: string;
  onSelect: () => void;
}) {
  const t = useTranslations('search');
  const locale = useLocale() as Locale;
  const doc = hit.document;
  const secondary =
    doc.titleEn && doc.titleEn !== doc.title
      ? doc.titleEn
      : doc.shortName && doc.shortName !== doc.title
        ? doc.shortName
        : null;

  return (
    <div
      className={`flex min-h-touch w-full items-stretch gap-1 rounded-md border ${
        active
          ? 'border-accent bg-accent/10'
          : 'border-transparent hover:border-border hover:bg-surface'
      }`}
    >
      <button
        type="button"
        id={id}
        role="option"
        aria-selected={active}
        onClick={onSelect}
        className="flex min-w-0 flex-1 flex-col items-start px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <div className="flex w-full min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-xs text-muted">{domainLabel(t, doc.domain)}</span>
          <span className="min-w-0 truncate text-sm text-fg">
            {doc.title}
            {secondary ? <span className="text-muted"> ({secondary})</span> : null}
          </span>
        </div>
        <HitMeta hit={hit} locale={locale} />
      </button>
      {doc.domain === 'item' ? (
        <div className="flex shrink-0 items-center gap-1 pr-2">
          <WatchlistToggle
            itemId={doc.id}
            baselinePrice={doc.numeric?.price ?? doc.numeric?.traderPrice ?? null}
            compact
          />
          <AddToBudgetButton itemId={doc.id} />
        </div>
      ) : null}
    </div>
  );
}

export function SearchRelatedList({
  related,
  onSelect,
}: {
  related: SearchDocument[];
  onSelect: (doc: SearchDocument) => void;
}) {
  const t = useTranslations('search');
  if (!related.length) return null;

  const tasks = related.filter((doc) => doc.domain === 'task');
  const crafts = related.filter((doc) => doc.domain === 'craft');
  const other = related.filter((doc) => doc.domain !== 'task' && doc.domain !== 'craft');

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-xs text-muted">{t('related')}</p>
      {tasks.length ? (
        <div>
          <p className="mb-1 text-xs text-muted">{t('relatedTasks')}</p>
          <ul className="space-y-1">
            {tasks.map((doc) => (
              <li key={`rel-task-${doc.id}`}>
                <Link
                  href={doc.href}
                  onClick={() => onSelect(doc)}
                  className="block min-h-touch rounded-md px-2 py-2 text-sm text-fg hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  {doc.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {crafts.length ? (
        <div>
          <p className="mb-1 text-xs text-muted">{t('relatedCrafts')}</p>
          <ul className="space-y-1">
            {crafts.map((doc) => (
              <li key={`rel-craft-${doc.id}`}>
                <Link
                  href={doc.href}
                  onClick={() => onSelect(doc)}
                  className="block min-h-touch rounded-md px-2 py-2 text-sm text-fg hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  {doc.title}
                  {doc.subtitle ? (
                    <span className="text-muted"> · {doc.subtitle}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {other.map((doc) => (
        <Link
          key={`rel-${doc.domain}-${doc.id}`}
          href={doc.href}
          onClick={() => onSelect(doc)}
          className="block min-h-touch rounded-md px-2 py-2 text-sm text-fg hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {domainLabel(t, doc.domain)} · {doc.title}
        </Link>
      ))}
    </div>
  );
}
