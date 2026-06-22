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
  activePresetId: string | null;
  hidePreset: (id: string) => void;
  showPreset: (id: string) => void;
  resetHiddenPresets: () => void;
  addCustomForm: (config: FormConfig, importId: string) => void;
  removeCustomForm: (importId: string) => void;
  setActivePresetId: (id: string | null) => void;
};

export const usePickerStore = create<PickerState>()(
  persist(
    (set) => ({
      hiddenPresetIds: [],
      customForms: [],
      activePresetId: null,
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
      addCustomForm: (config, importId) =>
        set((state) => ({
          customForms: [...state.customForms, { importId, config }],
        })),
      removeCustomForm: (importId) =>
        set((state) => ({
          customForms: state.customForms.filter((c) => c.importId !== importId),
          activePresetId:
            state.activePresetId === importId ? null : state.activePresetId,
        })),
      setActivePresetId: (id) => set({ activePresetId: id }),
    }),
    {
      name: 'picker-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        hiddenPresetIds: state.hiddenPresetIds,
        customForms: state.customForms,
        activePresetId: state.activePresetId,
      }),
    },
  ),
);
