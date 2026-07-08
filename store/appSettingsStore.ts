import { create } from 'zustand';
import { fetchAppSettings } from '../services/appSettingsService';
import { useAuthStore } from './authStore';

// Network-wide settings — one value shared by every user/device, not a
// per-user preference (contrast with store/adminStore.ts's ownerFilter, or
// any zustand-persist store keyed to this device). Loaded on both native and
// web from app/_layout.tsx; only writable by admins, from app/settings.web.tsx.

type AppSettingsState = {
  showEntryPreviews: boolean;
  initialized: boolean;
  init: () => Promise<void>;
  setShowEntryPreviews: (value: boolean) => void;
};

let initPromise: Promise<void> | null = null;
let subscribed = false;

export const useAppSettingsStore = create<AppSettingsState>((set, get) => ({
  // Matches the DB default, so nothing changes for anyone until a fetch
  // actually completes — and if a fetch never completes (offline, transient
  // error), previews stay on rather than silently disappearing app-wide.
  showEntryPreviews: true,
  initialized: false,

  init: () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        const { showEntryPreviews } = await fetchAppSettings();
        set({ showEntryPreviews, initialized: true });
      } catch (e) {
        // Fails open (previews stay on) rather than closed — a transient
        // fetch error (offline, not yet signed in — the SELECT policy
        // requires auth.uid() is not null) shouldn't blank out every
        // thumbnail for every user.
        console.warn('[appSettings] failed to load, leaving previews on', e);
        set({ initialized: true });
      }
    })();

    // A device sitting at the login screen when the setting changes should
    // pick up the real value once signed in, instead of keeping whatever
    // (possibly failed/pre-auth) result the first attempt produced.
    if (!subscribed) {
      subscribed = true;
      useAuthStore.subscribe((s, prev) => {
        if (!prev.session && s.session) {
          initPromise = null;
          get().init();
        }
      });
    }

    return initPromise;
  },

  setShowEntryPreviews: (value) => set({ showEntryPreviews: value }),
}));
