'use client';

import { useEffect, useRef } from 'react';
import { ADSENSE_CLIENT } from '@/lib/ads';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * One in-content ad unit.
 *
 * Two deliberate properties:
 *
 * - **Renders nothing when unconfigured.** Before AdSense approval — and in
 *   every local/preview build — `ADSENSE_CLIENT` is unset and this is a no-op,
 *   so there is no empty grey box and no broken script tag on the page.
 * - **Initializes exactly once.** The dashboard re-renders on every poll and
 *   on every PvP/PvE switch; pushing to `adsbygoogle` again on a slot that is
 *   already filled is a policy-relevant error, so a ref guards it. The
 *   component sits between two boards rather than inside either, so React
 *   keeps this instance mounted across those re-renders.
 *
 * The reserved `min-height` is what keeps the unit from shoving the boss board
 * down when the iframe finally paints — layout shift is the single most
 * annoying thing an ad does on a dashboard people leave open.
 */
export function AdSlot({ slot, label }: { slot: string; label: string }) {
  const initialized = useRef(false);

  useEffect(() => {
    if (!ADSENSE_CLIENT || !slot || initialized.current) return;
    initialized.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // A blocked or failed ad must never surface to the user or break the
      // dashboard around it.
    }
  }, [slot]);

  if (!ADSENSE_CLIENT || !slot) return null;

  return (
    <aside
      aria-label={label}
      className="min-h-[100px] overflow-hidden rounded-lg border border-border/60"
    >
      <ins
        className="adsbygoogle block"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
