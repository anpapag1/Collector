import { supabase } from '../lib/supabase';
import { Entry, FieldDef, FormConfig } from '../types';

// Direct (non-cached, non-synced) Supabase queries used only by the web
// dashboard's admin mode. Unlike services/syncEngine.ts — which only ever
// pulls the SIGNED-IN user's own rows into the local Zustand stores — an
// admin needs to see other users' forms/entries on demand, which the local
// stores never contain. These mirror Collector-Web's admin-auth.js and
// dashboard.js exactly (same tables, same columns, same RLS admin-bypass
// already configured server-side).

export type Profile = { id: string; email: string; role: string };

export type AdminForm = {
  dbId: string; // forms.id primary key
  formId: string;
  formTitle: string;
  version: string;
  schema: FormConfig;
  userId: string;
};

export type AdminEntry = Pick<Entry, 'data' | 'createdAt' | 'updatedAt'> & {
  remoteId: string; // entries.id primary key
  localId: string;
  formRemoteId: string; // entries.form_id -> forms.id
  formTitle: string | null;
  fields: FieldDef[] | undefined;
  userId: string;
};

export async function loadCurrentUserProfile(): Promise<{ profile: Profile | null; isAdmin: boolean }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { profile: null, isAdmin: false };

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;

  const profile: Profile = data ?? { id: user.id, email: user.email ?? '', role: 'user' };
  return { profile, isAdmin: profile.role === 'admin' };
}

export async function loadAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role')
    .order('email', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function profileLabel(profiles: Profile[], userId: string | null | undefined): string {
  if (!userId) return 'Unclaimed';
  return profiles.find((p) => p.id === userId)?.email ?? userId;
}

// `ownerId` omitted fetches every user's rows (admin "All users" view); RLS
// scopes this to admin-only regardless of what the client asks for.
export async function fetchAllForms(ownerId?: string): Promise<AdminForm[]> {
  let query = supabase.from('forms').select('id, user_id, form_id, form_title, version, schema');
  if (ownerId) query = query.eq('user_id', ownerId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    dbId: row.id,
    formId: row.form_id,
    formTitle: row.form_title,
    version: row.version,
    schema: row.schema,
    userId: row.user_id,
  }));
}

export async function fetchAllEntries(ownerId?: string): Promise<AdminEntry[]> {
  let query = supabase
    .from('entries')
    .select('id, local_id, form_id, form_title, fields, data, created_at, updated_at, user_id');
  if (ownerId) query = query.eq('user_id', ownerId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    remoteId: row.id,
    localId: row.local_id,
    formRemoteId: row.form_id,
    formTitle: row.form_title,
    fields: row.fields ?? undefined,
    data: row.data ?? {},
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    userId: row.user_id,
  }));
}

// Mirrors Collector-Web/dashboard.js's switchFormOwner, simplified now that
// entry-photos Storage objects are keyed by form (forms.id), not by owner:
// reassignment is a plain DB update on both tables — no Storage objects to
// move, since a photo's location no longer depends on who currently owns
// the row. Entries are matched by form_id (the real FK) rather than
// (owner, title), which also fixes the old title-matching fragility (two
// forms sharing a title used to risk touching the wrong entries).
export async function switchFormOwner(
  form: { dbId: string },
  newOwnerId: string
): Promise<void> {
  const { error: formError } = await supabase
    .from('forms')
    .update({ user_id: newOwnerId })
    .eq('id', form.dbId);
  if (formError) throw formError;

  const { error: entriesError } = await supabase
    .from('entries')
    .update({ user_id: newOwnerId })
    .eq('form_id', form.dbId);
  if (entriesError) throw entriesError;
}

// Extracts every Supabase Storage path referenced by an entry's field data —
// scans each field's value for `{ id, path }` objects (the shape
// services/syncEngine.ts's uploadOnePhoto leaves in entries.data after
// upload) rather than trusting `fields` type metadata, so it still works for
// entries whose form schema has since changed or is missing.
function photoStoragePathsFromData(data: Record<string, unknown> | null | undefined): string[] {
  const paths: string[] = [];
  for (const value of Object.values(data ?? {})) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (item && typeof item === 'object' && typeof (item as { path?: unknown }).path === 'string') {
        paths.push((item as { path: string }).path);
      }
    }
  }
  return paths;
}

async function removeEntryPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from('entry-photos').remove(paths);
  if (error) throw error;
}

// Mirrors Collector-Web/dashboard.js's deleteForm (admin branch): delete the
// form's entries (matched by form_id — the real FK, not the old (owner,
// title) match) then the form row by primary key. Also cleans up every
// deleted entry's Storage photos — the DB-only delete used to leave every
// photo behind in entry-photos permanently (confirmed live: 195 orphaned
// files, 182 from this exact gap on a single account).
export async function deleteFormAdmin(form: { dbId: string }): Promise<void> {
  const { data: rows, error: fetchError } = await supabase
    .from('entries')
    .select('data')
    .eq('form_id', form.dbId);
  if (fetchError) throw fetchError;

  const { error: entriesError } = await supabase
    .from('entries')
    .delete()
    .eq('form_id', form.dbId);
  if (entriesError) throw entriesError;

  const { error: formError } = await supabase.from('forms').delete().eq('id', form.dbId);
  if (formError) throw formError;

  await removeEntryPhotos((rows ?? []).flatMap((row) => photoStoragePathsFromData(row.data)));
}

// Mirrors Collector-Web/entries.js's editActiveEntryJson.
export async function updateEntryData(entryRemoteId: string, data: Record<string, any>): Promise<void> {
  const { error } = await supabase
    .from('entries')
    .update({ data, updated_at: new Date().toISOString() })
    .eq('id', entryRemoteId);
  if (error) throw error;
}

// Same Storage-cleanup gap as deleteFormAdmin above — fetches the entry's
// data before deleting the row so its photos can be removed too.
export async function deleteEntryAdmin(entryRemoteId: string): Promise<void> {
  const { data: row, error: fetchError } = await supabase
    .from('entries')
    .select('data')
    .eq('id', entryRemoteId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('entries').delete().eq('id', entryRemoteId);
  if (error) throw error;

  await removeEntryPhotos(photoStoragePathsFromData(row?.data));
}
