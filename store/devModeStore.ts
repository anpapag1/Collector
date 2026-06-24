import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeAsyncStorage } from './entriesStore';

type DevModeState = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

export const useDevModeStore = create<DevModeState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: 'dev-mode-storage',
      storage: createJSONStorage(() => safeAsyncStorage),
    },
  ),
);

// Imperative read for non-component code (e.g. services/syncEngine.ts),
// mirroring how store/dialogStore.ts exposes showDialog().
export function isDevModeEnabled(): boolean {
  return useDevModeStore.getState().enabled;
}
