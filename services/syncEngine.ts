import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useEntriesStore, processPendingDeletions } from '../store/entriesStore';
import { useSyncStore } from '../store/syncStore';
import { usePickerStore, pushFormToSupabase, CustomForm } from '../store/pickerStore';
import { Entry, EntryData, FormConfig, PhotoItem } from '../types';
import { validateFormConfig } from '../utils/schemaLoader';
import { debugLog } from '../utils/debugLog';

const PHOTO_UPLOAD_TIMEOUT_MS = 30_000;
const DB_QUERY_TIMEOUT_MS = 15_000;
const STALE_SYNCING_MS = 2 * 60_000;
// entries.updated_at is set client-side (new Date().toISOString(), not a DB
// trigger/default), so a device with a lagging clock could push a row whose
// timestamp is behind another device's already-advanced cursor. Subtracting
// this buffer before every delta query accepts a little harmless re-fetched
// overlap (the staleness check below already dedupes reapplied rows safely)
// in exchange for never silently missing a row.
const SYNC_CURSOR_SKEW_BUFFER_MS = 5 * 60_000;
// The delta cursor can't see hard deletes (a deleted row has no updated_at to
// be "newer" than), so an unfiltered id-only reconciliation pass still runs,
// just infrequently rather than every sync pass.
const RECONCILE_INTERVAL_MS = 30 * 60_000;

let isRunning = false;
let queuedRerun = false;

// Tracks entry ids with a syncOneEntry call genuinely in flight right now —
// guards against two concurrent syncOneEntry calls for the same entry (e.g.
// the stale-syncing recovery picking up an entry whose original attempt is
// merely slow, not actually dead, or runSync somehow re-entering despite the
// isRunning guard), which would otherwise race markSyncing/markSynced/markSyncError.
export const inFlightEntryIds = new Set<string>();

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
      // C1: capture the entry's updatedAt as of THIS push. If the user edits
      // the entry mid-upload, updateEntry bumps updatedAt + sets 'pending';
      // markSynced compares against this token and refuses to force the entry
      // back to 'synced', so the edit isn't lost.
      const pushedUpdatedAt = entry.updatedAt;
      try {
        const formId = await resolveEntryFormId(entry, userId);
        if (!formId) {
          // The form this entry belongs to hasn't synced yet (and couldn't be
          // pushed now either — e.g. offline, or genuinely gone). Leave this
          // entry as an error so it's retried on the next pass, once the form
          // has had a chance to sync.
          throw new Error("This entry's form hasn't finished syncing yet — will retry automatically.");
        }
        const { remoteId, remoteUpdatedAt } = await syncOneEntry(entry, userId, formId);
        markSynced(entry.id, remoteId, remoteUpdatedAt, pushedUpdatedAt, formId);
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

// Resolves the Supabase forms.id (`forms.id`) that entry-photos Storage
// objects for this entry should live under, so ownership reassignment (see
// services/adminService.ts's switchFormOwner) never has to move files.
// Prefers the entry's own cache; falls back to looking up the CustomForm it
// was created against (store/pickerStore.ts) by its local formImportId, and
// pushes that form now if it hasn't synced yet — otherwise an entry
// collected against a brand-new form would stay stuck waiting for some
// unrelated future sync pass to happen to push the form first.
async function resolveEntryFormId(entry: Entry, userId: string): Promise<string | null> {
  if (entry.formRemoteId) return entry.formRemoteId;
  if (!entry.formImportId) return null;

  const form = usePickerStore.getState().customForms.find((f) => f.importId === entry.formImportId);
  if (!form) return null;
  if (form.remoteId) return form.remoteId;

  await pushFormToSupabase(form.importId, form.config, userId, form.remoteId ?? null);
  return usePickerStore.getState().customForms.find((f) => f.importId === entry.formImportId)?.remoteId ?? null;
}

async function syncOneEntry(
  entry: Entry,
  userId: string,
  formId: string
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

  // C6: fetch the existing remote row's data (if any) so uploadEntryPhotos can
  // merge by photo id. After a partial photo DOWNLOAD, the local image field is
  // missing the photos that failed to download; without this merge the next
  // push would overwrite the complete remote photo array with the incomplete
  // local one, losing those photos remotely. Preserving remote photo ids the
  // local set no longer has keeps that from happening.
  let existingRemoteData: Record<string, any> | null = null;
  if (entry.remoteId) {
    const { data: existing, error: existingError } = await withTimeout(
      supabase.from('entries').select('data').eq('id', entry.remoteId).single(),
      DB_QUERY_TIMEOUT_MS,
      `Fetching remote photos for entry ${entry.id} timed out`
    );
    if (existingError) throw existingError;
    existingRemoteData = (existing?.data as Record<string, any>) ?? null;
  }

  const remoteData = await uploadEntryPhotos(entry, formId, existingRemoteData);

  const { data, error } = await withTimeout(
    supabase
      .from('entries')
      .upsert(
        {
          local_id: entry.id,
          user_id: userId,
          form_id: formId,
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
//
// C6 invariant: an incomplete local photo set must never delete remote photos
// the server still has. We merge by photo id — every locally-present photo is
// (re-)uploaded, and any photo id present in the existing REMOTE data but
// missing locally (e.g. it failed to download in a partial pull) is carried
// forward by its stored {id, path} so it stays on the server.
async function uploadEntryPhotos(
  entry: Entry,
  formId: string,
  existingRemoteData: Record<string, any> | null = null
): Promise<Record<string, any>> {
  const remoteData: Record<string, any> = { ...entry.data };
  const imageFields = (entry.fields ?? []).filter((f) => f.type === 'image');

  for (const field of imageFields) {
    const photos: PhotoItem[] = entry.data[field.id] ?? [];
    const localPhotos = Array.isArray(photos) ? photos : [];

    // A photo with no local `uri` (only `path`) has already been uploaded and
    // was never re-downloaded onto this device — nothing to read locally, so
    // carry its existing path forward instead of re-uploading.
    const toUpload = localPhotos.filter((p): p is PhotoItem & { uri: string } => typeof p.uri === 'string');
    const alreadyUploaded = localPhotos
      .filter((p) => typeof p.uri !== 'string' && typeof p.path === 'string')
      .map((p) => ({ id: p.id, path: p.path as string }));

    const uploaded = [
      ...(await Promise.all(toUpload.map((photo) => uploadOnePhoto(entry.id, photo, formId)))),
      ...alreadyUploaded,
    ];

    // Carry forward any remote photo whose id isn't in the local set — those
    // are photos the server has that this device never downloaded (partial
    // pull). Dropping them would lose them remotely.
    const localIds = new Set(uploaded.map((p) => p.id));
    const remotePhotos: { id: string; path: string }[] = Array.isArray(existingRemoteData?.[field.id])
      ? existingRemoteData![field.id]
      : [];
    const preserved = remotePhotos.filter(
      (p) => p && typeof p.id === 'string' && typeof p.path === 'string' && !localIds.has(p.id)
    );

    remoteData[field.id] = [...uploaded, ...preserved];
  }

  return remoteData;
}

async function uploadOnePhoto(
  entryId: string,
  photo: PhotoItem & { uri: string },
  formId: string
): Promise<{ id: string; path: string }> {
  const storagePath = `${formId}/${entryId}/${photo.id}.jpg`;

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
  const { entries, pendingDeletions, pendingLocalIdDeletions } = useEntriesStore.getState();
  const localById = new Map(entries.map((e) => [e.id, e]));
  // Defense in depth: processPendingDeletions already runs before this in
  // runSync, but skip any row whose delete is still pending retry anyway —
  // downloading it back would "resurrect" an entry the user deleted.
  const pendingDeletionIds = new Set(pendingDeletions.map((p) => p.remoteId));
  // C2: same defense for entries tombstoned by local_id (deleted mid-first-sync,
  // before they had a remoteId). Skip any remote row whose local_id is still
  // pending deletion so it isn't re-downloaded before its delete lands.
  const pendingLocalIdSet = new Set(pendingLocalIdDeletions);

  // Captured before any query runs, so it's safe to use as the next cursor:
  // any row written while this pass is still in flight will have an
  // updated_at >= this timestamp and gets picked up next pass rather than
  // silently skipped.
  const pullStartedAt = Date.now();
  const syncCursors = useSyncStore.getState();
  const cursor = syncCursors.lastSyncedAt[userId];

  // Delta pass: with a stored cursor, only rows changed since the last
  // successful pull (minus a clock-skew safety buffer) — most passes touch
  // zero or a handful of rows, so this avoids re-fetching the whole table's
  // id/local_id/updated_at every time. No cursor yet (first sync ever, or
  // after a reinstall) falls back to the previous unfiltered behavior.
  let entriesQuery = supabase.from('entries').select('id, local_id, updated_at').eq('user_id', userId);
  if (cursor) {
    entriesQuery = entriesQuery.gt('updated_at', new Date(cursor - SYNC_CURSOR_SKEW_BUFFER_MS).toISOString());
  }
  const { data: rows, error } = await withTimeout(entriesQuery, DB_QUERY_TIMEOUT_MS, 'Pulling entries timed out');
  if (error) {
    console.warn('[sync] pull failed', error);
    Sentry.captureException(error);
    return;
  }

  const missingIds: string[] = [];
  const staleIds: string[] = [];

  for (const row of rows ?? []) {
    if (pendingDeletionIds.has(row.id)) continue;
    if (pendingLocalIdSet.has(row.local_id)) continue;
    const local = localById.get(row.local_id);
    if (!local) {
      missingIds.push(row.id);
      continue;
    }
    if (local.syncStatus !== 'synced') continue;
    const remoteUpdatedAt = new Date(row.updated_at).getTime();
    if ((local.remoteUpdatedAt ?? 0) < remoteUpdatedAt) {
      staleIds.push(row.id);
    }
  }

  // A delta filter can never see hard deletes (a deleted row has no
  // updated_at to be "newer" than), so detecting entries removed on
  // another device needs an unfiltered id-only pull — run only occasionally
  // rather than every pass, since it's the one query here that still scales
  // with total row count instead of just what changed.
  const lastReconciledAt = syncCursors.lastReconciledAt[userId] ?? 0;
  if (pullStartedAt - lastReconciledAt > RECONCILE_INTERVAL_MS) {
    const { data: idRows, error: idError } = await withTimeout(
      supabase.from('entries').select('id').eq('user_id', userId),
      DB_QUERY_TIMEOUT_MS,
      'Reconciling entries timed out'
    );
    if (idError) {
      console.warn('[sync] reconciliation pull failed', idError);
      Sentry.captureException(idError);
    } else {
      const remoteIdSet = new Set((idRows ?? []).map((r) => r.id));
      const deletedLocalIds: string[] = [];
      for (const local of entries) {
        if (local.userId === userId && local.remoteId && !remoteIdSet.has(local.remoteId)) {
          // It was previously synced (has remoteId), but the server no longer
          // returns it for this user. It was deleted by another device/web.
          deletedLocalIds.push(local.id);
        }
      }
      if (deletedLocalIds.length > 0) {
        useEntriesStore.getState().removeLocalOnly(deletedLocalIds);
      }
      syncCursors.setLastReconciledAt(userId, pullStartedAt);
    }
  }

  if (missingIds.length === 0 && staleIds.length === 0) {
    // Nothing needed this pass — safe to advance the cursor all the way up
    // to when this pass started.
    syncCursors.setLastSyncedAt(userId, pullStartedAt);
    return;
  }

  // Second pass: fetch the full payload (including `data`/`fields`) only for
  // the rows actually needed, instead of every row in the account.
  const neededIds = [...missingIds, ...staleIds];
  const { data: fullRows, error: fullError } = await withTimeout(
    supabase
      .from('entries')
      .select('id, local_id, form_id, form_title, fields, data, created_at, updated_at')
      .in('id', neededIds),
    DB_QUERY_TIMEOUT_MS,
    'Pulling entry details timed out'
  );
  if (fullError) {
    console.warn('[sync] pull details failed', fullError);
    Sentry.captureException(fullError);
    return;
  }

  const fullById = new Map((fullRows ?? []).map((row) => [row.id, row]));
  const missing = missingIds.map((id) => fullById.get(id)).filter((row): row is NonNullable<typeof row> => !!row);
  const stale = staleIds.map((id) => fullById.get(id)).filter((row): row is NonNullable<typeof row> => !!row);

  const [missingResults, staleResults] = await Promise.all([
    Promise.allSettled(missing.map((row) => downloadRemoteEntry(row, userId))),
    Promise.allSettled(stale.map((row) => downloadRemoteEntry(row, userId))),
  ]);

  // Tracks whether every row in this batch ended up fully up to date, so the
  // cursor below only advances when it's actually safe to. A rejected
  // promise is the obvious case; the less obvious one is downloadRemoteEntry
  // resolving "successfully" but with one or more photos still missing — it
  // deliberately reports remoteUpdatedAt one tick behind the server's real
  // value in that case (see its own comment) specifically so the row keeps
  // looking stale. That trick only works if the cursor never advances past
  // it either, or the row would eventually age out of the delta filter's
  // buffer window and stop being retried at all.
  let anyIncomplete = false;

  const downloaded: Entry[] = [];
  for (let i = 0; i < missingResults.length; i++) {
    const result = missingResults[i];
    if (result.status === 'fulfilled') {
      downloaded.push(result.value);
      if (result.value.remoteUpdatedAt !== new Date(missing[i].updated_at).getTime()) anyIncomplete = true;
    } else {
      console.warn('[sync] failed to pull one entry, will retry next pass', result.reason);
      Sentry.captureException(result.reason);
      anyIncomplete = true;
    }
  }
  if (downloaded.length > 0) {
    useEntriesStore.getState().mergeRemoteEntries(downloaded);
  }

  for (let i = 0; i < staleResults.length; i++) {
    const result = staleResults[i];
    if (result.status === 'fulfilled') {
      useEntriesStore.getState().refreshEntryFromRemote(result.value.id, result.value);
      if (result.value.remoteUpdatedAt !== new Date(stale[i].updated_at).getTime()) anyIncomplete = true;
    } else {
      console.warn('[sync] failed to refresh one entry, will retry next pass', result.reason);
      Sentry.captureException(result.reason);
      anyIncomplete = true;
    }
  }

  if (!anyIncomplete) {
    syncCursors.setLastSyncedAt(userId, pullStartedAt);
  }
}

async function downloadRemoteEntry(
  row: {
    id: string;
    local_id: string;
    form_id: string;
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
    formRemoteId: row.form_id,
    data: localData,
    userId,
    syncStatus: 'synced',
    remoteId: row.id,
    remoteUpdatedAt,
    updatedAt: remoteUpdatedAt,
  };
}

async function downloadOnePhoto(photo: { id: string; path: string }): Promise<PhotoItem> {
  // There is no local filesystem on web (expo-file-system's downloadAsync
  // throws "not available on web"), so there's nothing to download to. The
  // web dashboard instead resolves a fresh signed URL on demand when it
  // actually needs to display a photo (utils/photoUrls.ts), recomputing this
  // same `{userId}/{entryId}/{photoId}.jpg` storage path. Storing the raw
  // path here (rather than a real local uri) is enough to mark this photo
  // "synced" so it isn't endlessly retried every sync pass.
  if (Platform.OS === 'web') {
    return { id: photo.id, uri: photo.path };
  }

  const dest = (FileSystem.documentDirectory ?? '') + `${photo.id}.jpg`;

  // photo.id is never reused for different content (see collect.tsx), so a
  // file already sitting at this deterministic path is guaranteed to be this
  // exact photo — no need to re-download it, whether this is a fresh
  // sign-in re-syncing the whole photo history or a later pass re-visiting
  // an entry that's "stale" for an unrelated field.
  const existing = await FileSystem.getInfoAsync(dest);
  if (existing.exists) {
    return { id: photo.id, uri: dest };
  }

  const { data, error } = await supabase.storage
    .from('entry-photos')
    .createSignedUrl(photo.path, 60);
  if (error || !data?.signedUrl) {
    throw error ?? new Error(`Could not get signed URL for photo ${photo.id}`);
  }

  // Download to a temp path and move into place only on success, so an app
  // kill mid-download can't leave a partial file at `dest` that the check
  // above would then treat as complete forever.
  const tmpDest = `${dest}.tmp`;
  await withTimeout(
    FileSystem.downloadAsync(data.signedUrl, tmpDest),
    PHOTO_UPLOAD_TIMEOUT_MS,
    `Downloading photo ${photo.id} timed out`
  );
  await FileSystem.moveAsync({ from: tmpDest, to: dest });

  return { id: photo.id, uri: dest };
}

// Symmetric to pickerStore.addCustomForm's push: brings down any forms already
// in the account that this device hasn't imported yet, AND reconciles forms
// that are no longer ours — deleted on another device, OR reassigned to a
// different owner via the admin dashboard (which directly updates
// forms.user_id). Both look identical to us under RLS: no owned row exists.
async function pullRemoteForms(userId: string): Promise<void> {
  // Reconciling ownership (missing/reassigned/deleted forms) needs every
  // owned row's id/form_id/version every pass — that set doesn't fit a
  // simple updated_at cursor the way entries does. What dominates row size
  // is `schema` (the full form definition), which is only actually needed
  // for forms this device doesn't have yet — so leave that out here and
  // fetch it separately, only for the ones found missing below.
  const { data: rows, error } = await withTimeout(
    supabase.from('forms').select('id, form_id, version').eq('user_id', userId),
    DB_QUERY_TIMEOUT_MS,
    'Pulling forms timed out'
  );
  if (error) {
    console.warn('[sync] forms pull failed', error);
    Sentry.captureException(error);
    return;
  }

  const picker = usePickerStore.getState();
  const localUserForms = picker.customForms.filter((c) => c.userId === userId);

  const rowByKey = new Map((rows ?? []).map((row) => [`${row.form_id}@${row.version}`, row]));
  const serverKeys = new Set(rowByKey.keys());
  const localKeys = new Set(localUserForms.map((c) => `${c.config.formId}@${c.config.version}`));

  // Backfill the server primary key onto any matched local form that lacks one
  // (e.g. imported before remoteId tracking existed). Capturing the PK while
  // the form is STILL ours is what lets a LATER ownership change be handled by
  // id — see the classification of extraLocal below.
  const backfill: { importId: string; remoteId: string }[] = [];
  for (const c of localUserForms) {
    const row = rowByKey.get(`${c.config.formId}@${c.config.version}`);
    if (row && !c.remoteId) backfill.push({ importId: c.importId, remoteId: row.id });
  }
  if (backfill.length > 0) picker.setFormRemoteIds(backfill);

  const missing = (rows ?? []).filter((row) => !localKeys.has(`${row.form_id}@${row.version}`));
  const extraLocal = localUserForms.filter((c) => !serverKeys.has(`${c.config.formId}@${c.config.version}`));

  // A local form with no matching owned server row is one of two things:
  //  - remoteId present  => it WAS on the server under us but no longer is
  //    (deleted on another device, OR reassigned to a different owner — RLS now
  //    hides that row). In BOTH cases it is no longer ours: drop it locally and
  //    NEVER re-push. Re-pushing is exactly what duplicated the form — an
  //    upsert on (user_id, form_id, version) finds no row for the original
  //    owner and INSERTS a fresh duplicate under them.
  //  - remoteId absent   => imported on this device and never reached the server
  //    (offline import, or a push that failed). This is the ONLY case to push.
  //
  // NOTE: a form reassigned away before it ever recorded a remoteId (i.e.
  // imported on an app version predating this tracking, AND reassigned before
  // its next normal sync could backfill the PK) can still duplicate once. Every
  // owned form backfills its remoteId on its next ordinary pull, closing that
  // window going forward.
  const neverSynced = extraLocal.filter((c) => !c.remoteId);

  // Push genuine never-synced imports BEFORE the removal pass so their keys can
  // be protected. pushFormToSupabase records the assigned remoteId on success.
  await Promise.allSettled(
    neverSynced.map((c) => pushFormToSupabase(c.importId, c.config, userId, null))
  );

  // Protect matched forms and the just-pushed never-synced ones. Everything
  // else owned by us (the remoteId-bearing extraLocal forms = no longer ours)
  // is removed locally by removeRemoteDeletedForms, which cascades local entry
  // cleanup (deleteRemote:false — the new owner keeps the remote rows; the
  // dashboard also reassigns those entries to the new owner).
  const safeKeys = new Set(serverKeys);
  for (const c of neverSynced) {
    safeKeys.add(`${c.config.formId}@${c.config.version}`);
  }
  usePickerStore.getState().removeRemoteDeletedForms(safeKeys, userId);

  if (missing.length === 0) return;

  const { data: schemaRows, error: schemaError } = await withTimeout(
    supabase.from('forms').select('id, schema').in('id', missing.map((row) => row.id)),
    DB_QUERY_TIMEOUT_MS,
    'Pulling form schemas timed out'
  );
  if (schemaError) {
    console.warn('[sync] form schemas pull failed', schemaError);
    Sentry.captureException(schemaError);
    return;
  }
  const schemaById = new Map((schemaRows ?? []).map((row) => [row.id, row.schema]));

  // A row's `schema` jsonb is trusted at push time (it came from a locally
  // validated import), but another device, a manual DB edit, or future
  // schema drift could still land something malformed here — re-validate
  // before it's allowed into this device's picker rather than trusting it.
  const valid: CustomForm[] = [];
  for (const row of missing) {
    const schema = schemaById.get(row.id);
    try {
      const config = validateFormConfig(schema);
      // Record the remote PK so this device can match/update the exact row and
      // survive a future ownership change without re-pushing a duplicate.
      valid.push({ importId: row.id, config, userId, remoteId: row.id });
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
