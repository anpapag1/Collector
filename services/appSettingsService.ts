import { supabase } from '../lib/supabase';

// Single network-wide row (not per-user) controlling behavior every client
// should respect — e.g. whether entry cards show photo thumbnails at all.
// Read is open to any authenticated user (native + web); write is restricted
// to admins by the app_settings RLS policies themselves, not by anything in
// this file — see the "app_settings update admin only" policy, which reuses
// the same is_admin() function backing every other admin RLS check in this
// project (entries/forms/profiles).

export type AppSettings = {
  showEntryPreviews: boolean;
};

export async function fetchAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('show_entry_previews')
    .eq('id', 1)
    .single();
  if (error) throw error;
  return { showEntryPreviews: data.show_entry_previews };
}

export async function updateAppSettings(patch: Partial<AppSettings>): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.showEntryPreviews !== undefined) update.show_entry_previews = patch.showEntryPreviews;

  // .select() (not a bare .update()) so a write RLS silently blocks — which
  // PostgREST reports as a successful response with zero rows, not an error —
  // is still detectable here instead of looking like it succeeded.
  const { data, error } = await supabase
    .from('app_settings')
    .update(update)
    .eq('id', 1)
    .select('show_entry_previews')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Update was blocked (admins only).');
}
