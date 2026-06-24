# TODO

## Data & sync

- [x] Real conflict handling for edited entries — `services/syncEngine.ts` now compares the remote row's `updated_at` against the local entry's last-known `remoteUpdatedAt` before re-pushing an edit. If another device changed it since, the push is refused (entry marked `error` with an explanatory message) instead of silently overwriting. Every successful push explicitly sets `updated_at` and stores the value back as `remoteUpdatedAt`, so this and the pull-side refresh below both stay accurate (this also resolves the previously-listed "`updated_at` not being pushed to remote on sync" bug — same fix, verified against the current code). Pull now also refreshes already-synced entries when the remote is newer, not just brand-new ones. **Known gap**: a conflict-marked entry stays in `error` state until manually re-edited — there's no "discard mine / take theirs" UI yet. **Fixed bug**: any entry already synced before this feature shipped had `remoteId` but no `remoteUpdatedAt`, so its first edit always falsely registered as a conflict (`undefined ?? 0` always compares as older than the real remote timestamp) and got stuck in `error` forever. The conflict check now only runs when `remoteUpdatedAt` is actually known — already-stuck entries self-heal on the next sync pass.
- [x] Remote delete for removed custom forms — `removeCustomForm` (`store/pickerStore.ts`) now does a best-effort delete against the `forms` table when the removed form had been synced.
- [x] Conflict-free entry IDs — `addEntry` (`store/entriesStore.ts`) now generates ids via `expo-crypto`'s `randomUUID()` instead of a per-device length-based counter.
- [x] Fixed bug: entries with photos got permanently stuck failing to sync (text-only edits synced fine) — the `entry-photos` storage bucket had RLS policies for `select`/`insert`/`delete` but no `update`. Re-uploading a photo to a path that already existed (e.g. retrying a previously-failed sync) does an update under the hood, which had no policy permitting it, so it always failed with a generic "row-level security policy" error regardless of retries or session refresh. Fixed by adding the matching `entry_photos_owner_update` policy on `storage.objects` (Supabase dashboard SQL, not an app code change).
- [ ] Editable photos/GPS on the edit-entry screen — currently read-only (`app/edit-entry/[id].tsx`) to avoid risking collection-time data; worth revisiting once there's a clear UX for re-capturing vs. correcting.
- [ ] Background/periodic sync independent of app foreground — right now sync only runs while the app is open; a background task (where the OS allows it) would catch up faster after long offline stretches.

## Forms

- [x] Validate custom-imported forms more strictly before sync — `pullRemoteForms` now runs every pulled form through `validateFormConfig` (now covered by Jest tests) before adding it to the local picker; malformed rows are skipped and logged/reported to Sentry.
- [ ] Multi-image-field support real-device verification — picker/export logic was fixed to handle multiple image fields per form; needs a manual pass on a real device to confirm end to end (add a second image field, take photos into each, check ZIP export).

## UI

- [x] Make all confirmation dialogs consistent — built a shared `showDialog()`/`<DialogHost />` (`store/dialogStore.ts`, `components/DialogHost.tsx`) and migrated every `Alert.alert` call site plus the old Toast-based discard-warning in `app/collect.tsx` onto it.

## Auth & accounts

- [x] Password reset flow — `app/(auth)/reset-password.tsx` (request link) → email → `app/(auth)/update-password.tsx` (set new password), via the same deep-link handling pattern as email verification. **Requires `collector://reset-password-callback` to be added to Supabase's allowed Redirect URLs** (Authentication → URL Configuration) before it works on-device.
- [ ] Account deletion — no way for a user to delete their Supabase account/data from within the app. Deferred: needs a Supabase Edge Function holding the service_role key, since deleting an `auth.users` row can't be done safely from the mobile client with the anon key.

## UX & polish (not started)

- [ ] Localize the app UI itself — form content is already Greek-friendly, but app chrome (buttons, settings, alerts) is English-only. Large sweep across nearly every screen — do as its own isolated pass, not alongside other UI work.
- [ ] Accessibility pass (screen reader labels, contrast) given the app's own subject matter is accessibility data collection. Same scope caveat as localization — do alone, last.

## Reliability

- [x] Crash/error reporting — `@sentry/react-native` wired into `app/_layout.tsx` and every sync-failure site in `services/syncEngine.ts`. No-op until a real DSN is set in `.env`'s `EXPO_PUBLIC_SENTRY_DSN`.
- [x] Automated tests — Jest (`jest-expo` preset) set up; 20 tests covering `utils/schemaLoader.ts`'s `validateFormConfig`/`loadBundledConfig`. Run via `npm test`.
- [ ] Custom SMTP provider for Supabase auth emails — the built-in service has a strict rate limit, fine for production scale but easy to hit in testing (and now relevant to both signup verification and the new password-reset emails).