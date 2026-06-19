import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Entry, EntryData } from '../types';

type EntriesState = {
  entries: Entry[];
  seqCounter: number;
  addEntry: (data: EntryData) => void;
  deleteEntry: (id: string) => void;
};

export const useEntriesStore = create<EntriesState>()(
  persist(
    (set, get) => ({
      entries: [],
      seqCounter: 0,
      addEntry: (data) => {
        const seq = get().seqCounter + 1;
        const entry: Entry = {
          id: `entry-${seq}-${Date.now()}`,
          seq,
          createdAt: Date.now(),
          data,
        };
        set((s) => ({ entries: [...s.entries, entry], seqCounter: seq }));
      },
      deleteEntry: (id) => {
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
      },
    }),
    {
      name: 'entries-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
