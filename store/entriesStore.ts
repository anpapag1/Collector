import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Entry, EntryData, FieldDef, PhotoItem } from '../types';
import { supabase } from '../lib/supabase';

// Deferred (not a top-level `import`) on purpose: entriesStore.ts loads very
// early (via formStore.ts, before any user interaction), and syncEngine.ts
// in turn imports entriesStore/authStore/pickerStore. A static import here
// would make Metro re-enter this module mid-load, handing those other
// modules a partially-initialized export. Resolving it lazily, the first
// time requestSync() is actually called, means everything has already
// finished loading by then.
function requestSync() {
  require('../services/syncEngine').requestSync();
}

// Lazily read syncEngine's in-flight set (same require-cycle avoidance as
// requestSync above). Used by deleteEntry/clearEntries to detect that an
// entry's first sync is in progress so a delete during that window can be
// tombstoned by local_id (it has no remoteId yet) — see C2 / pendingLocalIdDeletions.
function inFlightEntryIdsSet(): Set<string> {
  try {
    return require('../services/syncEngine').inFlightEntryIds as Set<string>;
  } catch {
    return new Set<string>();
  }
}

// Mirrors the upload path's path convention (services/syncEngine.ts) so a
// deleted entry's photos can be found and removed from Storage too. Only
// meaningful once an entry has a userId (i.e. has actually been synced).
function photoStoragePaths(entry: Entry): string[] {
  if (!entry.userId) return [];
  const imageFields = (entry.fields ?? []).filter((f) => f.type === 'image');
  const paths: string[] = [];
  for (const field of imageFields) {
    const photos: PhotoItem[] = entry.data[field.id] ?? [];
    for (const photo of photos) {
      paths.push(`${entry.userId}/${entry.id}/${photo.id}.jpg`);
    }
  }
  return paths;
}

// A failed/unawaited remote delete used to just orphan the remote row —
// pullRemoteEntries would then see "remote row with no local match" and
// re-download it, "resurrecting" something the user deleted. Tracking
// pending deletions (persisted, so it survives app restarts) lets syncEngine
// retry the Supabase delete on every subsequent pass until it actually
// succeeds, and lets pullRemoteEntries skip rows that are still pending
// deletion instead of racing the retry.
export type PendingDeletion = { remoteId: string; photoPaths: string[] };

// C2: an entry deleted DURING its very first sync has no remoteId yet, so it
// can't be queued as a normal PendingDeletion (which keys on remoteId). The
// server row it's about to create (or just created) is keyed on
// (user_id, local_id), so we tombstone by local_id instead: persisted here,
// retried on every pass, and used by pullRemoteEntries to skip/delete any
// remote row whose local_id is in this set so the deleted entry never
// "resurrects".

// Generic timeout wrapper, mirroring services/syncEngine.ts's withTimeout —
// duplicated locally (rather than imported) to avoid entriesStore depending
// on syncEngine, which itself depends on entriesStore (see the requestSync
// comment above) and would create a require cycle.
function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

const REMOTE_DELETE_TIMEOUT_MS = 15_000;

// C2: an entry is "in-flight on its first sync" when it has no remoteId yet but
// a push is genuinely in progress for it — either syncEngine is mid-upload (its
// id is in inFlightEntryIds) or it's flagged syncing. Such an entry may be
// creating a server row right now, so deleting it must leave a local_id tombstone.
function isInFlightFirstSync(entry: Entry): boolean {
  if (entry.remoteId) return false;
  return inFlightEntryIdsSet().has(entry.id) || entry.syncStatus === 'syncing';
}

// Best-effort-but-retried: attempts the remote entry row delete + photo
// storage cleanup for a single pending deletion, removing it from
// `pendingDeletions` only once both succeed (so a partial failure is
// retried as a whole next pass rather than leaking the row or the photos).
async function attemptPendingDeletion(pending: PendingDeletion): Promise<void> {
  const { error } = await withTimeout(
    supabase.from('entries').delete().eq('id', pending.remoteId),
    REMOTE_DELETE_TIMEOUT_MS,
    `Deleting entry ${pending.remoteId} timed out`
  );
  if (error) throw error;

  if (pending.photoPaths.length > 0) {
    const { error: storageError } = await withTimeout(
      supabase.storage.from('entry-photos').remove(pending.photoPaths),
      REMOTE_DELETE_TIMEOUT_MS,
      `Deleting photos for entry ${pending.remoteId} timed out`
    );
    if (storageError) throw storageError;
  }
}

// C2: delete keyed on (user_id, local_id) for an entry tombstoned before it
// ever got a remoteId. Removes the local_id from the persisted set only on
// success so a failed/app-killed attempt is retried next pass.
async function attemptLocalIdDeletion(localId: string, userId: string): Promise<void> {
  const { error } = await withTimeout(
    supabase.from('entries').delete().eq('user_id', userId).eq('local_id', localId),
    REMOTE_DELETE_TIMEOUT_MS,
    `Deleting entry by local_id ${localId} timed out`
  );
  if (error) throw error;
}

// Called from syncEngine.ts's runSync before pullRemoteEntries, so a pending
// deletion is always retried (or still pending) before the next pull could
// otherwise re-download the same remote row.
export async function processPendingDeletions(): Promise<void> {
  const { pendingDeletions, pendingLocalIdDeletions } = useEntriesStore.getState();

  for (const pending of pendingDeletions) {
    try {
      await attemptPendingDeletion(pending);
      useEntriesStore.setState((s) => ({
        pendingDeletions: s.pendingDeletions.filter((p) => p.remoteId !== pending.remoteId),
      }));
    } catch (err) {
      console.warn(`[sync] retrying pending deletion for ${pending.remoteId} failed, will retry next pass`, err);
    }
  }

  if (pendingLocalIdDeletions.length > 0) {
    // local_id deletes need the user_id (server rows are keyed on it). Read it
    // fresh from the session rather than trusting any cached value.
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (userId) {
      for (const localId of pendingLocalIdDeletions) {
        try {
          await attemptLocalIdDeletion(localId, userId);
          useEntriesStore.setState((s) => ({
            pendingLocalIdDeletions: s.pendingLocalIdDeletions.filter((id) => id !== localId),
          }));
        } catch (err) {
          console.warn(`[sync] retrying local_id deletion for ${localId} failed, will retry next pass`, err);
        }
      }
    }
  }
}

// Allows a UI layer (e.g. app/_layout.tsx) to register a callback that gets
// notified when a persistence write/read/remove fails, so failures can be
// surfaced to the user (e.g. via a toast) instead of only logged.
let onPersistError: ((msg: string) => void) | null = null;

export function setPersistErrorHandler(fn: typeof onPersistError) {
  onPersistError = fn;
}

// Wraps AsyncStorage so persist read/write/remove failures are logged instead
// of silently swallowed or thrown deep inside zustand's persist middleware.
export const safeAsyncStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return await AsyncStorage.getItem(name);
    } catch (err) {
      console.warn(`[storage] getItem failed for "${name}"`, err);
      onPersistError?.('Failed to load entries from device storage');
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (err) {
      console.warn(`[storage] setItem failed for "${name}"`, err);
      onPersistError?.('Failed to save entries to device storage');
    }
  },
  removeItem: async (name) => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (err) {
      console.warn(`[storage] removeItem failed for "${name}"`, err);
      onPersistError?.('Failed to remove entries from device storage');
    }
  },
};

type EntriesState = {
  entries: Entry[];
  pendingDeletions: PendingDeletion[];
  // C2: local_id tombstones for entries deleted mid-first-sync (no remoteId yet).
  pendingLocalIdDeletions: string[];
  addEntry: (data: EntryData, fields: FieldDef[], formTitle: string, createdAt?: number) => void;
  updateEntry: (id: string, data: EntryData) => void;
  deleteEntry: (id: string) => void;
  clearEntries: (options?: { deleteRemote?: boolean; formTitle?: string; userId?: string | null }) => void;
  clearLocalOnly: () => void;
  markSyncing: (id: string) => void;
  // C1: `pushedUpdatedAt` is the entry's updatedAt captured at push time. If
  // the entry's CURRENT updatedAt no longer matches, the user edited it during
  // the upload, so we must NOT mark it 'synced' (leave it 'pending' to re-upload).
  markSynced: (id: string, remoteId: string, remoteUpdatedAt: number, pushedUpdatedAt: number) => void;
  markSyncError: (id: string, message: string) => void;
  mergeRemoteEntries: (remoteEntries: Entry[]) => void;
  refreshEntryFromRemote: (id: string, fresh: Entry) => void;
};

export const useEntriesStore = create<EntriesState>()(
  persist(
    (set) => ({
      entries: [],
      pendingDeletions: [],
      pendingLocalIdDeletions: [],
      addEntry: (data, fields, formTitle, createdAt) => {
        set((s) => {
          const now = Date.now();
          const entry: Entry = {
            id: `entry-${Crypto.randomUUID()}`,
            createdAt: createdAt ?? now,
            formTitle,
            fields,
            data,
            userId: null,
            syncStatus: 'pending',
            updatedAt: now,
          };
          return { entries: [...s.entries, entry] };
        });
        // Fire-and-forget: never block the save-and-navigate flow on network activity.
        requestSync();
      },
      updateEntry: (id, data) => {
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id ? { ...e, data, syncStatus: 'pending', updatedAt: Date.now() } : e
          ),
        }));
        // Re-syncing an edited entry is just another upsert keyed on
        // (user_id, local_id) — it updates the existing remote row rather
        // than creating a new one, so no special "edit" path is needed there.
        requestSync();
      },
      deleteEntry: (id) => {
        let removed: Entry | undefined;
        set((s) => {
          removed = s.entries.find((e) => e.id === id);
          return { entries: s.entries.filter((e) => e.id !== id) };
        });
        if (removed?.remoteId) {
          const pending: PendingDeletion = { remoteId: removed.remoteId, photoPaths: photoStoragePaths(removed) };
          // Recorded synchronously, before the network call, so a failed or
          // app-killed-mid-delete attempt is retried on the next sync pass
          // (via processPendingDeletions) instead of silently orphaning the
          // remote row — which would otherwise get re-downloaded by
          // pullRemoteEntries and "resurrect" the entry locally.
          set((s) => ({ pendingDeletions: [...s.pendingDeletions, pending] }));
          attemptPendingDeletion(pending)
            .then(() => {
              useEntriesStore.setState((s) => ({
                pendingDeletions: s.pendingDeletions.filter((p) => p.remoteId !== pending.remoteId),
              }));
            })
            .catch((error) => {
              console.warn('[sync] remote delete failed, will retry next sync pass', error);
            });
        } else if (removed && isInFlightFirstSync(removed)) {
          // C2: deleted mid-first-sync, no remoteId yet. The push is creating a
          // server row keyed on (user_id, local_id); tombstone by local_id so
          // processPendingDeletions deletes that row and pullRemoteEntries
          // skips it — otherwise it gets re-downloaded and "resurrects".
          set((s) =>
            s.pendingLocalIdDeletions.includes(removed!.id)
              ? s
              : { pendingLocalIdDeletions: [...s.pendingLocalIdDeletions, removed!.id] }
          );
          requestSync();
        }
      },
      // When `formTitle` is given, only entries belonging to that form are
      // removed (used for "Delete all" scoped to the active form, and for
      // cascading entry deletion when a form is deleted) — other forms'
      // entries are left untouched.
      //
      // C4: also scoped to the signed-in user. `formTitle` alone matches by
      // title string, which would delete other form-versions' AND other
      // accounts' entries sharing that title. When `userId` is provided we only
      // remove entries owned by that user (or not yet claimed: userId == null).
      clearEntries: ({
        deleteRemote = true,
        formTitle,
        userId,
      }: { deleteRemote?: boolean; formTitle?: string; userId?: string | null } = {}) => {
        const allEntries = useEntriesStore.getState().entries;
        const entries = allEntries.filter((e) => {
          if (formTitle !== undefined && e.formTitle !== formTitle) return false;
          // undefined userId => caller didn't scope (preserve legacy
          // "everything matching" behavior); null/string => scope to that user
          // plus unclaimed entries.
          if (userId !== undefined && !(e.userId === userId || e.userId == null)) return false;
          return true;
        });
        if (entries.length === 0) return;

        const toRemove = new Set(entries.map((e) => e.id));
        set({ entries: allEntries.filter((e) => !toRemove.has(e.id)) });

        // C2: any removed entry that's mid-first-sync (no remoteId yet) still
        // needs a local_id tombstone so its just-created server row doesn't
        // resurrect — regardless of deleteRemote, since deleteRemote only
        // gates the remoteId-keyed path below.
        if (deleteRemote) {
          const localIdTombstones = entries.filter((e) => isInFlightFirstSync(e)).map((e) => e.id);
          if (localIdTombstones.length > 0) {
            set((s) => ({
              pendingLocalIdDeletions: [
                ...s.pendingLocalIdDeletions,
                ...localIdTombstones.filter((id) => !s.pendingLocalIdDeletions.includes(id)),
              ],
            }));
            requestSync();
          }
        }

        if (!deleteRemote) return;

        const toDelete = entries.filter((e): e is Entry & { remoteId: string } => !!e.remoteId);
        if (toDelete.length === 0) return;

        const pendings: PendingDeletion[] = toDelete.map((e) => ({
          remoteId: e.remoteId,
          photoPaths: photoStoragePaths(e),
        }));
        // Recorded synchronously before the network calls — same reasoning
        // as deleteEntry: a failed bulk delete must be retried next pass,
        // not silently orphan rows that pullRemoteEntries would re-download.
        set((s) => ({ pendingDeletions: [...s.pendingDeletions, ...pendings] }));

        for (const pending of pendings) {
          attemptPendingDeletion(pending)
            .then(() => {
              useEntriesStore.setState((s) => ({
                pendingDeletions: s.pendingDeletions.filter((p) => p.remoteId !== pending.remoteId),
              }));
            })
            .catch((error) => {
              console.warn('[sync] bulk remote delete failed for one entry, will retry next sync pass', error);
            });
        }
      },
      // Used when signing out and choosing to keep the cloud copy but wipe
      // this device — never touches Supabase, just clears the local cache.
      clearLocalOnly: () => set({ entries: [] }),
      markSyncing: (id) => {
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id ? { ...e, syncStatus: 'syncing', syncingSince: Date.now() } : e
          ),
        }));
      },
      markSynced: (id, remoteId, remoteUpdatedAt, pushedUpdatedAt) => {
        set((s) => ({
          entries: s.entries.map((e) => {
            if (e.id !== id) return e;
            // C1 (lost-update guard): if the entry was edited during the
            // in-flight upload, its updatedAt no longer matches the token we
            // pushed. In that case keep it 'pending' so the queued rerun
            // re-uploads the edit — but still record remoteId/remoteUpdatedAt
            // so the conflict check has them. Do NOT bump updatedAt here (that
            // would overwrite the user's edit timestamp).
            const wasEditedDuringPush = e.updatedAt !== pushedUpdatedAt;
            if (wasEditedDuringPush) {
              return {
                ...e,
                syncStatus: 'pending',
                syncingSince: null,
                remoteId,
                remoteUpdatedAt,
                syncError: null,
              };
            }
            return {
              ...e,
              syncStatus: 'synced',
              syncingSince: null,
              remoteId,
              remoteUpdatedAt,
              syncError: null,
              updatedAt: Date.now(),
            };
          }),
        }));
      },
      markSyncError: (id, message) => {
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id
              ? {
                  ...e,
                  syncStatus: 'error',
                  syncingSince: null,
                  syncError: message,
                  syncAttempts: (e.syncAttempts ?? 0) + 1,
                }
              : e
          ),
        }));
      },
      mergeRemoteEntries: (remoteEntries) => {
        set((s) => {
          const localIds = new Set(s.entries.map((e) => e.id));
          const toAdd = remoteEntries.filter((e) => !localIds.has(e.id));
          if (toAdd.length === 0) return s;
          return { entries: [...s.entries, ...toAdd] };
        });
      },
      // Overwrites a local entry's content with the latest remote version —
      // used when another device edited this entry and pull detects the
      // remote `updated_at` is newer than what this device last saw. Only
      // called for entries with no in-flight local edit (see syncEngine.ts).
      refreshEntryFromRemote: (id, fresh) => {
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id
              ? {
                  ...e,
                  data: fresh.data,
                  fields: fresh.fields,
                  formTitle: fresh.formTitle,
                  remoteUpdatedAt: fresh.remoteUpdatedAt,
                  updatedAt: fresh.updatedAt,
                  syncStatus: 'synced',
                  syncError: null,
                }
              : e
          ),
        }));
      },
    }),
    {
      name: 'entries-storage',
      version: 2,
      storage: createJSONStorage(() => safeAsyncStorage),
      migrate: (persisted: any, version) => {
        if (version === 0 && persisted?.entries) {
          persisted.entries = persisted.entries.map((e: any) => ({
            ...e,
            userId: e.userId ?? null,
            syncStatus: e.syncStatus ?? 'pending',
            syncingSince: e.syncingSince ?? null,
            updatedAt: e.updatedAt ?? e.createdAt,
          }));
        }
        if (version < 2) {
          // `seq`/`seqCounter` are no longer stored — display numbers are
          // now derived on the fly from chronological order instead, so
          // multi-device sync can never produce colliding "Entry #01"s.
          delete persisted?.seqCounter;
          if (persisted?.entries) {
            persisted.entries = persisted.entries.map((e: any) => {
              const { seq, ...rest } = e;
              return rest;
            });
          }
        }
        return persisted;
      },
    }
  )
);
