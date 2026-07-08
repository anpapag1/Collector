import { create } from 'zustand';
import {
  loadCurrentUserProfile,
  loadAllProfiles,
  fetchAllForms,
  fetchAllEntries,
  Profile,
  AdminForm,
  AdminEntry,
} from '../services/adminService';

// Web-dashboard-only reactive state: is the signed-in user an admin, and
// which owner is currently selected in the "Filter by user" control shared
// across the Forms/Entries/Map/Export screens. Mirrors Collector-Web's
// `collectorCurrentProfile` / `adminOwnerFilter` globals in admin-auth.js /
// dashboard.js, but as a Zustand store so every screen re-renders together.

// 'mine' = only the signed-in user's own data (screens fall back to the
// existing local-store-based Phase-1 behavior for this case); 'all' = every
// user's data; any other string = a specific profile id.
export type OwnerFilter = 'mine' | 'all' | string;

// Owner-scoped cache keys: `ownerId ?? '__all__'`. Every one of the 4
// dashboard screens (Forms/Entries/Map/Export) otherwise independently
// re-fetches the same forms+entries tables on its own mount — this makes
// navigating between them within one owner-filter selection reuse a single
// fetch instead of one per screen. Kept in module scope (not store state)
// since promises aren't serializable and don't need to be reactive — the
// data they resolve to is what's stored.
let formsPromises = new Map<string, Promise<AdminForm[]>>();
let entriesPromises = new Map<string, Promise<AdminEntry[]>>();

function ownerKey(ownerId?: string): string {
  return ownerId ?? '__all__';
}

type AdminState = {
  initialized: boolean;
  isAdmin: boolean;
  profile: Profile | null;
  profiles: Profile[];
  ownerFilter: OwnerFilter;
  formsByOwner: Record<string, AdminForm[]>;
  entriesByOwner: Record<string, AdminEntry[]>;
  init: () => Promise<void>;
  setOwnerFilter: (value: OwnerFilter) => void;
  loadForms: (ownerId?: string) => Promise<AdminForm[]>;
  loadEntries: (ownerId?: string) => Promise<AdminEntry[]>;
  invalidateAdminData: () => void;
  reset: () => void;
};

let initPromise: Promise<void> | null = null;

export const useAdminStore = create<AdminState>((set, get) => ({
  initialized: false,
  isAdmin: false,
  profile: null,
  profiles: [],
  ownerFilter: 'mine',
  formsByOwner: {},
  entriesByOwner: {},

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

  loadForms: (ownerId) => {
    const key = ownerKey(ownerId);
    const cached = get().formsByOwner[key];
    if (cached) return Promise.resolve(cached);
    const inFlight = formsPromises.get(key);
    if (inFlight) return inFlight;
    const p = fetchAllForms(ownerId)
      .then((forms) => {
        set((s) => ({ formsByOwner: { ...s.formsByOwner, [key]: forms } }));
        formsPromises.delete(key);
        return forms;
      })
      .catch((e) => {
        formsPromises.delete(key);
        throw e;
      });
    formsPromises.set(key, p);
    return p;
  },

  loadEntries: (ownerId) => {
    const key = ownerKey(ownerId);
    const cached = get().entriesByOwner[key];
    if (cached) return Promise.resolve(cached);
    const inFlight = entriesPromises.get(key);
    if (inFlight) return inFlight;
    const p = fetchAllEntries(ownerId)
      .then((entries) => {
        set((s) => ({ entriesByOwner: { ...s.entriesByOwner, [key]: entries } }));
        entriesPromises.delete(key);
        return entries;
      })
      .catch((e) => {
        entriesPromises.delete(key);
        throw e;
      });
    entriesPromises.set(key, p);
    return p;
  },

  // Called after any admin mutation (delete form/entry, switch owner, edit
  // entry JSON) — those all change what the next fetch should return, for
  // potentially more than one owner key (e.g. switching a form's owner
  // affects both the old and new owner's cached data), so this clears
  // everything rather than trying to track which keys are affected.
  invalidateAdminData: () => {
    formsPromises.clear();
    entriesPromises.clear();
    set({ formsByOwner: {}, entriesByOwner: {} });
  },

  reset: () => {
    initPromise = null;
    formsPromises.clear();
    entriesPromises.clear();
    set({
      initialized: false,
      isAdmin: false,
      profile: null,
      profiles: [],
      ownerFilter: 'mine',
      formsByOwner: {},
      entriesByOwner: {},
    });
  },
}));
