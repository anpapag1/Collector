// One-off maintenance script: downscales every already-uploaded photo in the
// entry-photos bucket in place, to cut Supabase egress on historical entries
// the same way app/collect.tsx now caps newly-captured photos.
//
// Confirmed via SQL against storage.objects (2026-07-08): 102 objects, ~66.6MB
// total, avg 653KB each, max 705KB — small enough that archiving a full
// backup copy before touching anything costs ~66MB of Storage, negligible
// against the 1GB free-tier storage quota.
//
// Overwrites each object at its EXISTING path (upsert), so photo.path/photo.id
// stay identical and nothing else in the app (utils/photoUrls.ts,
// services/syncEngine.ts's native download, utils/exporter.ts) needs to change.
// Already-synced native devices keep their old full-res local copies on disk
// (their staleness check is id-based, not byte-based) — harmless, no extra
// egress. Any fresh sync or web view from this point on gets the smaller file.
//
// Requires the SERVICE ROLE key (bypasses RLS to touch every user's Storage
// objects) — get it from the Supabase dashboard: Settings -> API -> service_role.
// NEVER commit this key or ship it in the app; only export it in your shell
// for this one run.
//
// Usage (bash):
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-shrink-photos.js --dry-run
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-shrink-photos.js
// Usage (PowerShell):
//   $env:SUPABASE_SERVICE_ROLE_KEY="..."
//   node scripts/backfill-shrink-photos.js --dry-run
//   node scripts/backfill-shrink-photos.js
//
// Safe to re-run: photos already at/under MAX_DIMENSION and smaller than the
// re-encode would produce are skipped, so a second run is a fast no-op.

const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://qnairhnusmauvnucrlgn.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'entry-photos';
const ARCHIVE_BUCKET = 'entry-photos-archive';
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 60;
const DRY_RUN = process.argv.includes('--dry-run');

if (!SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard -> Settings -> API -> service_role) before running this.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Same recursive listing approach as scripts/cleanup-orphaned-photos.js —
// storage.objects isn't exposed via PostgREST on this project, so listing
// has to go through the Storage list() API.
async function listAllObjectPaths(bucket, prefix = '') {
  const paths = [];
  const limit = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit, offset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        paths.push(...(await listAllObjectPaths(bucket, fullPath)));
      } else {
        paths.push(fullPath);
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return paths;
}

async function ensureArchiveBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (buckets.some((b) => b.id === ARCHIVE_BUCKET)) return;
  console.log(`Creating "${ARCHIVE_BUCKET}" bucket for originals backup...`);
  const { error: createError } = await supabase.storage.createBucket(ARCHIVE_BUCKET, { public: false });
  if (createError) throw createError;
}

async function main() {
  console.log(`Listing every object in "${BUCKET}"...`);
  const paths = await listAllObjectPaths(BUCKET);
  console.log(`${paths.length} objects found.`);

  if (paths.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  if (!DRY_RUN) await ensureArchiveBucket();

  let totalBefore = 0;
  let totalAfter = 0;
  let shrunk = 0;
  let skipped = 0;

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const { data: original, error: downloadError } = await supabase.storage.from(BUCKET).download(path);
    if (downloadError) {
      console.warn(`  [${i + 1}/${paths.length}] SKIP ${path}: download failed — ${downloadError.message}`);
      skipped++;
      continue;
    }
    const originalBuffer = Buffer.from(await original.arrayBuffer());
    totalBefore += originalBuffer.length;

    const resizedBuffer = await sharp(originalBuffer)
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    // Already small (e.g. a previous run already shrank it) — re-encoding
    // wouldn't save anything and would just cost egress for no benefit.
    if (resizedBuffer.length >= originalBuffer.length) {
      totalAfter += originalBuffer.length;
      console.log(`  [${i + 1}/${paths.length}] skip (already small) ${path} — ${originalBuffer.length}B`);
      skipped++;
      continue;
    }

    totalAfter += resizedBuffer.length;
    shrunk++;
    const pct = Math.round((1 - resizedBuffer.length / originalBuffer.length) * 100);
    console.log(`  [${i + 1}/${paths.length}] ${path} — ${originalBuffer.length}B -> ${resizedBuffer.length}B (-${pct}%)`);

    if (DRY_RUN) continue;

    const { error: archiveError } = await supabase.storage
      .from(ARCHIVE_BUCKET)
      .upload(path, originalBuffer, { contentType: 'image/jpeg', upsert: true });
    if (archiveError) {
      console.warn(`    archive backup failed for ${path}, skipping overwrite to be safe — ${archiveError.message}`);
      continue;
    }

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, resizedBuffer, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) {
      console.warn(`    overwrite failed for ${path} (original archived, safe to retry) — ${uploadError.message}`);
    }
  }

  console.log('');
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Done. ${shrunk} shrunk, ${skipped} skipped.`);
  console.log(`Total: ${(totalBefore / 1024 / 1024).toFixed(2)}MB -> ${(totalAfter / 1024 / 1024).toFixed(2)}MB`);
  if (!DRY_RUN && shrunk > 0) {
    console.log(`Originals backed up to the "${ARCHIVE_BUCKET}" bucket — delete it once you've spot-checked a few photos in the app.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
