import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Entry, EntryData, FieldDef } from '../types';

// Wraps AsyncStorage so persist read/write/remove failures are logged instead
// of silently swallowed or thrown deep inside zustand's persist middleware.
export const safeAsyncStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return await AsyncStorage.getItem(name);
    } catch (err) {
      console.warn(`[storage] getItem failed for "${name}"`, err);
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (err) {
      console.warn(`[storage] setItem failed for "${name}"`, err);
    }
  },
  removeItem: async (name) => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (err) {
      console.warn(`[storage] removeItem failed for "${name}"`, err);
    }
  },
};

type EntriesState = {
  entries: Entry[];
  seqCounter: number;
  addEntry: (data: EntryData, fields: FieldDef[], formTitle: string) => void;
  deleteEntry: (id: string) => void;
  clearEntries: () => void;
};

export const useEntriesStore = create<EntriesState>()(
  persist(
    (set) => ({
      entries: [],
      seqCounter: 0,
      addEntry: (data, fields, formTitle) => {
        set((s) => {
          const seq = s.seqCounter + 1;
          const entry: Entry = {
            id: `entry-${seq}-${Date.now()}`,
            seq,
            createdAt: Date.now(),
            formTitle,
            fields,
            data,
          };
          return { entries: [...s.entries, entry], seqCounter: seq };
        });
      },
      deleteEntry: (id) => {
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
      },
      clearEntries: () => set({ entries: [], seqCounter: 0 }),
    }),
    {
      name: 'entries-storage',
      storage: createJSONStorage(() => safeAsyncStorage),
    }
  )
);
