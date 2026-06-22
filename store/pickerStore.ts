import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, persist } from 'zustand/middleware';
import { create } from 'zustand';
import { FormConfig } from '../types';

export type CustomForm = {
  importId: string;
  config: FormConfig;
};

type PickerState = {
  hiddenPresetIds: string[];
  customForms: CustomForm[];
  hidePreset: (id: string) => void;
  showPreset: (id: string) => void;
  resetHiddenPresets: () => void;
  addCustomForm: (config: FormConfig) => void;
  removeCustomForm: (importId: string) => void;
};

export const usePickerStore = create<PickerState>()(
  persist(
    (set) => ({
      hiddenPresetIds: [],
      customForms: [],
      hidePreset: (id) =>
        set((state) => ({
          hiddenPresetIds: state.hiddenPresetIds.includes(id)
            ? state.hiddenPresetIds
            : [...state.hiddenPresetIds, id],
        })),
      showPreset: (id) =>
        set((state) => ({
          hiddenPresetIds: state.hiddenPresetIds.filter((presetId) => presetId !== id),
        })),
      resetHiddenPresets: () => set({ hiddenPresetIds: [] }),
      addCustomForm: (config) =>
        set((state) => ({
          customForms: [
            ...state.customForms,
            { importId: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`, config },
          ],
        })),
      removeCustomForm: (importId) =>
        set((state) => ({
          customForms: state.customForms.filter((c) => c.importId !== importId),
        })),
    }),
    {
      name: 'picker-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        hiddenPresetIds: state.hiddenPresetIds,
        customForms: state.customForms,
      }),
    },
  ),
);