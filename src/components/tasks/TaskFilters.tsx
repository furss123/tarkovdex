'use client';

import { useTranslations } from 'next-intl';

export interface FilterOption {
  id: string;
  name: string;
}

const SELECT_CLASS =
  'rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40';

/**
 * Trader / map filter selects for the tasks page. Client-side filtering is
 * appropriate here because the full task list (a few hundred rows) is fetched
 * once by the server component — no server round-trip is needed per filter
 * change.
 */
export function TaskFilters({
  maps,
  mapId,
  onMapChange,
}: {
  maps: FilterOption[];
  mapId: string;
  onMapChange: (id: string) => void;
}) {
  const t = useTranslations('tasks');

  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={mapId}
        onChange={(e) => onMapChange(e.target.value)}
        aria-label={t('filterMap')}
        className={SELECT_CLASS}
      >
        <option value="">{t('allMaps')}</option>
        {maps.map((map) => (
          <option key={map.id} value={map.id}>
            {map.name}
          </option>
        ))}
      </select>
    </div>
  );
}
