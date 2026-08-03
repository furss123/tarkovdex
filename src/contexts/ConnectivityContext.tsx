'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  deriveConnectivityState,
  offlineResponseInfoFromHeaders,
  type ConnectivityState,
  type OfflineResponseInfo,
} from '@/lib/offline-status';
import { SW_MESSAGE } from '@/lib/pwa/sw-policy';

type ConnectivityContextValue = {
  state: ConnectivityState;
  lastOfflineInfo: OfflineResponseInfo | null;
  lastNetworkSuccessAt: number | null;
  noteFetchOutcome: (ok: boolean, headers?: Headers | null, requestUrl?: string) => void;
  dismissBanner: () => void;
  bannerDismissed: boolean;
};

const ConnectivityContext = createContext<ConnectivityContextValue | null>(null);

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [browserOnline, setBrowserOnline] = useState<boolean | null>(null);
  const [lastNetworkSuccessAt, setLastNetworkSuccessAt] = useState<number | null>(null);
  const [lastNetworkFailureAt, setLastNetworkFailureAt] = useState<number | null>(null);
  const [servingFromOfflineCache, setServingFromOfflineCache] = useState(false);
  const [lastOfflineInfo, setLastOfflineInfo] = useState<OfflineResponseInfo | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const lastAnnounceRef = useRef<ConnectivityState | null>(null);

  useEffect(() => {
    setBrowserOnline(navigator.onLine);
    const onOnline = () => {
      setBrowserOnline(true);
      setBannerDismissed(false);
    };
    const onOffline = () => {
      setBrowserOnline(false);
      setBannerDismissed(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(tick);
    };
  }, []);

  const noteFetchOutcome = useCallback(
    (ok: boolean, headers?: Headers | null, requestUrl?: string) => {
      const info = offlineResponseInfoFromHeaders(headers, requestUrl);
      const at = Date.now();
      if (ok && !info.servedFromOfflineCache) {
        setLastNetworkSuccessAt(at);
        setServingFromOfflineCache(false);
        setLastOfflineInfo(null);
        return;
      }
      if (ok && info.servedFromOfflineCache) {
        setServingFromOfflineCache(true);
        setLastOfflineInfo(info);
        setBannerDismissed(false);
        return;
      }
      setLastNetworkFailureAt(at);
      setBannerDismissed(false);
    },
    [],
  );

  const state = useMemo(
    () =>
      deriveConnectivityState({
        browserOnline,
        lastNetworkSuccessAt,
        lastNetworkFailureAt,
        servingFromOfflineCache,
        now,
      }),
    [
      browserOnline,
      lastNetworkSuccessAt,
      lastNetworkFailureAt,
      servingFromOfflineCache,
      now,
    ],
  );

  useEffect(() => {
    if (lastAnnounceRef.current !== state) {
      lastAnnounceRef.current = state;
      if (state === 'online') setServingFromOfflineCache(false);
    }
  }, [state]);

  const value = useMemo(
    () => ({
      state,
      lastOfflineInfo,
      lastNetworkSuccessAt,
      noteFetchOutcome,
      dismissBanner: () => setBannerDismissed(true),
      bannerDismissed,
    }),
    [state, lastOfflineInfo, lastNetworkSuccessAt, noteFetchOutcome, bannerDismissed],
  );

  return (
    <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>
  );
}

export function useConnectivity(): ConnectivityContextValue {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) {
    throw new Error('useConnectivity must be used within ConnectivityProvider');
  }
  return ctx;
}

/** Safe optional hook for components that may render outside the provider in tests. */
export function useConnectivityOptional(): ConnectivityContextValue | null {
  return useContext(ConnectivityContext);
}

export async function pwaFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  note?: ConnectivityContextValue['noteFetchOutcome'],
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  try {
    const response = await fetch(input, init);
    note?.(response.ok, response.headers, url);
    return response;
  } catch (error) {
    note?.(false, null, url);
    throw error;
  }
}

/** Tell the active service worker to clear TarkovDex caches only. */
export function clearTarkovDexCaches(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!('serviceWorker' in navigator)) {
      resolve(false);
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => {
        const worker = reg.active;
        if (!worker) {
          resolve(false);
          return;
        }
        const onMessage = (event: MessageEvent) => {
          if (event.data?.type === SW_MESSAGE.CACHE_CLEARED) {
            navigator.serviceWorker.removeEventListener('message', onMessage);
            resolve(true);
          }
        };
        navigator.serviceWorker.addEventListener('message', onMessage);
        worker.postMessage({ type: SW_MESSAGE.CLEAR_CACHES });
        window.setTimeout(() => {
          navigator.serviceWorker.removeEventListener('message', onMessage);
          resolve(true);
        }, 3000);
      })
      .catch(() => resolve(false));
  });
}
