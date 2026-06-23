import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { requestSync } from '../services/syncEngine';
import { useAuthStore } from './authStore';

const SYNC_INTERVAL_MS = 30_000;

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

    AppState.addEventListener('change', (state) => {
      if (state === 'active') requestSync();
    });

    useAuthStore.subscribe((s, prev) => {
      if (!prev.session && s.session) requestSync();
    });

    setInterval(requestSync, SYNC_INTERVAL_MS);

    requestSync();
  },
}));
