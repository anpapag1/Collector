import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Entry, EntryData, FieldDef } from '../types';
import { supabase } from '../lib/supabase';
import { requestSync } from '../services/syncEngine';

// Allows a UI layer (e.g. app/_layout.tsx) to register a callback that gets
// notified when a persistence write/read/remove fails, so failures can be
// surfaced to the user (e.g. via a toast) instead of only logged.
let onPersistError: ((msg: string) => void) | null = null;

export function setPersistErrorHandler(fn: typeof onPersistError) {
  onPersistError = fn;
}

// Wraps AsyncStorage so persist read/write/remove failures are logged instead
// of silently swallowed or thrown deep inside zustand's persist middleware.
export const safeAsyncStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return await AsyncStorage.getItem(name);
    } catch (err) {
      console.warn(`[storage] getItem failed for "${name}"`, err);
      onPersistError?.('Failed to load entries from device storage');
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (err) {
      console.warn(`[storage] setItem failed for "${name}"`, err);
      onPersistError?.('Failed to save entries to device storage');
    }
  },
  removeItem: async (name) => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (err) {
      console.warn(`[storage] removeItem failed for "${name}"`, err);
      onPersistError?.('Failed to remove entries from device storage');
    }
  },
};

type EntriesState = {
  entries: Entry[];
  seqCounter: number;
  addEntry: (data: EntryData, fields: FieldDef[], formTitle: string) => void;
  deleteEntry: (id: string) => void;
  clearEntries: () => void;
  markSyncing: (id: string) => void;
  markSynced: (id: string, remoteId: string) => void;
  markSyncError: (id: string, message: string) => void;
};

export const useEntriesStore = create<EntriesState>()(
  persist(
    (set) => ({
      entries: [],
      seqCounter: 0,
      addEntry: (data, fields, formTitle) => {
        set((s) => {
          const seq = s.seqCounter + 1;
          const now = Date.now();
          const entry: Entry = {
            id: `entry-${seq}-${now}`,
            seq,
            createdAt: now,
            formTitle,
            fields,
            data,
            userId: null,
            syncStatus: 'pending',
            updatedAt: now,
          };
          return { entries: [...s.entries, entry], seqCounter: seq };
        });
        // Fire-and-forget: never block the save-and-navigate flow on network activity.
        requestSync();
      },
      deleteEntry: (id) => {
        let removed: Entry | undefined;
        set((s) => {
          removed = s.entries.find((e) => e.id === id);
          return { entries: s.entries.filter((e) => e.id !== id) };
        });
        if (removed?.remoteId) {
          supabase.from('entries').delete().eq('id', removed.remoteId).then(({ error }) => {
            if (error) console.warn('[sync] best-effort remote delete failed', error);
          });
        }
      },
      clearEntries: () => {
        const remoteIds = useEntriesStore
          .getState()
          .entries.map((e) => e.remoteId)
          .filter((id): id is string => !!id);
        set({ entries: [], seqCounter: 0 });
        if (remoteIds.length > 0) {
          supabase.from('entries').delete().in('id', remoteIds).then(({ error }) => {
            if (error) console.warn('[sync] best-effort bulk remote delete failed', error);
          });
        }
      },
      markSyncing: (id) => {
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id ? { ...e, syncStatus: 'syncing', syncingSince: Date.now() } : e
          ),
        }));
      },
      markSynced: (id, remoteId) => {
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id
              ? {
                  ...e,
                  syncStatus: 'synced',
                  syncingSince: null,
                  remoteId,
                  syncError: null,
                  updatedAt: Date.now(),
                }
              : e
          ),
        }));
      },
      markSyncError: (id, message) => {
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id
              ? {
                  ...e,
                  syncStatus: 'error',
                  syncingSince: null,
                  syncError: message,
                  syncAttempts: (e.syncAttempts ?? 0) + 1,
                }
              : e
          ),
        }));
      },
    }),
    {
      name: 'entries-storage',
      version: 1,
      storage: createJSONStorage(() => safeAsyncStorage),
      migrate: (persisted: any, version) => {
        if (version === 0 && persisted?.entries) {
          persisted.entries = persisted.entries.map((e: any) => ({
            ...e,
            userId: e.userId ?? null,
            syncStatus: e.syncStatus ?? 'pending',
            syncingSince: e.syncingSince ?? null,
            updatedAt: e.updatedAt ?? e.createdAt,
          }));
        }
        return persisted;
      },
    }
  )
);
