'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { isPwaEnabled, SW_MESSAGE } from '@/lib/pwa/sw-policy';
import { useConnectivityOptional } from '@/contexts/ConnectivityContext';
import { formatKst } from '@/lib/format';
import type { Locale } from '@/i18n/routing';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function pwaEnvEnabled(): boolean {
  return isPwaEnabled({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_PWA_ENABLED: process.env.NEXT_PUBLIC_PWA_ENABLED,
  });
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    ('standalone' in navigator && Boolean((navigator as { standalone?: boolean }).standalone))
  );
}

/**
 * Registers the production service worker, surfaces update/install actions,
 * and shows a compact connectivity banner. Never force-reloads on update.
 */
export function ServiceWorkerManager({ locale }: { locale: Locale }) {
  const tPwa = useTranslations('pwa');
  const tOffline = useTranslations('offline');
  const connectivity = useConnectivityOptional();

  const [updateReady, setUpdateReady] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const reloadOnceRef = useRef(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!pwaEnvEnabled()) {
      // Kill switch / non-production: unregister leftover workers so `next
      // dev` never serves stale hashed assets from a previous SW.
      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistrations().then((regs) => {
          for (const reg of regs) void reg.unregister();
        });
        if ('caches' in window) {
          void caches.keys().then((names) => {
            for (const name of names) {
              if (name.startsWith('tarkovdex-')) void caches.delete(name);
            }
          });
        }
      }
      return;
    }

    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;

    const register = () => {
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          if (cancelled) return;
          registrationRef.current = reg;

          const trackWaiting = () => {
            if (reg.waiting) {
              waitingWorkerRef.current = reg.waiting;
              setUpdateReady(true);
            }
          };
          trackWaiting();

          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                waitingWorkerRef.current = reg.waiting;
                setUpdateReady(true);
              }
            });
          });

          // Periodic update check — soft, no reload.
          const interval = window.setInterval(() => {
            void reg.update().catch(() => {});
          }, 60 * 60 * 1000);
          return () => window.clearInterval(interval);
        })
        .catch(() => {
          // Registration failure must not break the site.
        });
    };

    // Defer until the page is interactive.
    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }

    const onControllerChange = () => {
      if (reloadOnceRef.current) return;
      reloadOnceRef.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  useEffect(() => {
    setInstalled(isStandaloneDisplay());
    const onBip = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    const worker = waitingWorkerRef.current;
    if (!worker) return;
    worker.postMessage({ type: SW_MESSAGE.SKIP_WAITING });
    setUpdateReady(false);
  }, []);

  const dismissUpdate = useCallback(() => {
    setUpdateReady(false);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }, [installEvent]);

  const showOfflineBanner =
    connectivity &&
    !connectivity.bannerDismissed &&
    (connectivity.state === 'offline' || connectivity.state === 'degraded');

  const cachedAt = connectivity?.lastOfflineInfo?.cachedAt;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[55] flex flex-col gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:items-end sm:p-3">
      {updateReady ? (
        <div
          role="status"
          className="pointer-events-auto flex w-full max-w-md flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-surface px-3 py-2 text-[14px] leading-5 text-fg shadow-sm sm:ml-auto"
        >
          <RefreshCw className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0 flex-1 break-words">{tPwa('updateAvailable')}</span>
          <button
            type="button"
            onClick={applyUpdate}
            className="inline-flex min-h-touch items-center rounded-md bg-accent px-3 py-1.5 text-[14px] font-medium text-accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {tPwa('applyUpdate')}
          </button>
          <button
            type="button"
            onClick={dismissUpdate}
            className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-md border border-border px-2 text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-label={tPwa('later')}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {showOfflineBanner ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto flex w-full max-w-md flex-wrap items-start gap-2 rounded-lg border border-accent/40 bg-surface px-3 py-2 text-[14px] leading-5 text-fg sm:ml-auto"
        >
          <WifiOff className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="break-words font-medium">
              {connectivity.state === 'offline'
                ? tOffline('offline')
                : tOffline('connectionUnstable')}
            </p>
            <p className="mt-1 break-words text-muted">
              {connectivity.lastOfflineInfo?.servedFromOfflineCache
                ? tOffline('showingCached')
                : tOffline('someRequestsFailed')}
            </p>
            {cachedAt ? (
              <p className="mt-1 break-words text-muted">
                {tOffline('lastOfflineSave')}:{' '}
                <time dateTime={cachedAt}>{formatKst(cachedAt, locale) ?? cachedAt}</time>
              </p>
            ) : null}
            <p className="mt-1 break-words text-muted">{tOffline('mayBeOutdated')}</p>
          </div>
          <button
            type="button"
            onClick={() => connectivity.dismissBanner()}
            className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-md border border-border px-2 text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-label={tPwa('later')}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {installEvent && !installed ? (
        <div className="pointer-events-auto flex w-full max-w-md flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[14px] leading-5 text-fg sm:ml-auto">
          <Download className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0 flex-1 break-words">{tPwa('installAvailable')}</span>
          <button
            type="button"
            onClick={() => void promptInstall()}
            className="inline-flex min-h-touch items-center rounded-md border border-accent/50 px-3 py-1.5 text-[14px] text-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {tPwa('installApp')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function InstallAppAction() {
  const tPwa = useTranslations('pwa');
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    const onBip = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  if (!pwaEnvEnabled() || standalone || !promptEvent) return null;

  return (
    <button
      type="button"
      onClick={() => {
        void promptEvent.prompt().then(() => setPromptEvent(null));
      }}
      className="inline-flex min-h-touch items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[14px] leading-5 text-fg hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <Download className="size-[14px]" aria-hidden="true" />
      {tPwa('installTarkovDex')}
    </button>
  );
}
