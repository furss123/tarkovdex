'use client';

import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import type { MarketItem } from '@/types/tarkov';
import { formatPercent, formatRelativeTime, formatRoubles } from '@/lib/format';

export type ItemSort =
  | 'valuePerSlot'
  | 'referenceValue'
  | 'change'
  | 'freshness'
  | 'name';

function changeClass(value: number | null): string {
  if (value == null || value === 0) return 'text-muted';
  return value > 0 ? 'text-positive' : 'text-negative';
}

function PriceChange({
  value,
  locale,
}: {
  value: number | null;
  locale: Locale;
}) {
  const Icon = value == null || value === 0 ? Minus : value > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center justify-end gap-1 ${changeClass(value)}`}>
      <Icon className="size-[13px] shrink-0" aria-hidden="true" />
      <span>{formatPercent(value, locale)}</span>
    </span>
  );
}

function FreshnessBadge({
  item,
  locale,
  now,
}: {
  item: MarketItem;
  locale: Locale;
  now: number;
}) {
  const t = useTranslations('items.freshness');
  const hours = item.freshnessHours;
  const state =
    hours == null ? 'unknown' : hours <= 12 ? 'fresh' : hours <= 24 ? 'aging' : 'stale';

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[12px] leading-none ${
        state === 'fresh'
          ? 'border-positive/50 bg-positive/10 text-positive'
          : state === 'aging'
            ? 'border-accent/50 bg-accent/10 text-accent'
            : state === 'stale'
              ? 'border-negative/50 bg-negative/10 text-negative'
              : 'border-border bg-surface-2 text-muted'
      }`}
    >
      <span>{t(state)}</span>
      <span aria-hidden="true">·</span>
      <span>{formatRelativeTime(item.updated, locale, now)}</span>
    </span>
  );
}

function ItemIdentity({
  item,
  compact = false,
}: {
  item: MarketItem;
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-bg ${
          compact ? 'size-[52px]' : 'size-[40px]'
        }`}
      >
        {item.iconLink ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.iconLink}
            alt=""
            width={compact ? 52 : 40}
            height={compact ? 52 : 40}
            loading="lazy"
            className="size-full object-contain"
          />
        ) : null}
      </span>
      <div className="min-w-0">
        <div className="line-clamp-2 text-[14px] font-medium leading-5 text-fg">{item.name}</div>
        <div className="truncate text-[12px] leading-4 text-muted">{item.shortName}</div>
      </div>
    </div>
  );
}

export function ItemsTable({
  items,
  locale,
  now,
  sort,
  direction,
  onSort,
}: {
  items: MarketItem[];
  locale: Locale;
  now: number;
  sort: ItemSort;
  direction: 'asc' | 'desc';
  onSort: (sort: ItemSort) => void;
}) {
  const t = useTranslations('items');
  const col = useTranslations('items.columns');

  function SortLabel({
    field,
    label,
    align = 'right',
  }: {
    field: ItemSort;
    label: string;
    align?: 'left' | 'right';
  }) {
    const active = sort === field;
    const Icon = direction === 'asc' ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex min-h-[44px] items-center gap-1 rounded px-1 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          active ? 'text-accent' : 'text-muted hover:text-fg'
        } ${align === 'left' ? '-ml-1' : ''}`}
        aria-label={t('sortBy', { field: label })}
      >
        {label}
        {active ? <Icon className="size-[13px]" aria-hidden="true" /> : null}
      </button>
    );
  }

  return (
    <>
      <div className="space-y-2 lg:hidden">
        {items.map((item) => (
          <article
            key={item.id}
            tabIndex={0}
            className="rounded-lg border border-border bg-surface p-[14px] transition-colors hover:border-muted/60 hover:bg-surface-2/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <ItemIdentity item={item} compact />
              </div>
              <span className="shrink-0 rounded border border-border bg-bg px-2 py-1 text-[12px] leading-none text-muted">
                {item.valueSource === 'trader' ? t('traderShort') : t('fleaShort')}
              </span>
            </div>

            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] leading-4 text-muted">{col('valuePerSlot')}</p>
                <p className="truncate text-[21px] font-medium leading-7 tabular-nums text-accent">
                  {formatRoubles(item.valuePerSlot, locale)}
                </p>
              </div>
              <div className="text-right">
                <FreshnessBadge item={item} locale={locale} now={now} />
              </div>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border/80 pt-2">
              <div className="min-w-0">
                <p className="text-[12px] leading-4 text-muted">{col('referenceValue')}</p>
                <p className="truncate text-[13px] leading-5 tabular-nums text-fg">
                  {formatRoubles(item.referenceValue, locale)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[12px] leading-4 text-muted">{col('size')}</p>
                <p className="text-[13px] leading-5 text-fg">
                  {item.width}×{item.height} · {t('slots', { count: item.slotCount })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[12px] leading-4 text-muted">{col('change48h')}</p>
                <p className="text-[13px] leading-5 tabular-nums">
                  <PriceChange value={item.changeLast48hPercent} locale={locale} />
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden max-w-full rounded-lg border border-border lg:block">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-[14px] leading-5">
          <colgroup>
            <col className="w-[36%]" />
            <col className="w-[8%]" />
            <col className="w-[18%]" />
            <col className="w-[17%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead className="sticky top-[68px] z-10">
            <tr className="h-[48px] border-b border-border bg-surface-2 text-left">
              <th
                className="px-3 text-left"
                aria-sort={
                  sort === 'name' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
                }
              >
                <SortLabel field="name" label={col('item')} align="left" />
              </th>
              <th className="whitespace-nowrap px-3 text-right text-[12px] font-medium text-muted">
                {col('size')}
              </th>
              <th
                className="whitespace-nowrap px-3 text-right"
                aria-sort={
                  sort === 'referenceValue'
                    ? direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                <SortLabel field="referenceValue" label={col('referenceValue')} />
              </th>
              <th
                className="whitespace-nowrap px-3 text-right"
                aria-sort={
                  sort === 'valuePerSlot'
                    ? direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                <SortLabel field="valuePerSlot" label={col('valuePerSlot')} />
              </th>
              <th
                className="whitespace-nowrap px-3 text-right"
                aria-sort={
                  sort === 'change'
                    ? direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                <SortLabel field="change" label={col('change48h')} />
              </th>
              <th
                className="whitespace-nowrap px-3 text-right"
                aria-sort={
                  sort === 'freshness'
                    ? direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                <SortLabel field="freshness" label={col('updated')} />
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                tabIndex={0}
                className="h-[68px] border-b border-border/70 bg-surface last:border-0 hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
              >
                <td className="max-w-0 px-3 py-2">
                  <ItemIdentity item={item} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-[13px] text-muted">
                  {item.width}×{item.height}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-fg">
                  {formatRoubles(item.referenceValue, locale)}
                  <div className="text-[12px] leading-4 text-muted">
                    {item.valueSource === 'trader' ? t('traderValue') : t('fleaNetValue')}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-accent">
                  {formatRoubles(item.valuePerSlot, locale)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-[13px] tabular-nums">
                  <PriceChange value={item.changeLast48hPercent} locale={locale} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <FreshnessBadge item={item} locale={locale} now={now} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
