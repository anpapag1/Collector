import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { FormConfig, EntryData } from '../types';
import { safeAsyncStorage } from './entriesStore';

export type GpsStatus = 'idle' | 'capturing' | 'done';

type FormState = {
  schema: FormConfig | null;
  hasInitialized: boolean;
  draft: EntryData;
  gpsStatus: GpsStatus;
  showErrors: boolean;
  loadSchema: (config: FormConfig) => void;
  clearSchema: () => void;
  setField: (id: string, value: any) => void;
  resetDraft: () => void;
  setGpsStatus: (status: GpsStatus) => void;
  setShowErrors: (val: boolean) => void;
};

export const useFormStore = create<FormState>()(
  persist(
    (set) => ({
      schema: null,
      hasInitialized: false,
      draft: {},
      gpsStatus: 'idle',
      showErrors: false,
      loadSchema: (config) => set({ schema: config, hasInitialized: true }),
      clearSchema: () => set({ schema: null, draft: {}, gpsStatus: 'idle', showErrors: false }),
      setField: (id, value) =>
        set((s) => ({ draft: { ...s.draft, [id]: value } })),
      resetDraft: () => set({ draft: {}, gpsStatus: 'idle', showErrors: false }),
      setShowErrors: (val) => set({ showErrors: val }),
      setGpsStatus: (status) => set({ gpsStatus: status }),
    }),
    {
      name: 'form-storage',
      storage: createJSONStorage(() => safeAsyncStorage),
      partialize: (s) => ({ schema: s.schema, hasInitialized: s.hasInitialized }),
    }
  )
);
