'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Moon, Sun } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const CLOCK_TICK_MS = 100;
/** Tarkov's day/night cycle runs at 7x real time. The two raid time variants
 * are exactly 12 in-game hours apart — a player's raid can land on either,
 * so both are shown side by side rather than picking one. Formula reverse-
 * derived from a public real-time-to-Tarkov-time calculator and confirmed
 * against a live reading (matched within seconds, accounting for read lag). */
const BASE_OFFSET_MS = 3 * HOUR_MS;
const VARIANT_OFFSET_MS = 12 * HOUR_MS;

function gameTimeOfDay(nowMs: number, variantA: boolean) {
  const offset = BASE_OFFSET_MS + (variantA ? 0 : VARIANT_OFFSET_MS);
  const msOfDay = (offset + 7 * nowMs) % DAY_MS;
  return {
    hours: Math.floor(msOfDay / HOUR_MS),
    minutes: Math.floor((msOfDay % HOUR_MS) / MINUTE_MS),
    seconds: Math.floor((msOfDay % MINUTE_MS) / 1000),
  };
}

/** Rough night-vision-recommended window — not tied to any specific map's
 * exact dusk/dawn, just a readable heuristic for the badge. */
function isNight(hours: number): boolean {
  return hours >= 21 || hours < 7;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ClockReading({
  label,
  hours,
  minutes,
  seconds,
  nightLabel,
}: {
  label: string;
  hours: number;
  minutes: number;
  seconds: number;
  nightLabel: string;
}) {
  const night = isNight(hours);
  return (
    <div
      className="flex min-w-0 flex-col items-center justify-center"
      aria-label={label}
    >
      <span className="mb-1 text-[13px] leading-4 text-muted" aria-hidden="true">
        {label}
      </span>
      <div className="flex items-center justify-center gap-2 sm:gap-3">
        {night ? (
          <Moon
            className="size-4 shrink-0 text-accent sm:size-6 md:size-7"
            aria-hidden="true"
          />
        ) : (
          <Sun
            className="size-4 shrink-0 text-muted sm:size-6 md:size-7"
            aria-hidden="true"
          />
        )}
        <span className="font-mono text-base tabular-nums text-fg sm:text-xl md:text-2xl">
          {pad(hours)}:{pad(minutes)}:{pad(seconds)}
        </span>
      </div>
      <span
        className={`mt-1 text-xs text-accent sm:text-sm ${night ? '' : 'invisible'}`}
        aria-hidden={!night}
      >
        {nightLabel}
      </span>
    </div>
  );
}

/**
 * Centered two-column raid clock. The A/B labels stay available to assistive
 * technology, but are visually omitted because the 12-hour-apart readings
 * are self-explanatory in this compact dashboard context. Pure client-side
 * math (see BASE_OFFSET_MS comment) — no API call.
 */
export function InGameClock() {
  const t = useTranslations('home');
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    // Game time runs 7x faster, so a real-time one-second interval would skip
    // roughly seven displayed seconds. Sampling more often keeps every
    // in-game second visible and makes the clock advance naturally.
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="rounded-lg border border-border px-3 py-4 sm:px-6 sm:py-5">
      <h2 className="text-center text-xs font-medium uppercase tracking-wide text-muted">
        {t('raidTimeTitle')}
      </h2>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:divide-x sm:divide-border">
        {now == null ? (
          <>
            <div className="flex min-w-0 flex-col items-center justify-center sm:flex-1 sm:px-3 md:px-4">
              <span className="mb-1 text-[13px] leading-4 text-muted">{t('raidTimeA')}</span>
              <span className="font-mono text-base tabular-nums text-muted sm:text-xl md:text-2xl">
                --:--:--
              </span>
            </div>
            <div className="flex min-w-0 flex-col items-center justify-center sm:flex-1 sm:px-3 md:px-4">
              <span className="mb-1 text-[13px] leading-4 text-muted">{t('raidTimeB')}</span>
              <span className="font-mono text-base tabular-nums text-muted sm:text-xl md:text-2xl">
                --:--:--
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-col items-center justify-center sm:flex-1 sm:px-3 md:px-4">
              <ClockReading
                label={t('raidTimeA')}
                {...gameTimeOfDay(now, true)}
                nightLabel={t('nightHint')}
              />
            </div>
            <div className="flex min-w-0 flex-col items-center justify-center sm:flex-1 sm:px-3 md:px-4">
              <ClockReading
                label={t('raidTimeB')}
                {...gameTimeOfDay(now, false)}
                nightLabel={t('nightHint')}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
