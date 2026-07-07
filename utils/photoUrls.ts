import { supabase } from '../lib/supabase';
import { PhotoItem } from '../types';

// Native builds a displayable photo `uri` locally during sync (syncEngine.ts
// downloads each photo to the device's filesystem). There is no equivalent
// local filesystem on web, so the web dashboard instead resolves a short-lived
// signed URL from the `entry-photos` bucket on demand, using the same
// `{formId}/{entryId}/{photoId}.jpg` path convention entriesStore.ts's
// photoStoragePaths() and syncEngine.ts's upload path both already use —
// keyed by the owning form's `forms.id`, not by user, so admin ownership
// reassignment never has to move files.
//
// Cached for a minute so repeatedly rendering the same entry (e.g. re-opening
// its detail view) doesn't re-request a signed URL for every photo every time.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { url: string; expiresAt: number }>();

export async function resolveEntryPhotoUrl(
  photo: PhotoItem,
  formId: string,
  entryId: string
): Promise<string | null> {
  // Already a usable URL (e.g. a previously-resolved signed URL, or — in a
  // mixed native/web testing scenario — a genuine http(s) URL) — no lookup needed.
  if (photo.uri && /^https?:\/\//i.test(photo.uri)) return photo.uri;

  // Prefer the photo's actual stored object key when we have one (set by
  // syncEngine.ts's uploadOnePhoto at upload time); only fall back to the
  // convention for photos that have no recorded path yet.
  const path = photo.path ?? `${formId}/${entryId}/${photo.id}.jpg`;
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from('entry-photos')
    .createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    console.warn('[photoUrls] failed to resolve signed URL for', path, error);
    return null;
  }

  cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + CACHE_TTL_MS });
  return data.signedUrl;
}
