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
// Cached for just under the signed URL's own server-side expiry, so repeatedly
// rendering the same entry (e.g. re-opening its detail view, or scrolling a
// list) doesn't re-request a signed URL for every photo every time.
const SIGNED_URL_EXPIRES_IN = 3600;
const CACHE_TTL_MS = 3_570_000;
const cache = new Map<string, { url: string; expiresAt: number }>();

// A fresh signed URL has a new token/query string every time, so even with
// the cache above the *browser's* HTTP cache can't dedupe image bytes across
// a cache-TTL expiry or a page reload. Storage object paths are
// content-addressed — a new/replaced photo always gets a fresh `photo.id`
// (see collect.tsx), objects are never overwritten in place — so it's safe
// to cache the actual decoded bytes indefinitely for the life of the tab,
// keyed by path, independent of signed-URL expiry. Simple LRU by byte budget
// so a long session (e.g. running the same export repeatedly) can't grow
// this unboundedly.
const BLOB_CACHE_MAX_BYTES = 50 * 1024 * 1024;
const blobCache = new Map<string, { objectUrl: string; bytes: number }>();
let blobCacheBytes = 0;

function rememberBlob(path: string, objectUrl: string, bytes: number) {
  blobCache.set(path, { objectUrl, bytes });
  blobCacheBytes += bytes;
  while (blobCacheBytes > BLOB_CACHE_MAX_BYTES && blobCache.size > 1) {
    const oldestKey = blobCache.keys().next().value as string;
    const oldest = blobCache.get(oldestKey);
    if (!oldest) break;
    URL.revokeObjectURL(oldest.objectUrl);
    blobCacheBytes -= oldest.bytes;
    blobCache.delete(oldestKey);
  }
}

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

  const cachedBlob = blobCache.get(path);
  if (cachedBlob) return cachedBlob.objectUrl;

  const cached = cache.get(path);
  let signedUrl = cached && cached.expiresAt > Date.now() ? cached.url : null;

  if (!signedUrl) {
    const { data, error } = await supabase.storage
      .from('entry-photos')
      .createSignedUrl(path, SIGNED_URL_EXPIRES_IN);
    if (error || !data?.signedUrl) {
      console.warn('[photoUrls] failed to resolve signed URL for', path, error);
      return null;
    }
    signedUrl = data.signedUrl;
    cache.set(path, { url: signedUrl, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  try {
    const response = await fetch(signedUrl);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    rememberBlob(path, objectUrl, blob.size);
    return objectUrl;
  } catch (err) {
    console.warn('[photoUrls] failed to fetch photo bytes for', path, err);
    return signedUrl;
  }
}
