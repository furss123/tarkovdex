'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { RELATED_LINK_CLASS } from '@/components/tools/relatedLinkClass';
import {
  buildRelatedToolLinks,
  type PatchImpact,
  type PatchImpactArea,
} from '@/lib/live/patch-impact';

function Chip({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs ${className || 'border-border text-muted'}`}
    >
      {children}
    </span>
  );
}

export function PatchImpactBlock({ impact }: { impact: PatchImpact }) {
  const t = useTranslations('patchImpact');
  const tools = buildRelatedToolLinks(impact.impactAreas);

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border/80 bg-bg/40 p-3">
      <p className="text-xs font-medium text-fg">{t('whatChanged')}</p>
      {impact.shortSummary ? (
        <p className="text-xs text-muted">{impact.shortSummary}</p>
      ) : (
        <p className="text-xs text-muted">{t('noSummary')}</p>
      )}

      <div className="flex flex-wrap gap-1.5" aria-label={t('impactAreas')}>
        {impact.impactAreas.map((area) => (
          <Chip key={area}>{t(`areas.${area}`)}</Chip>
        ))}
        <Chip>{t(`scope.${impact.gameModeScope}`)}</Chip>
        <Chip>{t(`review.${impact.reviewStatus}`)}</Chip>
        <Chip>{t(`confidence.${impact.confidence}`)}</Chip>
      </div>

      <p className="text-xs text-muted">
        <span className="text-fg">{t('dataSync')}</span>{' '}
        {t(`sync.${impact.dataSync.overall}`)}
        {impact.patchVersion ? ` · ${t('patchVersion', { version: impact.patchVersion })}` : ''}
      </p>

      {tools.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-xs text-fg">{t('relatedTools')}</span>
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className={`${RELATED_LINK_CLASS} mt-0 text-xs`}
            >
              {t(tool.messageKey)}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CurrentPatchSummaryCard({ impact }: { impact: PatchImpact | null }) {
  const t = useTranslations('patchImpact');
  if (!impact) return null;
  const tools = buildRelatedToolLinks(impact.impactAreas);

  return (
    <section
      className="mt-3 rounded-lg border border-border bg-surface p-4"
      aria-labelledby="current-patch-heading"
    >
      <h3 id="current-patch-heading" className="text-sm font-medium text-fg">
        {t('currentPatch')}
      </h3>
      <p className="mt-2 text-sm text-fg">{impact.title}</p>
      {impact.shortSummary ? <p className="mt-1 text-xs text-muted">{impact.shortSummary}</p> : null}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {impact.patchVersion ? (
          <Chip className="border-accent/40 text-accent">
            {t('patchVersion', { version: impact.patchVersion })}
          </Chip>
        ) : null}
        {impact.impactAreas.map((area) => (
          <Chip key={area}>{t(`areas.${area}`)}</Chip>
        ))}
        <Chip>{t(`scope.${impact.gameModeScope}`)}</Chip>
        <Chip>{t(`sync.${impact.dataSync.overall}`)}</Chip>
        <Chip>{t(`review.${impact.reviewStatus}`)}</Chip>
      </div>
      {tools.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-xs text-fg">{t('relatedTools')}</span>
          {tools.map((tool) => (
            <Link key={tool.href} href={tool.href} className={`${RELATED_LINK_CLASS} mt-0 text-xs`}>
              {t(tool.messageKey)}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ImpactAreaFilterRow({
  value,
  onChange,
  available,
}: {
  value: PatchImpactArea | 'all';
  onChange: (next: PatchImpactArea | 'all') => void;
  available: Array<PatchImpactArea | 'all'>;
}) {
  const t = useTranslations('patchImpact');
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label={t('impactAreas')}
    >
      {available.map((area) => {
        const selected = value === area;
        return (
          <button
            key={area}
            type="button"
            onClick={() => onChange(area)}
            aria-pressed={selected}
            className={`inline-flex min-h-touch shrink-0 items-center rounded-lg border px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
              selected
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-muted hover:text-fg'
            }`}
          >
            {area === 'all' ? t('filterAllAreas') : t(`areas.${area}`)}
          </button>
        );
      })}
    </div>
  );
}
