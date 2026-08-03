'use client';

import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface TraderFilterOption {
  id: string;
  name: string;
  imageLink: string | null;
  taskCount: number;
}

export function TraderPortraitFilter({
  traders,
  selectedId,
  onChange,
}: {
  traders: TraderFilterOption[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations('tasks');
  const total = traders.reduce((sum, trader) => sum + (trader.taskCount ?? 0), 0);

  return (
    <section aria-labelledby="trader-filter-title" className="mb-5">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="trader-filter-title" className="text-sm font-medium text-fg">
            {t('selectTrader')}
          </h2>
          <p className="mt-1 text-xs text-muted">{t('questSequence')}</p>
        </div>
      </div>
      {/* Compact horizontal cards (~72px on desktop): portrait beside a
          single "name · quest count" line instead of a tall stacked tile. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <button
          type="button"
          aria-pressed={!selectedId}
          onClick={() => onChange('')}
          className={`flex min-h-touch items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors lg:h-[72px] ${
            !selectedId
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border bg-surface/30 text-muted hover:border-accent/50 hover:text-fg'
          }`}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-current/30 bg-bg/60">
            <Users className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[16px] font-medium leading-5 lg:line-clamp-1">
              {t('allTraders')}
            </span>
            <span className="mt-0.5 block text-[14px] leading-5 tabular-nums opacity-80">{total}</span>
          </span>
        </button>
        {traders.map((trader) => {
          const selected = selectedId === trader.id;
          return (
            <button
              key={trader.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(trader.id)}
              className={`flex min-h-touch items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors lg:h-[72px] ${
                selected
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-surface/30 text-muted hover:border-accent/50 hover:text-fg'
              }`}
            >
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-current/30 bg-bg/60">
                {trader.imageLink ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={trader.imageLink}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    className="size-full object-contain"
                  />
                ) : (
                  <Users className="size-5" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[16px] font-medium leading-5 lg:line-clamp-1">
                  {trader.name}
                </span>
                <span className="mt-0.5 block text-[14px] leading-5 tabular-nums opacity-80">
                  {trader.taskCount ?? 0}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
