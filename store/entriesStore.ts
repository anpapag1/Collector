import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Entry, EntryData, FieldDef } from '../types';

type EntriesState = {
  entries: Entry[];
  seqCounter: number;
  addEntry: (data: EntryData, fields: FieldDef[], formTitle: string) => void;
  deleteEntry: (id: string) => void;
  clearEntries: () => void;
};

export const useEntriesStore = create<EntriesState>()(
  persist(
    (set, get) => ({
      entries: [],
      seqCounter: 0,
      addEntry: (data, fields, formTitle) => {
        const seq = get().seqCounter + 1;
        const entry: Entry = {
          id: `entry-${seq}-${Date.now()}`,
          seq,
          createdAt: Date.now(),
          formTitle,
          fields,
          data,
        };
        set((s) => ({ entries: [...s.entries, entry], seqCounter: seq }));
      },
      deleteEntry: (id) => {
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
      },
      clearEntries: () => set({ entries: [], seqCounter: 0 }),
    }),
    {
      name: 'entries-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
