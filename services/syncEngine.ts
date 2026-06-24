import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useEntriesStore } from '../store/entriesStore';
import { usePickerStore } from '../store/pickerStore';
import { Entry, EntryData, FormConfig, PhotoItem } from '../types';
import { validateFormConfig } from '../utils/schemaLoader';

const PHOTO_UPLOAD_TIMEOUT_MS = 30_000;
const DB_QUERY_TIMEOUT_MS = 15_000;
const STALE_SYNCING_MS = 2 * 60_000;

let isRunning = false;
let queuedRerun = false;

// Single entry point every trigger (addEntry, sign-in, foreground, connectivity,
// interval) calls. Coalesces concurrent calls into one pass instead of running
// runSync() multiple times in parallel.
export function requestSync() {
  if (isRunning) {
    console.log('[sync] requestSync: already running, queuing a rerun');
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
      console.log('[sync] runSync skipped: not signed in');
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
    console.log(`[sync] runSync: ${due.length} entr${due.length === 1 ? 'y' : 'ies'} due out of ${entries.length} total`);

    for (const entry of due) {
      markSyncing(entry.id);
      console.log(`[sync] pushing entry ${entry.id} (status was ${entry.syncStatus})`);
      try {
        const { remoteId, remoteUpdatedAt } = await syncOneEntry(entry, userId);
        markSynced(entry.id, remoteId, remoteUpdatedAt);
        console.log(`[sync] entry ${entry.id} synced ok -> remoteId ${remoteId}`);
      } catch (err) {
        const message = errorMessage(err);
        console.warn(`[sync] entry ${entry.id} failed:`, message, err);
        Sentry.captureException(err);
        markSyncError(entry.id, message);
      }
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
      console.warn(`[sync] conflict pre-check failed for ${entry.id}, proceeding without it`, checkError);
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
  const { entries } = useEntriesStore.getState();
  const localById = new Map(entries.map((e) => [e.id, e]));

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

  for (const field of imageFields) {
    const remotePhotos: { id: string; path: string }[] = row.data[field.id] ?? [];
    if (!Array.isArray(remotePhotos) || remotePhotos.length === 0) continue;

    const localPhotos = await Promise.all(
      remotePhotos.map((p) => downloadOnePhoto(p))
    );
    localData[field.id] = localPhotos;
  }

  const remoteUpdatedAt = new Date(row.updated_at).getTime();
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
  const existingKeys = new Set(local.map((c) => `${c.config.formId}@${c.config.version}`));
  const missing = (rows ?? []).filter((row) => !existingKeys.has(`${row.form_id}@${row.version}`));
  if (missing.length === 0) return;

  // A row's `schema` jsonb is trusted at push time (it came from a locally
  // validated import), but another device, a manual DB edit, or future
  // schema drift could still land something malformed here — re-validate
  // before it's allowed into this device's picker rather than trusting it.
  const valid: { importId: string; config: FormConfig }[] = [];
  for (const row of missing) {
    try {
      const config = validateFormConfig(row.schema);
      valid.push({ importId: row.id, config });
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
