import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { ExternalLink } from 'lucide-react';
import type { GameMap } from '@/types/tarkov';
import type { Locale } from '@/i18n/routing';
import { MAP_ATMOSPHERE } from '@/lib/atmosphere';
import { formatChance } from '@/lib/format';
import { ExpandableText } from './ExpandableText';

/**
 * One map's info card. Grid layout (not a table like items, not a bordered
 * list like tasks) because each card is self-contained content of varying
 * height — description length and boss count both vary per map. Reuses the
 * same border/muted-text/accent primitives as ItemsTable and TaskCard rather
 * than introducing new styling.
 *
 * The five maps with shipped atmosphere art (see `MAP_ATMOSPHERE`) get a short
 * banner carrying the map name; every other map keeps the plain heading. That
 * asymmetry is deliberate — inventing stand-in art for the remaining maps would
 * either mislabel scenery or add filler. Stats, bosses, description and the
 * wiki link always sit below the banner on the solid card surface, so the image
 * never overlaps data.
 */
export async function MapCard({
  map,
  locale,
}: {
  map: GameMap;
  locale: Locale;
}) {
  const t = await getTranslations('maps');
  const atmosphere = MAP_ATMOSPHERE[map.id];

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border">
      {atmosphere ? (
        <div className="relative isolate flex h-[110px] items-end px-5 pb-3 sm:h-[140px]">
          <Image
            src={atmosphere}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="-z-10 object-cover object-center"
          />
          <div
            className="absolute inset-0 -z-10 bg-gradient-to-t from-bg via-bg/75 to-bg/40"
            aria-hidden="true"
          />
          <h2 className="text-base text-fg">{map.name}</h2>
        </div>
      ) : null}

      <div className="flex flex-col p-5">
      {atmosphere ? null : <h2 className="text-base text-fg">{map.name}</h2>}

      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-[13px] leading-5 text-muted">
        {map.players ? (
          <div>
            <span>{t('players')}: </span>
            <span className="text-fg">{map.players}</span>
          </div>
        ) : null}
        {map.raidDuration != null ? (
          <div>
            <span>{t('raidDuration')}: </span>
            <span className="text-fg">
              {t('raidDurationValue', { minutes: map.raidDuration })}
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <p className="text-[13px] leading-5 text-muted">{t('bosses')} · {t('spawnChance')}</p>
        {map.bosses.length > 0 ? (
          <ul className="mt-1.5 space-y-1">
            {map.bosses.map((spawn, i) => (
              <li
                key={spawn.boss?.id ?? i}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-fg">{spawn.boss?.name}</span>
                <span className="text-xs tabular-nums text-muted">
                  {formatChance(spawn.spawnChance, locale)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-sm text-muted">{t('noBosses')}</p>
        )}
      </div>

      {map.description ? (
        <div className="mt-4">
          <ExpandableText
            text={map.description}
            moreLabel={t('showDescription')}
            lessLabel={t('hideDescription')}
          />
        </div>
      ) : null}

      {map.wiki ? (
        <a
          href={map.wiki}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex min-h-touch items-center gap-1 rounded text-xs text-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {t('wikiLink')}
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      ) : null}
      </div>
    </div>
  );
}
