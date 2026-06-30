import { createJSONStorage, persist } from 'zustand/middleware';
import { create } from 'zustand';
import { FormConfig } from '../types';
import { safeAsyncStorage } from './entriesStore';
import { supabase } from '../lib/supabase';

export type CustomForm = {
  importId: string;
  config: FormConfig;
  userId?: string | null;
  // The server-side `forms.id` primary key, known once the form has been
  // pushed to or pulled from Supabase. This is the STABLE identity of the
  // remote row and is what makes sync survive an out-of-band ownership change:
  // the admin dashboard can reassign a form to another owner by directly
  // updating `forms.user_id`, so the (user_id, form_id, version) tuple is NOT
  // stable. Matching/updating by `remoteId` (the PK) is. Undefined/null means
  // "not yet on the server" (e.g. imported offline).
  remoteId?: string | null;
};

// Pushes a locally-held custom form to Supabase.
//
// Critical for ownership transfers: once we know the form's server primary key
// (`remoteId`), we UPDATE that exact row by id rather than upserting on
// (user_id, form_id, version). The admin dashboard reassigns a form to another
// owner by directly setting `forms.user_id`; after that, an upsert keyed on
// (user_id, form_id, version) would find no row matching the ORIGINAL owner and
// INSERT a brand-new duplicate under them. Updating by primary key instead
// affects 0 rows under RLS once the form is no longer ours — which the caller's
// pull pass detects and treats as "no longer mine", dropping the stale copy.
//
// Returns a Promise (callers that need the recorded remoteId before continuing
// can await it); it never throws — failures are logged.
export async function pushFormToSupabase(
  importId: string,
  config: FormConfig,
  userId: string,
  remoteId?: string | null
): Promise<void> {
  if (remoteId) {
    const { data, error } = await supabase
      .from('forms')
      .update({ form_title: config.formTitle, schema: config })
      .eq('id', remoteId)
      .select('id');
    if (error) {
      console.warn('[sync] form update failed', error);
      return;
    }
    if (!data || data.length === 0) {
      // The row is gone or has been reassigned to another owner (RLS now hides
      // it from us). Either way it's no longer ours — do NOT fall through to an
      // insert (that's the duplication bug). The next pull reconciles the local
      // cache; nothing more to do here.
      console.warn('[sync] form push: row no longer owned by this user (deleted or reassigned)');
    }
    return;
  }

  // No known server PK yet (fresh import, or imported offline before sign-in):
  // insert via upsert and remember the assigned id so subsequent pushes match
  // by primary key instead of the ownership-fragile tuple.
  const { data, error } = await supabase
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
    .select('id')
    .single();
  if (error) {
    console.warn('[sync] form upload failed', error);
    return;
  }
  if (data?.id) {
    usePickerStore.getState().setFormRemoteId(importId, data.id);
  }
}

// Best-effort remote delete, mirroring entriesStore/deleteEntry's pattern.
// Prefer deleting by the primary key when known (exact + ownership-stable);
// fall back to the (user_id, form_id, version) tuple for forms that predate
// remoteId tracking. RLS already scopes deletes to auth.uid() = user_id.
function deleteFormFromSupabase(config: FormConfig, userId: string, remoteId?: string | null) {
  const query = remoteId
    ? supabase.from('forms').delete().eq('id', remoteId)
    : supabase
        .from('forms')
        .delete()
        .eq('user_id', userId)
        .eq('form_id', config.formId)
        .eq('version', config.version);
  query.then(({ error }) => {
    if (error) console.warn('[sync] best-effort form remote delete failed', error);
  });
}

type PickerState = {
  customForms: CustomForm[];
  activePresetId: string | null;
  addCustomForm: (config: FormConfig, importId: string, userId?: string | null) => void;
  removeCustomForm: (importId: string) => void;
  setActivePresetId: (id: string | null) => void;
  mergeRemoteForms: (forms: CustomForm[]) => void;
  removeRemoteDeletedForms: (serverKeys: Set<string>, userId: string) => void;
  claimCustomFormsForUser: (userId: string) => void;
  discardUnclaimedCustomForms: () => void;
  clearLocalForms: () => void;
  // Records the server primary key for a locally-held form (after a push, or
  // backfilled during a pull for forms imported before remoteId tracking).
  setFormRemoteId: (importId: string, remoteId: string) => void;
  setFormRemoteIds: (pairs: { importId: string; remoteId: string }[]) => void;
};

export const usePickerStore = create<PickerState>()(
  persist(
    (set, get) => ({
      customForms: [],
      activePresetId: null,
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
        // Fresh import: no remoteId yet — push inserts and records the PK.
        pushFormToSupabase(importId, config, userId, null);
      },
      removeCustomForm: (importId) => {
        const removed = get().customForms.find((c) => c.importId === importId);
        set((state) => ({
          customForms: state.customForms.filter((c) => c.importId !== importId),
          activePresetId:
            state.activePresetId === importId ? null : state.activePresetId,
        }));
        if (removed?.userId) {
          deleteFormFromSupabase(removed.config, removed.userId, removed.remoteId);
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

          // A form deleted on another device is still gone from under its
          // entries here — same cascade as deleting it locally, so nothing
          // orphaned is left behind on this device either.
          //
          // C3: the OTHER device owns remote cleanup of its own entries, so
          // this device must only drop its LOCAL copies — deleteRemote: false.
          // Otherwise this cascade would delete the remote entry rows (data
          // loss for the account).
          // C4: scope the local removal to this user's entries (and the
          // form's title), so we don't wipe other accounts'/other versions'
          // entries that happen to share the title.
          setTimeout(() => {
            const { clearEntries } = require('./entriesStore').useEntriesStore.getState();
            for (const c of removed) {
              clearEntries({ formTitle: c.config.formTitle, deleteRemote: false, userId });
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
          // Newly-claimed forms have never been on the server (they were
          // unclaimed); push inserts and records the PK.
          pushFormToSupabase(form.importId, form.config, userId, form.remoteId ?? null);
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
      setFormRemoteId: (importId, remoteId) =>
        set((state) => ({
          customForms: state.customForms.map((c) =>
            c.importId === importId ? { ...c, remoteId } : c
          ),
        })),
      setFormRemoteIds: (pairs) =>
        set((state) => {
          if (pairs.length === 0) return state;
          const byImportId = new Map(pairs.map((p) => [p.importId, p.remoteId]));
          return {
            customForms: state.customForms.map((c) =>
              byImportId.has(c.importId) ? { ...c, remoteId: byImportId.get(c.importId)! } : c
            ),
          };
        }),
    }),
    {
      name: 'picker-storage',
      storage: createJSONStorage(() => safeAsyncStorage),
      partialize: (state) => ({
        customForms: state.customForms,
        activePresetId: state.activePresetId,
      }),
    },
  ),
);
