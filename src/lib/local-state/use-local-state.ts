import { useSyncExternalStore } from 'react';
import {
  getLocalStateServerSnapshot,
  getLocalStateSnapshot,
  subscribeLocalState,
} from './store';
import type { LocalState } from './schema';

/**
 * Split out of `store.ts` on purpose: this is the only file in the local-state
 * layer that imports from `react`, which keeps `store.ts` (and everything it
 * depends on) importable under the `react-server` module condition the test
 * suite runs with (`npm test` = `tsx --conditions react-server --test ...`).
 * A React Server build resolves `react`'s export map without client-only
 * hooks like `useSyncExternalStore`, so pulling this import into `store.ts`
 * itself would make every pure-logic test that imports it fail to even load.
 */
export function useLocalState(): LocalState {
  return useSyncExternalStore(
    subscribeLocalState,
    getLocalStateSnapshot,
    getLocalStateServerSnapshot,
  );
}
