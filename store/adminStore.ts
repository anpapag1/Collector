import { create } from 'zustand';
import { loadCurrentUserProfile, loadAllProfiles, Profile } from '../services/adminService';

// Web-dashboard-only reactive state: is the signed-in user an admin, and
// which owner is currently selected in the "Filter by user" control shared
// across the Forms/Entries/Map/Export screens. Mirrors Collector-Web's
// `collectorCurrentProfile` / `adminOwnerFilter` globals in admin-auth.js /
// dashboard.js, but as a Zustand store so every screen re-renders together.

// 'mine' = only the signed-in user's own data (screens fall back to the
// existing local-store-based Phase-1 behavior for this case); 'all' = every
// user's data; any other string = a specific profile id.
export type OwnerFilter = 'mine' | 'all' | string;

type AdminState = {
  initialized: boolean;
  isAdmin: boolean;
  profile: Profile | null;
  profiles: Profile[];
  ownerFilter: OwnerFilter;
  init: () => Promise<void>;
  setOwnerFilter: (value: OwnerFilter) => void;
  reset: () => void;
};

let initPromise: Promise<void> | null = null;

export const useAdminStore = create<AdminState>((set, get) => ({
  initialized: false,
  isAdmin: false,
  profile: null,
  profiles: [],
  ownerFilter: 'mine',

  init: () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        const { profile, isAdmin } = await loadCurrentUserProfile();
        const profiles = isAdmin ? await loadAllProfiles() : [];
        set({ profile, isAdmin, profiles, initialized: true });
      } catch (e) {
        console.warn('[admin] failed to load profile/role', e);
        set({ initialized: true });
      }
    })();
    return initPromise;
  },

  setOwnerFilter: (value) => set({ ownerFilter: value }),

  reset: () => {
    initPromise = null;
    set({ initialized: false, isAdmin: false, profile: null, profiles: [], ownerFilter: 'mine' });
  },
}));
