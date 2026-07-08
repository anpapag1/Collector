import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { requestSync } from '../services/syncEngine';
import { useAuthStore } from './authStore';

// Every real mutation (add/edit/delete, sign-in, connectivity restore,
// app-foreground) already calls requestSync() explicitly — this interval is
// just a safety-net poll to pick up changes made on another device while this
// one sits idle, so it doesn't need to be aggressive.
const SYNC_INTERVAL_MS = 5 * 60_000;

// Sync cursors (lastSyncedAt/lastReconciledAt) used to live here too, but
// that made this store depend on syncEngine.ts (for requestSync) while
// syncEngine.ts depended back on this store (for the cursors) — a require
// cycle. They now live in store/syncCursorStore.ts, which has no dependency
// on syncEngine.ts, so only this file depends on syncEngine.ts and the cycle
// is gone.
type SyncRuntimeState = {
  isOnline: boolean;
  init: () => void;
};

let initStarted = false;

export const useSyncStore = create<SyncRuntimeState>()((set) => ({
  isOnline: true,

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
}));
