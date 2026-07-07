// One-off maintenance script: finds and deletes entry-photos Storage objects
// that no longer correspond to any current entries.data reference.
//
// These accumulate because services/adminService.ts's deleteEntryAdmin and
// deleteFormAdmin used to only delete the Postgres row, never the matching
// Storage files (fixed in that file — this script is for cleaning up the
// backlog that already accumulated before the fix). Confirmed live via SQL
// against the entries table + storage.objects: 195 of 301 files in
// entry-photos were orphaned, all corresponding to already-deleted entries.
//
// Requires the SERVICE ROLE key (bypasses RLS to list every user's Storage
// objects) — get it from the Supabase dashboard: Settings -> API -> service_role.
// NEVER commit this key or ship it in the app; only export it in your shell
// for this one run.
//
// Usage (bash):
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/cleanup-orphaned-photos.js --dry-run
// Usage (PowerShell):
//   $env:SUPABASE_SERVICE_ROLE_KEY="..."
//   node scripts/cleanup-orphaned-photos.js --dry-run

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://qnairhnusmauvnucrlgn.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'entry-photos';
const DRY_RUN = process.argv.includes('--dry-run');

if (!SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard -> Settings -> API -> service_role) before running this.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Mirrors services/adminService.ts's photoStoragePathsFromData — scans every
// field's value for `{ id, path }` objects rather than trusting `fields`
// metadata, so it still works for entries whose form schema has changed.
function photoStoragePathsFromData(data) {
  const paths = [];
  for (const value of Object.values(data ?? {})) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (item && typeof item === 'object' && typeof item.path === 'string') {
        paths.push(item.path);
      }
    }
  }
  return paths;
}

// storage.objects isn't exposed via PostgREST on this project (only `public`
// is — confirmed: querying .schema('storage').from('objects') returns
// PGRST106 "Invalid schema"), so listing has to go through the actual
// Storage list() API instead. list() only returns one folder level at a
// time and can't tell recursion depth up front, so this walks it manually:
// entries have no `id` (Supabase's convention for "this is a folder", per
// their docs) and get recursed into; anything else is a real file.
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

async function main() {
  console.log('Fetching all entries\' data to build the "still referenced" set...');
  const { data: entries, error: entriesError } = await supabase.from('entries').select('data');
  if (entriesError) throw entriesError;

  const referenced = new Set();
  for (const row of entries ?? []) {
    for (const path of photoStoragePathsFromData(row.data)) referenced.add(path);
  }
  console.log(`${referenced.size} photo paths are currently referenced by ${(entries ?? []).length} entries.`);

  console.log(`Listing every object in the "${BUCKET}" bucket (recursing userId/entryId folders)...`);
  const allPaths = await listAllObjectPaths(BUCKET);

  const orphaned = allPaths.filter((name) => !referenced.has(name));
  console.log(`${allPaths.length} total objects in storage, ${orphaned.length} are orphaned.`);

  if (orphaned.length === 0) {
    console.log('Nothing to clean up.');
    return;
  }

  if (DRY_RUN) {
    console.log('--dry-run: would delete these paths (nothing was actually deleted):');
    orphaned.forEach((p) => console.log('  ' + p));
    return;
  }

  // storage.remove() accepts an array of paths in one call; chunk defensively
  // in case there are ever thousands.
  const CHUNK = 500;
  for (let i = 0; i < orphaned.length; i += CHUNK) {
    const chunk = orphaned.slice(i, i + CHUNK);
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(chunk);
    if (removeError) throw removeError;
    console.log(`Deleted ${chunk.length} files (${i + chunk.length}/${orphaned.length}).`);
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
