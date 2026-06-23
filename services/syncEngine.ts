import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useEntriesStore } from '../store/entriesStore';
import { Entry, EntryData, PhotoItem } from '../types';

const PHOTO_UPLOAD_TIMEOUT_MS = 30_000;
const STALE_SYNCING_MS = 2 * 60_000;

let isRunning = false;
let queuedRerun = false;

// Single entry point every trigger (addEntry, sign-in, foreground, connectivity,
// interval) calls. Coalesces concurrent calls into one pass instead of running
// runSync() multiple times in parallel.
export function requestSync() {
  if (isRunning) {
    queuedRerun = true;
    return;
  }
  runSync().catch((e) => console.warn('[sync] runSync failed', e));
}

async function runSync(): Promise<void> {
  isRunning = true;
  try {
    const { session } = useAuthStore.getState();
    if (!session) return;
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

    for (const entry of due) {
      markSyncing(entry.id);
      try {
        const remoteId = await syncOneEntry(entry, userId);
        markSynced(entry.id, remoteId);
      } catch (err) {
        markSyncError(entry.id, errorMessage(err));
      }
    }

    await pullRemoteEntries(userId);
  } finally {
    isRunning = false;
    if (queuedRerun) {
      queuedRerun = false;
      requestSync();
    }
  }
}

async function syncOneEntry(entry: Entry, userId: string): Promise<string> {
  const remoteData = await uploadEntryPhotos(entry, userId);

  const { data, error } = await supabase
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
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
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
// inserts any whose local_id isn't already present on this device — covers
// both "signed into an account with existing data" and "another device
// created an entry while this one was online".
async function pullRemoteEntries(userId: string): Promise<void> {
  const { entries } = useEntriesStore.getState();
  const localIds = new Set(entries.map((e) => e.id));

  const { data: rows, error } = await supabase
    .from('entries')
    .select('id, local_id, form_title, fields, data, created_at, updated_at')
    .eq('user_id', userId);
  if (error) {
    console.warn('[sync] pull failed', error);
    return;
  }

  const missing = (rows ?? []).filter((row) => !localIds.has(row.local_id));
  if (missing.length === 0) return;

  const downloaded = await Promise.all(
    missing.map((row) => downloadRemoteEntry(row, userId))
  );
  useEntriesStore.getState().mergeRemoteEntries(downloaded);
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

  return {
    id: row.local_id,
    createdAt: new Date(row.created_at).getTime(),
    formTitle: row.form_title ?? undefined,
    fields: row.fields ?? undefined,
    data: localData,
    userId,
    syncStatus: 'synced',
    remoteId: row.id,
    updatedAt: new Date(row.updated_at).getTime(),
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

// Supabase errors come back as plain objects (PostgrestError/StorageError),
// not Error instances, so `String(err)` alone yields "[object Object]".
function errorMessage(err: unknown): string {
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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
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
