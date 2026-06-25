import { createJSONStorage, persist } from 'zustand/middleware';
import { create } from 'zustand';
import { FormConfig } from '../types';
import { safeAsyncStorage } from './entriesStore';
import { supabase } from '../lib/supabase';

export type CustomForm = {
  importId: string;
  config: FormConfig;
  userId?: string | null;
};

function pushFormToSupabase(config: FormConfig, userId: string) {
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
}

// Best-effort remote delete, mirroring entriesStore/deleteEntry's pattern.
// Forms don't store a separate remoteId locally, so the (user_id, form_id,
// version) unique key doubles as the match condition. RLS already scopes
// deletes to auth.uid() = user_id, so this is safe even if userId were stale.
function deleteFormFromSupabase(config: FormConfig, userId: string) {
  supabase
    .from('forms')
    .delete()
    .eq('user_id', userId)
    .eq('form_id', config.formId)
    .eq('version', config.version)
    .then(({ error }) => {
      if (error) console.warn('[sync] best-effort form remote delete failed', error);
    });
}

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
  removeRemoteDeletedForms: (serverKeys: Set<string>, userId: string) => void;
  claimCustomFormsForUser: (userId: string) => void;
  discardUnclaimedCustomForms: () => void;
  clearLocalForms: () => void;
};

export const usePickerStore = create<PickerState>()(
  persist(
    (set, get) => ({
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
          customForms: [...state.customForms, { importId, config, userId: userId ?? null }],
        }));
        // Forms sync is push-on-import / pull-on-sync only — no offline
        // queue, since forms change far less often than entries. Imported
        // while signed out, it just stays local (userId: null, "unclaimed")
        // until claimed on a later sign-in — see claimCustomFormsForUser.
        // userId is passed in by the caller (rather than read from
        // authStore here) so this store doesn't import authStore — avoids
        // a pickerStore <-> authStore <-> syncEngine require cycle.
        if (!userId) return;
        pushFormToSupabase(config, userId);
      },
      removeCustomForm: (importId) => {
        const removed = get().customForms.find((c) => c.importId === importId);
        set((state) => ({
          customForms: state.customForms.filter((c) => c.importId !== importId),
          activePresetId:
            state.activePresetId === importId ? null : state.activePresetId,
        }));
        if (removed?.userId) {
          deleteFormFromSupabase(removed.config, removed.userId);
        }
      },
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

          const newState: Partial<PickerState> = {
            customForms: [...state.customForms, ...toAdd],
          };

          if (!state.activePresetId && toAdd.length > 0) {
            const firstNew = toAdd[0];
            newState.activePresetId = firstNew.importId;
            setTimeout(() => {
              const formStore = require('./formStore').useFormStore.getState();
              if (!formStore.schema) {
                formStore.loadSchema(firstNew.config);
              }
            }, 0);
          }

          return newState;
        });
      },
      removeRemoteDeletedForms: (serverKeys, userId) => {
        set((state) => {
          const toKeep = state.customForms.filter(
            (c) => c.userId !== userId || serverKeys.has(`${c.config.formId}@${c.config.version}`)
          );

          if (toKeep.length === state.customForms.length) return state;

          const removed = state.customForms.filter((c) => !toKeep.includes(c));
          const removedIds = new Set(removed.map((c) => c.importId));

          const newActivePresetId =
            state.activePresetId && removedIds.has(state.activePresetId)
              ? null
              : state.activePresetId;

          if (newActivePresetId === null && state.activePresetId !== null) {
            setTimeout(() => {
              require('./formStore').useFormStore.getState().clearSchema();
            }, 0);
          }

          // A form deleted on another device is still gone from under its
          // entries here — same cascade as deleting it locally, so nothing
          // orphaned is left behind on this device either.
          setTimeout(() => {
            const { clearEntries } = require('./entriesStore').useEntriesStore.getState();
            for (const c of removed) {
              clearEntries({ formTitle: c.config.formTitle });
            }
          }, 0);

          return { customForms: toKeep, activePresetId: newActivePresetId };
        });
      },
      // Mirrors entriesStore/migrateLegacyEntries' claim flow: forms imported
      // before ever signing in (userId: null) get stamped with the now-known
      // userId and pushed up, same as a fresh import would be.
      claimCustomFormsForUser: (userId) => {
        const unclaimed = get().customForms.filter((c) => !c.userId);
        if (unclaimed.length === 0) return;
        set((state) => ({
          customForms: state.customForms.map((c) =>
            c.userId ? c : { ...c, userId }
          ),
        }));
        for (const form of unclaimed) {
          pushFormToSupabase(form.config, userId);
        }
      },
      discardUnclaimedCustomForms: () => {
        set((state) => ({
          customForms: state.customForms.filter((c) => !!c.userId),
        }));
      },
      // Used when signing out and choosing to wipe this device's cached
      // forms — never touches Supabase, just clears the local cache (same
      // contract as entriesStore.clearLocalOnly).
      clearLocalForms: () => set({ customForms: [], activePresetId: null }),
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
