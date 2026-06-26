# Collector — Extensive Code Review (2026-06-26)

> **Resolution status (same day):** All findings below were fixed by four
> file-partitioned agents and validated — `npx tsc --noEmit` passes clean and all
> 27 Jest tests pass on the merged tree. Cross-file signature changes were made
> and all call sites updated: `markSynced` gained a `pushedUpdatedAt` arg (C1),
> `clearEntries` gained an optional `userId` (C4), and `inFlightEntryIds` +
> `pendingLocalIdDeletions` were added for the in-flight-delete tombstone (C2),
> wired via cycle-safe lazy `require`. M6 was partially addressed (lowered JPEG
> quality + TODO; true dimension downscale deferred — needs `expo-image-manipulator`).
> The two *Investigated & dismissed* items were intentionally left unchanged.
>
> **Status by finding:** C1, C2, C3, C4, C5, C6 — fixed · H1, H2, H3, H4, H5 —
> fixed · M1, M2, M3, M4, M5 — fixed · M6 — partial · L1, L2, L3 — fixed.

Full multi-agent review of the **current on-disk state** (~10.6k LOC), covering the
data/sync layer, auth/stores/dialog, UI screens & field components, and the new
**form-builder** feature, plus config/security. Four parallel review agents; every
high-impact claim was then independently re-verified against the source before
inclusion (two agent claims were disproved — see *Investigated & dismissed*).

Severity: **Critical** = data loss/corruption, cross-account exposure, or a
crash/store-rejection on a supported target. **High** = real bug reachable in
realistic conditions. **Medium/Low** = narrower or cosmetic.

---

## Critical

### C1. Lost update: editing an entry while its sync is in flight marks it `synced`, and the second edit never uploads
`store/entriesStore.ts` (`markSynced`) + `services/syncEngine.ts` (sync loop)

`syncOneEntry` uploads a snapshot of the entry taken at the top of the `due` loop.
If the user saves another edit *during* that upload, `updateEntry` flips the entry
to `syncStatus:'pending'` with the new data — but when the in-flight upload
resolves, `markSynced` unconditionally sets `syncStatus:'synced'` and
`updatedAt: Date.now()`, overwriting the pending status. The follow-up sync pass
(`queuedRerun`) then skips the entry because it's no longer `pending`. **Result:
the local store holds the second edit, the server holds the first, and the second
edit is never pushed — silent divergence with no error.** Reachable any time a save
lands while a prior sync of the same entry is still uploading (large photos make
the window seconds-wide).

**Fix direction:** capture a version token (e.g. the `updatedAt` value) at push
time; in `markSynced`, no-op the status change (leave it `pending`) if the entry's
current `updatedAt` differs from the token that was uploaded.

### C2. Deleting an entry mid-first-sync resurrects it on the next pull
`store/entriesStore.ts` (`deleteEntry`/`clearEntries`) + `services/syncEngine.ts` (`pullRemoteEntries`)

`pendingDeletions` is only queued for entries that already have a `remoteId`. An
entry that is `syncing` for the very first time has no local `remoteId` yet. If it's
deleted during that window, the in-flight upsert still creates the server row, but
nothing is queued to delete it — and `pullRemoteEntries` treats any server row with
no local match as "missing → download". **The deleted entry comes back on the next
pull.** Reachable when delete (single or "Delete all") races an entry's first sync.

**Fix direction:** when deleting an entry that is currently in `inFlightEntryIds`
(or `syncing` with no `remoteId`), record a tombstone keyed by `local_id` so the
post-sync row can be reconciled/deleted, or block deletion of in-flight entries
until the sync resolves.

### C3. A form deleted on another device causes this device to delete that form's entries **remotely**
`store/pickerStore.ts:145-147` (`removeRemoteDeletedForms`)

```ts
const { clearEntries } = require('./entriesStore').useEntriesStore.getState();
for (const c of removed) {
  clearEntries({ formTitle: c.config.formTitle });   // deleteRemote defaults to true
}
```
`clearEntries` defaults to `deleteRemote: true`. So when device B deletes a form,
device A pulls, sees the form missing, and cascades a **remote** deletion of every
entry of that form — including entries other devices/accounts may still want. If B's
deletion was a mistake (or B only meant to remove it locally), the entries are gone
server-side. **Cross-device remote data loss.**

**Fix direction:** pass `deleteRemote: false` for the remote-deletion cascade —
device A should only drop its *local* copies; the device that deleted the form owns
the remote cleanup.

### C4. `clearEntries` matches on `formTitle`, so it over-deletes across form versions and across accounts
`store/entriesStore.ts` (`clearEntries`) + `app/index.tsx` ("Delete all")

Entries are scoped by `formTitle` string, but forms are keyed by `formId@version`.
Two versions of a form with the same title, or two accounts that imported the same
form on one device, share a `formTitle`. "Delete all entries" (and the C3 cascade)
therefore deletes **another version's / another account's** entries too — even
though cross-account filtering hides them from the UI, the deletion still hits them
(locally and, by default, remotely).

**Fix direction:** scope `clearEntries` by `userId` (current session) and by a form
key that includes the version, not just the display title.

### C5. iOS build will crash on permission prompts and be rejected — no usage-description strings
`app.json` (`ios` block) / `app.config.js`

`ios` contains only `{ "supportsTablet": true }` — **no `infoPlist`** with
`NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`, or
`NSPhotoLibraryUsageDescription`, and neither `expo-location` nor
`expo-image-picker` is listed under `plugins` to inject them. The app calls
`Location.requestForegroundPermissionsAsync()` and uses the camera/photo picker, so
on iOS it **crashes at the prompt** and Apple rejects the binary. (Android: the
location permission isn't declared either; verify the generated manifest for the
bare `android/` project.)

**Fix direction:** add the `expo-location` and `expo-image-picker` config plugins
with permission strings (or an `ios.infoPlist` block) in `app.json`.

### C6. A partial photo download, then a local edit before retry, permanently loses the missing photo remotely
`services/syncEngine.ts` (`downloadRemoteEntry` partial-photo path) + `updateEntry`

When a pull drops one photo, the entry is stored `synced` with `remoteUpdatedAt`
set one tick behind so the next pull retries it (good). But if the user edits the
entry before that retry, `updateEntry` sets `syncStatus:'pending'`; the next pull
skips non-`synced` entries, so the missing photo is never re-fetched, and the
subsequent push uploads `entry.data` whose image array holds only the partial set —
**overwriting the complete remote copy with the incomplete one.**

**Fix direction:** track per-photo download completeness; don't allow an
incomplete image field to overwrite the remote array on push (merge by photo id),
or block editing until the photo set is whole.

---

## High

### H1. `signOut` has no try/catch — a thrown error strands `loading: true` forever
`store/authStore.ts:255-263`

Every other auth action got wrapped in try/catch during the last refactor; `signOut`
was missed. If `supabase.auth.signOut()` *throws* (e.g. offline) rather than
returning `{error}`, `set({ loading: false })` at line 262 is never reached, leaving
every `disabled={loading}` submit button across the app permanently disabled until
restart.

### H2. Sign-out doesn't clear per-user local data; next account sees it and is prompted to upload it
`store/authStore.ts` (`signOut`, `onAuthStateChange` SIGNED_IN) + `app/settings.tsx`

`signOut` clears only the Supabase session. The "Delete from device" path is opt-in
and only offered when local data exists; the bare `signOut()` paths leave
`entriesStore`/`pickerStore`/`formStore` intact. On a shared device, User B then
sees User A's cached entries/forms, and worse — on SIGNED_IN the claim dialog
computes unclaimed data from the *leftover* local stores and offers to **upload User
A's unclaimed data into User B's account.** (Related to C4; the cross-account UI
filter hides display but not the underlying data or these actions.)

### H3. Cancelling Google sign-in is treated as success and navigates the user "in"
`store/authStore.ts:198-200` + `app/(auth)/login.tsx`

On `result.type === 'cancel'`, `signInWithGoogle` returns `{ error: null }`. The
login screen treats a null error as success and calls `goBackHome()`, navigating the
still-anonymous user away from the login screen as if authenticated.

**Fix direction:** return a distinct sentinel (or `{ cancelled: true }`) for cancel
so the screen can stay put.

### H4. Conditional fields keyed on a boolean/number trigger never appear (silent data-collection loss)
`utils/formLogic.ts:13-24` + `components/formBuilder/FieldEditorRow.tsx`

The builder only ever writes `showIf.equals` as raw **string** text. `isFieldVisible`
compares with `expectedList.includes(actual)` using strict equality, so for a boolean
trigger (`'true' === true`) or number trigger (`'5' === 5`) the condition is always
false and the dependent field is **permanently hidden.** A user wiring "show if
[boolean] equals true" silently never collects that field.

**Fix direction:** coerce by the trigger field's type when evaluating (and/or store
typed values from the builder), e.g. compare against `String(actual)`.

### H5. `update-password` recovery guard can still false-redirect a slow recovery session
`app/(auth)/update-password.tsx`

The guard waits for `initialized` then starts an 800 ms timer before redirecting to
login if `session` is still null. A cold-start deep link whose `setSession` round-trip
resolves after ~800 ms gets bounced to login *before* the recovery session lands;
the late `setSession` then succeeds, leaving the user logged-in-but-stranded on the
login screen. The timer cleanup itself is correct — the window is just racing a
network call.

**Fix direction:** drive off the auth event (`PASSWORD_RECOVERY`/SIGNED_IN) rather
than a fixed timeout, or lengthen/abort the timer when a `setSession` is known to be
in flight.

---

## Medium

### M1. Builder regenerates a field's `id` from its label on every edit, dangling existing references
`app/form-builder.tsx:115-124` — `handleFieldChange` regenerates the id whenever it's
empty or starts with `field-`. A field auto-added as `field-1` keeps re-sluggin on
each label keystroke; any other field whose `showIf.fieldId` already points at the
old id now dangles (caught at save-time validation, but the wired condition is
silently lost mid-edit).

### M2. Builder lets you save `showIf.equals: ''` and leaves dangling refs after delete
`components/formBuilder/FieldEditorRow.tsx:256`, `app/form-builder.tsx` (delete) —
Enabling conditional visibility seeds `equals: ''`, which validates fine but only
matches an empty trigger value (effectively hidden). Deleting a field/section
doesn't scrub `showIf.fieldId`/`sectionId` from other fields; save-time validation
blocks export but the error surfaces on the (possibly collapsed) referencing field.

### M3. GPS capture can resolve with an arbitrarily inaccurate fix, with no UI signal
`utils/sensors.ts` — on the overall 20 s timeout (or settle-window expiry),
`captureBestFix` resolves with whatever `best` is, regardless of accuracy (could be a
200 m cold fix). It only rejects when *zero* samples arrived. The UI shows the
coordinate as "captured" with no indication accuracy was poor.
**Fix direction:** surface `accuracy` prominently and/or warn above a threshold.
(Subscription cleanup, settle-window, and timeout interplay were verified leak-free.)

### M4. `SectionsPanel` mints section ids with raw `Date.now()` instead of the dedupe helper
`components/formBuilder/SectionsPanel.tsx:29` — diverges from `generateSectionId`,
producing non-deterministic, unslugged ids that defeat the collision-safe helper
that exists for exactly this.

### M5. `RatingField` must default `max` when the builder leaves it blank
`utils/formBuilderSerializer.ts` omits `max` when cleared; `schemaLoader` allows a
missing `max`. Confirm `RatingField` defaults (e.g. to 5) — otherwise a rating field
renders zero stars.

### M6. Captured/picked images are stored at full resolution (storage & memory bloat)
`app/collect.tsx` / `components/fields/ImageField.tsx` — `quality:0.8` only re-encodes;
full-res originals are copied into app documents and later into the ZIP export. Many
12-MP photos → tens of MB and scroll jank on the list/detail grids (full-res `<Image>`
into small tiles). Consider downscaling on capture.

---

## Low

- **L1.** `DialogHost` unmounts the modal instantly on `hide()`, killing the
  fade-out; a queued dialog swaps in with no transition (cosmetic, from the queue
  refactor). No stuck-dialog bug — verified `hide()` always advances or closes.
- **L2.** `dialogStore.show()` when `!visible` resets `queue: []`, which would
  discard an already-queued dialog in a rare re-entry; defensive gap only.
- **L3.** Deep-linking `/map/<id>` (or `/entry/<id>`) to an entry filtered out by the
  cross-account filter falls back to a `0,0` map region. Add a "not found / not
  yours" state.

---

## Investigated & dismissed (false positives)

- **Date picker "completely broken" (`onValueChange`)** — *not a bug.* In
  `@react-native-community/datetimepicker@9.1.0`, `onValueChange` is the current,
  non-deprecated prop; `onChange` is the deprecated one. `DateField.tsx` is correct.
- **Dev-mode flag "leaks into production"** — *effectively not a bug.* The persisted
  `enabled` flag's only consumer, `debugLog`, is gated `__DEV__ && isDevModeEnabled()`,
  and the toggle UI is wrapped in `__DEV__`. A persisted `true` has no behavioral
  effect in a release build.

## Verified sound (recent fixes confirmed correct)
`inFlightEntryIds` finally-cleanup; `queuedRerun` coalescing; `pullRemoteForms`
re-push-before-delete `safeKeys`; strict-`<` conflict comparison; `Promise.allSettled`
photo downloads; auth actions' try/catch + loading reset (except `signOut`, H1);
deep-link parse try/catch (no token logging); `mapHelpers` antimeridian math;
`timeUtils` formatting; `edit-entry` conflict guard (keyed on `remoteUpdatedAt`,
null-at-mount short-circuit); `SelectField` "Other" discard-confirm; cross-account
read filtering in index/entries/export/map; `.env` never committed, gitignored, anon
key only, no secrets in source, no eval.

---

## Suggested fix priority
1. **C1, C2, C6** — sync concurrency/data-loss (version-token guard in `markSynced`,
   in-flight delete tombstone, photo-merge on push).
2. **C3, C4** — `deleteRemote:false` on the form-delete cascade; scope `clearEntries`
   by `userId` + versioned form key.
3. **C5** — add iOS permission strings before any iOS build.
4. **H1–H4** — `signOut` try/catch; clear per-user local data on sign-out;
   distinguish Google cancel; coerce `showIf` by trigger type.
5. Remainder (H5, M1–M6, L1–L3) as time allows.
