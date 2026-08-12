'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardData } from '@/types/dashboard';

/**
 * Polling cadence. Deliberately not faster: json.tarkov.dev regenerates its
 * price dumps on its own schedule, and `/api/dashboard` sits behind a 60s CDN
 * window, so a tighter interval would redraw identical numbers while
 * multiplying requests. What actually keeps the board current is the
 * visibility refetch below — a tab that has been in the background for an hour
 * updates the instant it is looked at.
 */
const POLL_INTERVAL_MS = 60_000;

/** How often the "updated N ago" label recomputes. Independent of the fetch:
 * the age must keep advancing even when nothing new has arrived. */
const AGE_TICK_MS = 15_000;

export type LiveStatus = 'idle' | 'refreshing' | 'error';

export interface LiveDashboardState {
  data: DashboardData;
  status: LiveStatus;
  /** Client clock, advanced by the age ticker — the `now` every relative
   * timestamp on the board is measured against. Null until first mount so
   * server and client render identical markup. */
  now: number | null;
  /** Client instant of the last *successful* refresh, distinct from the
   * payload's own `generatedAt`. Null before the first poll lands. */
  lastSyncedAt: number | null;
  refresh: () => void;
}

/**
 * Keeps the dashboard payload current without a page reload.
 *
 * Three things trigger a refetch: the interval, the tab becoming visible
 * again, and the browser coming back online. Polling stops entirely while the
 * tab is hidden — a backgrounded dashboard that keeps requesting is pure cost
 * for a user who is not looking at it.
 *
 * A failed refresh never clears `data`. The board keeps rendering its last
 * good payload and surfaces the failure as a status, because a blank board is
 * strictly worse than a board that says how old it is.
 */
export function useLiveDashboard(
  initialData: DashboardData,
  locale: string,
): LiveDashboardState {
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [now, setNow] = useState<number | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  /** Guards against overlapping fetches: a slow response must not be able to
   * overwrite a newer one that already landed. */
  const inFlight = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setStatus('refreshing');

    fetch(`/api/dashboard?locale=${encodeURIComponent(locale)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`dashboard responded ${res.status}`);
        return (await res.json()) as DashboardData;
      })
      .then((next) => {
        if (controller.signal.aborted) return;
        setData(next);
        setLastSyncedAt(Date.now());
        setNow(Date.now());
        setStatus('idle');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStatus('error');
      });
  }, [locale]);

  useEffect(() => {
    setNow(Date.now());
    const ticker = setInterval(() => setNow(Date.now()), AGE_TICK_MS);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(refresh, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', refresh);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', refresh);
      inFlight.current?.abort();
    };
  }, [refresh]);

  return { data, status, now, lastSyncedAt, refresh };
}
