import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useEntriesStore, processPendingDeletions } from '../store/entriesStore';
import { usePickerStore } from '../store/pickerStore';
import { Entry, EntryData, FormConfig, PhotoItem } from '../types';
import { validateFormConfig } from '../utils/schemaLoader';
import { debugLog } from '../utils/debugLog';

const PHOTO_UPLOAD_TIMEOUT_MS = 30_000;
const DB_QUERY_TIMEOUT_MS = 15_000;
const STALE_SYNCING_MS = 2 * 60_000;

let isRunning = false;
let queuedRerun = false;

// Tracks entry ids with a syncOneEntry call genuinely in flight right now —
// guards against two concurrent syncOneEntry calls for the same entry (e.g.
// the stale-syncing recovery picking up an entry whose original attempt is
// merely slow, not actually dead, or runSync somehow re-entering despite the
// isRunning guard), which would otherwise race markSyncing/markSynced/markSyncError.
const inFlightEntryIds = new Set<string>();

// Single entry point every trigger (addEntry, sign-in, foreground, connectivity,
// interval) calls. Coalesces concurrent calls into one pass instead of running
// runSync() multiple times in parallel.
export function requestSync() {
  if (isRunning) {
    debugLog('[sync] requestSync: already running, queuing a rerun');
    queuedRerun = true;
    return;
  }
  runSync().catch((e) => {
    console.warn('[sync] runSync failed', e);
    Sentry.captureException(e);
  });
}

async function runSync(): Promise<void> {
  isRunning = true;
  try {
    // Fetch fresh rather than trusting the zustand-cached session — that
    // cache only updates when onAuthStateChange fires, which doesn't happen
    // just because an access token expired while the app sat idle/backgrounded.
    // getSession() transparently refreshes an expired-but-refreshable token,
    // which matters here: a stale token makes Postgres see auth.uid() as
    // null, and every RLS check (entries, storage) then fails with the same
    // generic "row-level security policy" error — easy to mistake for a
    // real permissions bug.
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.warn('[sync] getSession failed', sessionError);
      Sentry.captureException(sessionError);
    }
    if (!session) {
      debugLog('[sync] runSync skipped: not signed in');
      return;
    }
    const userId = session.user.id;

    const { entries, markSyncing, markSynced, markSyncError } = useEntriesStore.getState();
    const now = Date.now();
    const due = entries.filter((e) => {
      if (e.syncStatus === 'pending' || e.syncStatus === 'error') return true;
      // A 'syncing' entry whose previous attempt never finished (app was
      // killed mid-upload) is retried instead of being stuck forever.
      if (e.syncStatus === 'syncing' && e.syncingSince && now - e.syncingSince > STALE_SYNCING_MS) {
        return true;
      }
      return false;
    });
    debugLog(`[sync] runSync: ${due.length} entr${due.length === 1 ? 'y' : 'ies'} due out of ${entries.length} total`);

    for (const entry of due) {
      if (inFlightEntryIds.has(entry.id)) {
        debugLog(`[sync] entry ${entry.id} already has a sync in flight, skipping`);
        continue;
      }
      inFlightEntryIds.add(entry.id);
      markSyncing(entry.id);
      debugLog(`[sync] pushing entry ${entry.id} (status was ${entry.syncStatus})`);
      try {
        const { remoteId, remoteUpdatedAt } = await syncOneEntry(entry, userId);
        markSynced(entry.id, remoteId, remoteUpdatedAt);
        debugLog(`[sync] entry ${entry.id} synced ok -> remoteId ${remoteId}`);
      } catch (err) {
        const message = errorMessage(err);
        console.warn(`[sync] entry ${entry.id} failed:`, message, err);
        Sentry.captureException(err);
        markSyncError(entry.id, message);
      } finally {
        inFlightEntryIds.delete(entry.id);
      }
    }

    // Retry any remote deletes that didn't complete on a previous pass
    // before pulling — otherwise pullRemoteEntries could re-download a row
    // whose delete is merely pending retry, "resurrecting" it locally.
    try {
      await processPendingDeletions();
    } catch (err) {
      console.warn('[sync] pending deletions retry failed', err);
      Sentry.captureException(err);
    }

    // Each pull is independent — one failing (e.g. a single photo download
    // erroring out) must never prevent the other from running.
    try {
      await pullRemoteEntries(userId);
    } catch (err) {
      console.warn('[sync] entries pull failed', err);
      Sentry.captureException(err);
    }
    try {
      await pullRemoteForms(userId);
    } catch (err) {
      console.warn('[sync] forms pull failed', err);
      Sentry.captureException(err);
    }
  } finally {
    isRunning = false;
    if (queuedRerun) {
      queuedRerun = false;
      requestSync();
    }
  }
}

async function syncOneEntry(
  entry: Entry,
  userId: string
): Promise<{ remoteId: string; remoteUpdatedAt: number }> {
  // Only entries that have synced at least once, AND whose remoteUpdatedAt
  // we actually know, can conflict — a brand-new entry (no remoteId yet)
  // has no remote row to clash with, and an entry synced before this field
  // existed has remoteUpdatedAt == null. Treating "unknown" as "definitely
  // stale" would falsely flag every pre-existing entry's first edit as a
  // conflict, permanently stuck in error (skip the check instead — the
  // upcoming push records a real remoteUpdatedAt, so future edits compare
  // correctly).
  if (entry.remoteId && entry.remoteUpdatedAt != null) {
    const { data: current, error: checkError } = await withTimeout(
      supabase.from('entries').select('updated_at').eq('id', entry.remoteId).single(),
      DB_QUERY_TIMEOUT_MS,
      `Checking entry ${entry.id} for conflicts timed out`
    );
    if (checkError) {
      // Do NOT proceed without the conflict check — that would upload over
      // a possibly-newer remote version with zero protection. Throw so this
      // entry is left in 'error' (via markSyncError) and retried next pass.
      throw checkError;
    } else if (current) {
      const liveRemoteUpdatedAt = new Date(current.updated_at).getTime();
      if (entry.remoteUpdatedAt < liveRemoteUpdatedAt) {
        throw new Error(
          'This entry was changed on another device since you last synced. Your edit was not uploaded — open the entry again to see the latest version before re-editing.'
        );
      }
    }
  }

  const remoteData = await uploadEntryPhotos(entry, userId);

  const { data, error } = await withTimeout(
    supabase
      .from('entries')
      .upsert(
        {
          local_id: entry.id,
          user_id: userId,
          form_title: entry.formTitle ?? null,
          fields: entry.fields ?? null,
          data: remoteData,
          created_at: new Date(entry.createdAt).toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,local_id' }
      )
      .select('id, updated_at')
      .single(),
    DB_QUERY_TIMEOUT_MS,
    `Saving entry ${entry.id} timed out`
  );

  if (error) throw error;
  return { remoteId: data.id as string, remoteUpdatedAt: new Date(data.updated_at).getTime() };
}

// Returns a copy of entry.data with each image field's local PhotoItem[]
// replaced by uploaded storage paths. The local entry/data is never mutated.
async function uploadEntryPhotos(entry: Entry, userId: string): Promise<Record<string, any>> {
  const remoteData: Record<string, any> = { ...entry.data };
  const imageFields = (entry.fields ?? []).filter((f) => f.type === 'image');

  for (const field of imageFields) {
    const photos: PhotoItem[] = entry.data[field.id] ?? [];
    if (!Array.isArray(photos) || photos.length === 0) continue;

    const uploaded = await Promise.all(
      photos.map((photo) => uploadOnePhoto(entry.id, photo, userId))
    );
    remoteData[field.id] = uploaded;
  }

  return remoteData;
}

async function uploadOnePhoto(
  entryId: string,
  photo: PhotoItem,
  userId: string
): Promise<{ id: string; path: string }> {
  const storagePath = `${userId}/${entryId}/${photo.id}.jpg`;

  const base64 = await withTimeout(
    FileSystem.readAsStringAsync(photo.uri, { encoding: FileSystem.EncodingType.Base64 }),
    PHOTO_UPLOAD_TIMEOUT_MS,
    `Reading photo ${photo.id} timed out`
  );

  const { error } = await withTimeout(
    supabase.storage
      .from('entry-photos')
      .upload(storagePath, decode(base64), { contentType: 'image/jpeg', upsert: true }),
    PHOTO_UPLOAD_TIMEOUT_MS,
    `Uploading photo ${photo.id} timed out`
  );
  if (error) throw error;

  return { id: photo.id, path: storagePath };
}

// Symmetric to the push side: fetches every remote row for this user and
// (a) downloads any whose local_id isn't present on this device yet — covers
// both "signed into an account with existing data" and "another device
// created an entry while this one was online" — and (b) refreshes any
// already-present, fully-synced entry whose remote `updated_at` is newer
// than what this device last saw, i.e. it was edited on another device.
// Entries with a pending local edit or a conflict (`syncStatus !== 'synced'`)
// are deliberately left alone here — see syncOneEntry's conflict check for
// why overwriting them on pull would silently destroy the user's own edit.
async function pullRemoteEntries(userId: string): Promise<void> {
  const { entries, pendingDeletions } = useEntriesStore.getState();
  const localById = new Map(entries.map((e) => [e.id, e]));
  // Defense in depth: processPendingDeletions already runs before this in
  // runSync, but skip any row whose delete is still pending retry anyway —
  // downloading it back would "resurrect" an entry the user deleted.
  const pendingDeletionIds = new Set(pendingDeletions.map((p) => p.remoteId));

  const { data: rows, error } = await withTimeout(
    supabase
      .from('entries')
      .select('id, local_id, form_title, fields, data, created_at, updated_at')
      .eq('user_id', userId),
    DB_QUERY_TIMEOUT_MS,
    'Pulling entries timed out'
  );
  if (error) {
    console.warn('[sync] pull failed', error);
    Sentry.captureException(error);
    return;
  }

  const missing: typeof rows = [];
  const stale: typeof rows = [];
  for (const row of rows ?? []) {
    if (pendingDeletionIds.has(row.id)) continue;
    const local = localById.get(row.local_id);
    if (!local) {
      missing.push(row);
      continue;
    }
    if (local.syncStatus !== 'synced') continue;
    const remoteUpdatedAt = new Date(row.updated_at).getTime();
    if ((local.remoteUpdatedAt ?? 0) < remoteUpdatedAt) {
      stale.push(row);
    }
  }
  if (missing.length === 0 && stale.length === 0) return;

  const [missingResults, staleResults] = await Promise.all([
    Promise.allSettled(missing.map((row) => downloadRemoteEntry(row, userId))),
    Promise.allSettled(stale.map((row) => downloadRemoteEntry(row, userId))),
  ]);

  const downloaded: Entry[] = [];
  for (const result of missingResults) {
    if (result.status === 'fulfilled') {
      downloaded.push(result.value);
    } else {
      console.warn('[sync] failed to pull one entry, will retry next pass', result.reason);
      Sentry.captureException(result.reason);
    }
  }
  if (downloaded.length > 0) {
    useEntriesStore.getState().mergeRemoteEntries(downloaded);
  }

  for (const result of staleResults) {
    if (result.status === 'fulfilled') {
      useEntriesStore.getState().refreshEntryFromRemote(result.value.id, result.value);
    } else {
      console.warn('[sync] failed to refresh one entry, will retry next pass', result.reason);
      Sentry.captureException(result.reason);
    }
  }
}

async function downloadRemoteEntry(
  row: {
    id: string;
    local_id: string;
    form_title: string | null;
    fields: Entry['fields'];
    data: Record<string, any>;
    created_at: string;
    updated_at: string;
  },
  userId: string
): Promise<Entry> {
  const localData: EntryData = { ...row.data };
  const imageFields = (row.fields ?? []).filter((f) => f.type === 'image');

  let hadPartialFailure = false;
  for (const field of imageFields) {
    const remotePhotos: { id: string; path: string }[] = row.data[field.id] ?? [];
    if (!Array.isArray(remotePhotos) || remotePhotos.length === 0) continue;

    // allSettled (not all): one flaky photo must not discard the others that
    // did download successfully — a Promise.all reject here would throw away
    // every already-downloaded photo for this entry, forcing a full re-download
    // of the whole field (and every other image field) on the next retry.
    const results = await Promise.allSettled(remotePhotos.map((p) => downloadOnePhoto(p)));
    const localPhotos: PhotoItem[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        localPhotos.push(result.value);
      } else {
        hadPartialFailure = true;
        console.warn(`[sync] failed to download photo ${remotePhotos[i]?.id} for entry ${row.local_id}, will retry next pass`, result.reason);
      }
    }
    localData[field.id] = localPhotos;
  }

  const serverRemoteUpdatedAt = new Date(row.updated_at).getTime();
  // On a partial photo failure, record a remoteUpdatedAt one tick behind the
  // server's actual value instead of the real one. pullRemoteEntries' staleness
  // check (`local.remoteUpdatedAt < remoteUpdatedAt`) compares against this
  // field, so storing the true value here would make the entry look fully
  // up to date forever — even though it's missing photos — and no future pass
  // would ever retry the download. Storing it one tick behind keeps the entry
  // "stale" so the next pull re-attempts the still-missing photos.
  const remoteUpdatedAt = hadPartialFailure ? serverRemoteUpdatedAt - 1 : serverRemoteUpdatedAt;
  if (hadPartialFailure) {
    console.warn(`[sync] entry ${row.local_id} downloaded with one or more missing photos; will retry on the next sync pass`);
  }

  return {
    id: row.local_id,
    createdAt: new Date(row.created_at).getTime(),
    formTitle: row.form_title ?? undefined,
    fields: row.fields ?? undefined,
    data: localData,
    userId,
    syncStatus: 'synced',
    remoteId: row.id,
    remoteUpdatedAt,
    updatedAt: remoteUpdatedAt,
  };
}

async function downloadOnePhoto(photo: { id: string; path: string }): Promise<PhotoItem> {
  const dest = (FileSystem.documentDirectory ?? '') + `${photo.id}.jpg`;

  const { data, error } = await supabase.storage
    .from('entry-photos')
    .createSignedUrl(photo.path, 60);
  if (error || !data?.signedUrl) {
    throw error ?? new Error(`Could not get signed URL for photo ${photo.id}`);
  }

  await withTimeout(
    FileSystem.downloadAsync(data.signedUrl, dest),
    PHOTO_UPLOAD_TIMEOUT_MS,
    `Downloading photo ${photo.id} timed out`
  );

  return { id: photo.id, uri: dest };
}

// Symmetric to pickerStore.addCustomForm's push: brings down any forms
// already in the account that this device hasn't imported yet.
async function pullRemoteForms(userId: string): Promise<void> {
  const { data: rows, error } = await withTimeout(
    supabase.from('forms').select('id, form_id, version, schema').eq('user_id', userId),
    DB_QUERY_TIMEOUT_MS,
    'Pulling forms timed out'
  );
  if (error) {
    console.warn('[sync] forms pull failed', error);
    Sentry.captureException(error);
    return;
  }

  const local = usePickerStore.getState().customForms;
  const localUserForms = local.filter((c) => c.userId === userId);

  const serverKeys = new Set((rows ?? []).map((row) => `${row.form_id}@${row.version}`));
  const localKeys = new Set(localUserForms.map((c) => `${c.config.formId}@${c.config.version}`));

  const missing = (rows ?? []).filter((row) => !localKeys.has(`${row.form_id}@${row.version}`));
  const extraLocal = localUserForms.filter((c) => !serverKeys.has(`${c.config.formId}@${c.config.version}`));

  // If a local form isn't on the server, it was either added offline and push failed,
  // or it was synced and then deleted on another device.
  // Locally-added forms have an importId starting with 'custom-'.
  // These re-push attempts are awaited (not fire-and-forget) below, BEFORE
  // removeRemoteDeletedForms runs — otherwise removeRemoteDeletedForms would
  // see the stale (pre-push) serverKeys and treat every one of these
  // just-re-pushed, locally-added forms as "deleted on another device",
  // deleting them (and cascading into deleting all of that form's entries).
  const pushResults = await Promise.allSettled(
    extraLocal
      .filter((c) => c.importId.startsWith('custom-'))
      .map((c) =>
        supabase
          .from('forms')
          .upsert({
            user_id: userId,
            form_id: c.config.formId,
            form_title: c.config.formTitle,
            version: c.config.version,
            schema: c.config,
          }, { onConflict: 'user_id,form_id,version' })
          .then(({ error }) => {
            if (error) throw error;
            return c;
          })
      )
  );

  for (const result of pushResults) {
    if (result.status === 'rejected') {
      console.warn('[sync] form offline-add push failed', result.reason);
    }
  }

  // Forms this device just (re-)pushed (or any other extraLocal,
  // locally-added-pending-push form) must never be treated as deletion
  // candidates, regardless of whether the push succeeded — a failed push
  // will simply be retried next pass, but it must not be deleted out from
  // under the user in the meantime. Add their keys to the "safe" set passed
  // to removeRemoteDeletedForms.
  const safeKeys = new Set(serverKeys);
  for (const c of extraLocal) {
    safeKeys.add(`${c.config.formId}@${c.config.version}`);
  }

  usePickerStore.getState().removeRemoteDeletedForms(safeKeys, userId);

  if (missing.length === 0) return;

  // A row's `schema` jsonb is trusted at push time (it came from a locally
  // validated import), but another device, a manual DB edit, or future
  // schema drift could still land something malformed here — re-validate
  // before it's allowed into this device's picker rather than trusting it.
  const valid: { importId: string; config: FormConfig; userId: string }[] = [];
  for (const row of missing) {
    try {
      const config = validateFormConfig(row.schema);
      valid.push({ importId: row.id, config, userId });
    } catch (err) {
      console.warn('[sync] skipped invalid pulled form', row.form_id, err);
      Sentry.captureException(err);
    }
  }
  if (valid.length === 0) return;

  usePickerStore.getState().mergeRemoteForms(valid);
}

// Supabase errors come back as plain objects (PostgrestError/StorageError),
// not Error instances, so `String(err)` alone yields "[object Object]".
function errorMessage(err: unknown): string {
  const raw = rawErrorMessage(err);
  // A "row-level security policy" failure almost always means the request's
  // auth token was missing/expired when Postgres evaluated auth.uid() —
  // surface that plainly instead of the cryptic Postgres wording, since the
  // actual fix (sign out and back in) isn't obvious from the raw message.
  if (raw.toLowerCase().includes('row-level security')) {
    return `Your session may have expired. Try signing out and back in, then retry. (${raw})`;
  }
  return raw;
}

function rawErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const withMessage = err as { message?: unknown; error_description?: unknown };
    if (typeof withMessage.message === 'string') return withMessage.message;
    if (typeof withMessage.error_description === 'string') return withMessage.error_description;
    try {
      return JSON.stringify(err);
    } catch {
      // fall through
    }
  }
  return String(err);
}

// Accepts PromiseLike, not just Promise — Supabase's query builders are
// thenable (awaitable) but don't implement the full Promise interface
// (no .catch()/.finally()), so a strict Promise<T> param type rejects them.
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
