import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Entry, EntryData, FieldDef, PhotoItem } from '../types';
import { supabase } from '../lib/supabase';
import { requestSync } from '../services/syncEngine';

// Mirrors the upload path's path convention (services/syncEngine.ts) so a
// deleted entry's photos can be found and removed from Storage too. Only
// meaningful once an entry has a userId (i.e. has actually been synced).
function photoStoragePaths(entry: Entry): string[] {
  if (!entry.userId) return [];
  const imageFields = (entry.fields ?? []).filter((f) => f.type === 'image');
  const paths: string[] = [];
  for (const field of imageFields) {
    const photos: PhotoItem[] = entry.data[field.id] ?? [];
    for (const photo of photos) {
      paths.push(`${entry.userId}/${entry.id}/${photo.id}.jpg`);
    }
  }
  return paths;
}

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
  addEntry: (data: EntryData, fields: FieldDef[], formTitle: string) => void;
  deleteEntry: (id: string) => void;
  clearEntries: () => void;
  markSyncing: (id: string) => void;
  markSynced: (id: string, remoteId: string) => void;
  markSyncError: (id: string, message: string) => void;
  mergeRemoteEntries: (remoteEntries: Entry[]) => void;
};

export const useEntriesStore = create<EntriesState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (data, fields, formTitle) => {
        set((s) => {
          const now = Date.now();
          const entry: Entry = {
            id: `entry-${s.entries.length + 1}-${now}`,
            createdAt: now,
            formTitle,
            fields,
            data,
            userId: null,
            syncStatus: 'pending',
            updatedAt: now,
          };
          return { entries: [...s.entries, entry] };
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
          const paths = photoStoragePaths(removed);
          if (paths.length > 0) {
            supabase.storage.from('entry-photos').remove(paths).then(({ error }) => {
              if (error) console.warn('[sync] best-effort photo cleanup failed', error);
            });
          }
        }
      },
      clearEntries: () => {
        const entries = useEntriesStore.getState().entries;
        const remoteIds = entries.map((e) => e.remoteId).filter((id): id is string => !!id);
        const photoPaths = entries.flatMap((e) => (e.remoteId ? photoStoragePaths(e) : []));
        set({ entries: [] });
        if (remoteIds.length > 0) {
          supabase.from('entries').delete().in('id', remoteIds).then(({ error }) => {
            if (error) console.warn('[sync] best-effort bulk remote delete failed', error);
          });
        }
        if (photoPaths.length > 0) {
          supabase.storage.from('entry-photos').remove(photoPaths).then(({ error }) => {
            if (error) console.warn('[sync] best-effort bulk photo cleanup failed', error);
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
      mergeRemoteEntries: (remoteEntries) => {
        set((s) => {
          const localIds = new Set(s.entries.map((e) => e.id));
          const toAdd = remoteEntries.filter((e) => !localIds.has(e.id));
          if (toAdd.length === 0) return s;
          return { entries: [...s.entries, ...toAdd] };
        });
      },
    }),
    {
      name: 'entries-storage',
      version: 2,
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
        if (version < 2) {
          // `seq`/`seqCounter` are no longer stored — display numbers are
          // now derived on the fly from chronological order instead, so
          // multi-device sync can never produce colliding "Entry #01"s.
          delete persisted?.seqCounter;
          if (persisted?.entries) {
            persisted.entries = persisted.entries.map((e: any) => {
              const { seq, ...rest } = e;
              return rest;
            });
          }
        }
        return persisted;
      },
    }
  )
);
