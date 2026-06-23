import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useEntriesStore } from '../store/entriesStore';
import { Entry, PhotoItem } from '../types';

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
        markSyncError(entry.id, err instanceof Error ? err.message : String(err));
      }
    }
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
        seq: entry.seq,
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
