import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { requestSync } from '../services/syncEngine';
import { useAuthStore } from './authStore';
import { safeAsyncStorage } from './entriesStore';

// Every real mutation (add/edit/delete, sign-in, connectivity restore,
// app-foreground) already calls requestSync() explicitly — this interval is
// just a safety-net poll to pick up changes made on another device while this
// one sits idle, so it doesn't need to be aggressive.
const SYNC_INTERVAL_MS = 5 * 60_000;

type SyncRuntimeState = {
  isOnline: boolean;
  init: () => void;
  // Per-user cursors syncEngine.ts's pullRemoteEntries uses to fetch only
  // rows changed since the last successful pull instead of the whole table
  // every pass. Persisted so a cold app start doesn't lose the benefit.
  // Keyed by userId (not global) so switching accounts on one device can't
  // use one user's cursor against another's data.
  lastSyncedAt: Record<string, number>;
  lastReconciledAt: Record<string, number>;
  setLastSyncedAt: (userId: string, ts: number) => void;
  setLastReconciledAt: (userId: string, ts: number) => void;
};

let initStarted = false;

export const useSyncStore = create<SyncRuntimeState>()(
  persist(
    (set) => ({
      isOnline: true,
      lastSyncedAt: {},
      lastReconciledAt: {},
      setLastSyncedAt: (userId, ts) =>
        set((s) => ({ lastSyncedAt: { ...s.lastSyncedAt, [userId]: ts } })),
      setLastReconciledAt: (userId, ts) =>
        set((s) => ({ lastReconciledAt: { ...s.lastReconciledAt, [userId]: ts } })),

      init: () => {
        if (initStarted) return;
        initStarted = true;

        NetInfo.addEventListener((state) => {
          const wasOffline = !useSyncStore.getState().isOnline;
          const isOnline = !!state.isConnected;
          set({ isOnline });
          if (wasOffline && isOnline) requestSync();
        });

        let backgroundedAt = 0;
        const MIN_BACKGROUND_SYNC_MS = 45_000;
        AppState.addEventListener('change', (appState) => {
          if (appState === 'background') {
            backgroundedAt = Date.now();
          } else if (appState === 'active') {
            if (Date.now() - backgroundedAt >= MIN_BACKGROUND_SYNC_MS) {
              requestSync();
            }
          }
        });

        useAuthStore.subscribe((s, prev) => {
          if (!prev.session && s.session) requestSync();
        });

        setInterval(requestSync, SYNC_INTERVAL_MS);

        requestSync();
      },
    }),
    {
      name: 'sync-storage',
      storage: createJSONStorage(() => safeAsyncStorage),
      partialize: (s) => ({ lastSyncedAt: s.lastSyncedAt, lastReconciledAt: s.lastReconciledAt }),
    }
  )
);
