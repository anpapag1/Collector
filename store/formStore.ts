import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FormConfig, EntryData } from '../types';

export type GpsStatus = 'idle' | 'capturing' | 'done';

type FormState = {
  schema: FormConfig | null;
  draft: EntryData;
  gpsStatus: GpsStatus;
  showErrors: boolean;
  loadSchema: (config: FormConfig) => void;
  setField: (id: string, value: any) => void;
  resetDraft: () => void;
  setGpsStatus: (status: GpsStatus) => void;
  setShowErrors: (val: boolean) => void;
};

export const useFormStore = create<FormState>()(
  persist(
    (set) => ({
      schema: null,
      draft: {},
      gpsStatus: 'idle',
      showErrors: false,
      loadSchema: (config) => set({ schema: config }),
      setField: (id, value) =>
        set((s) => ({ draft: { ...s.draft, [id]: value } })),
      resetDraft: () => set({ draft: {}, gpsStatus: 'idle', showErrors: false }),
      setShowErrors: (val) => set({ showErrors: val }),
      setGpsStatus: (status) => set({ gpsStatus: status }),
    }),
    {
      name: 'form-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ schema: s.schema }),
    }
  )
);
