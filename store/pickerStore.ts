import { createJSONStorage, persist } from 'zustand/middleware';
import { create } from 'zustand';
import { FormConfig } from '../types';
import { safeAsyncStorage } from './entriesStore';
import { supabase } from '../lib/supabase';

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
  addCustomForm: (config: FormConfig, importId: string, userId?: string | null) => void;
  removeCustomForm: (importId: string) => void;
  setActivePresetId: (id: string | null) => void;
  mergeRemoteForms: (forms: CustomForm[]) => void;
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
      addCustomForm: (config, importId, userId) => {
        set((state) => ({
          customForms: [...state.customForms, { importId, config }],
        }));
        // Forms sync is push-on-import / pull-on-sync only — no offline
        // queue, since forms change far less often than entries. Imported
        // while signed out, it just stays local until the next import.
        // userId is passed in by the caller (rather than read from
        // authStore here) so this store doesn't import authStore — avoids
        // a pickerStore <-> authStore <-> syncEngine require cycle.
        if (!userId) return;
        supabase
          .from('forms')
          .upsert(
            {
              user_id: userId,
              form_id: config.formId,
              form_title: config.formTitle,
              version: config.version,
              schema: config,
            },
            { onConflict: 'user_id,form_id,version' }
          )
          .then(({ error }) => {
            if (error) console.warn('[sync] form upload failed', error);
          });
      },
      removeCustomForm: (importId) =>
        set((state) => ({
          customForms: state.customForms.filter((c) => c.importId !== importId),
          activePresetId:
            state.activePresetId === importId ? null : state.activePresetId,
        })),
      setActivePresetId: (id) => set({ activePresetId: id }),
      mergeRemoteForms: (forms) => {
        set((state) => {
          const existingKeys = new Set(
            state.customForms.map((c) => `${c.config.formId}@${c.config.version}`)
          );
          const toAdd = forms.filter(
            (f) => !existingKeys.has(`${f.config.formId}@${f.config.version}`)
          );
          if (toAdd.length === 0) return state;
          return { customForms: [...state.customForms, ...toAdd] };
        });
      },
    }),
    {
      name: 'picker-storage',
      storage: createJSONStorage(() => safeAsyncStorage),
      partialize: (state) => ({
        hiddenPresetIds: state.hiddenPresetIds,
        customForms: state.customForms,
        activePresetId: state.activePresetId,
      }),
    },
  ),
);
