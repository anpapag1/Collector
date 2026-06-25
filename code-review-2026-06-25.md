# Collector — Extensive Code Review (2026-06-25, post-fix)

This replaces the original review from earlier today. All 19 issues identified in
that review have been fixed and independently re-verified by a second review
pass. `npx tsc --noEmit` and the Jest suite (`npx jest`) both pass clean.

## What changed since the original review

### Critical (5/5 fixed)
1. **Cross-account data exposure** — `app/index.tsx`, `app/entries.tsx`,
   `app/export.tsx`, `app/map/[id].tsx` now filter entries/custom forms by the
   signed-in user (`userId === currentUserId || userId == null` when signed in,
   `userId == null` when signed out) before any other filtering. Verified: every
   read site (counts, list data, active-form lookup, export) uses the filtered
   list consistently.
2. **Form-deletion race in `pullRemoteForms`** — re-push upserts for
   locally-added forms are now awaited (`Promise.allSettled`) before computing
   what's safe to delete; the deletion candidate set explicitly excludes forms
   still being (re)pushed this pass, regardless of whether that push succeeds or
   fails. Verified: no remaining window where a just-added form gets treated as
   "deleted on another device."
3. **Edit-screen clobbering a concurrent remote edit** — `app/edit-entry/[id].tsx`
   now snapshots `remoteUpdatedAt` at mount and warns (with an overwrite/discard
   choice) if it changes before save. **Found in re-verification and fixed
   today:** the original fix fell back to `updatedAt` when `remoteUpdatedAt` was
   null, which caused a false-positive warning on the *first* sync of any
   offline-created entry (not a real conflict). Fixed to only arm the check when
   `remoteUpdatedAt` was already non-null at mount — i.e. only for entries that
   had already synced once before, which is the only case `refreshEntryFromRemote`
   can ever apply to.
4. **Conflict pre-check silently bypassed on error** — `syncOneEntry` now throws
   on a pre-check query error instead of proceeding with the upload; the entry
   falls through to `markSyncError` and is retried next pass. Verified against
   the `due` filter.
5. **Unawaited, retry-less remote delete ("ghost resurrection")** —
   `entriesStore.ts` now tracks `pendingDeletions` (persisted, so it survives an
   app restart) and `syncEngine.ts`'s `runSync` retries any pending deletion
   before `pullRemoteEntries` runs, so a failed delete can no longer be
   resurrected by the next pull. Verified: no double-counting between
   `deleteEntry`/`clearEntries`, correct ordering, correctly persisted.

### High (5/5 fixed)
6. **Dev mode reachable in production** — the Developer Mode toggle and
   "seed 100 test entries" action in `app/settings.tsx` are now wrapped in
   `__DEV__`, the real React Native build flag; `debugLog.ts` double-gates on it
   too. Verified no other path exposes it.
7. **Deep-link parsing could throw unhandled** — `authStore.ts`'s `applyUrl` now
   has a cheap `access_token=` pre-filter and a try/catch around the actual URL
   parsing, plus a `.catch` on the cold-start `Linking.getInitialURL()` chain.
   Verified the normal valid-recovery-link path still works.
8. **Dialog store clobbering** — `dialogStore.ts` now queues dialogs (`current`
   + `queue`) instead of holding a single slot; `DialogHost.tsx` updated to
   match. Verified a second `showDialog()` call while one is visible queues
   correctly and is shown automatically once the first is dismissed.
9. **`update-password` reachable with no valid session, no way back** — added a
   session guard and a close/back button. **Found in re-verification and fixed
   today:** the guard checked only `session`, not `initialized`, so a user
   reaching this screen while auth was still finishing its initial load (or via
   Expo Router's own deep-link routing slightly ahead of the app's `Linking`
   listener applying the recovery session) could be bounced to login before a
   legitimate session landed. Fixed to gate on `initialized`, plus an 800ms
   grace window before redirecting (re-checking the live store state, not the
   stale render-time value) to absorb that race.
10. **Auth actions could leave `loading` stuck `true` forever** — `signIn`,
    `signUp`, `resetPassword`, `updatePassword` now wrap their bodies in
    try/catch matching the pattern already used by `signInWithGoogle`, resetting
    `loading` in every path.

### Medium (5/5 fixed)
11. Stale-`syncing` recovery racing a genuinely-still-running sync — fixed via a
    module-level `inFlightEntryIds` set in `syncEngine.ts`, added before and
    removed (in a `finally`) after each `syncOneEntry` call.
12. One flaky photo discarding already-downloaded photos on retry — fixed by
    switching `Promise.all` to `Promise.allSettled` in `downloadRemoteEntry`.
    **Found in re-verification and fixed today:** the original fix preserved
    successfully-downloaded photos but still recorded the server's real
    `remoteUpdatedAt`, which made the entry look fully up to date forever (the
    staleness check `local.remoteUpdatedAt < remoteUpdatedAt` would never trip
    again), so a permanently-missing photo was never retried. Fixed by storing
    `remoteUpdatedAt` one tick behind the server's value whenever a partial
    failure occurred, keeping the entry "stale" so the next pull retries it.
13. Silent GPS failure — `app/collect.tsx` now surfaces a specific toast
    ("Location permission denied" / "GPS capture timed out") matching the actual
    error strings thrown by `utils/sensors.ts`, with a generic fallback
    otherwise.
14. Double-tap pushing `/collect` twice — guarded with a ref that's released on
    a timeout regardless of navigation outcome (no stuck-lock risk).
15. "Other" free text silently discarded on option switch — now confirms via a
    dialog only when `otherText` is non-blank (trimmed), so normal option
    switching is unaffected.

### Low (4/4 fixed)
16. `mapRegion` antimeridian bug — fixed by shifting longitudes into 0–360 space
    before computing span/center when the naive span exceeds 180°. Verified with
    a worked example (179.9°/-179.9° now produces a ~0.29° delta, not ~360°);
    confirmed the normal non-wrapping case is unaffected.
17. `photoTotal` recomputed every render in `export.tsx` — now memoized.
18. Map screen permission effect setting state after unmount — now guarded with
    a mounted flag cleared on unmount.
19. Display-number ties not deterministic across devices — `entryNumbering.ts`
    now uses `id` as a stable tiebreaker when `createdAt` matches exactly.

## Re-verification methodology

Three independent review passes (one per area: data/sync layer, UI/cross-account,
auth/dialog/dev-mode) re-read the *current* state of every changed file against
the original bug descriptions, rather than trusting the fixing agents' self-reports.
This caught three issues where the first-pass fix was directionally correct but
incomplete (items 3, 9, and 12 above) — all three are now corrected and confirmed.

## Outstanding items

None. All issues from the original review are fixed and re-verified. Two
genuinely inconsequential cosmetic edge cases were noted and intentionally left
as-is (not worth the churn):
- `mapHelpers.ts`'s antimeridian fix centers an exact 180.0° boundary case at
  `180.0` instead of `-180.0` — geographically identical, no functional effect.
- `entriesStore.ts`'s `clearEntries` fire-and-forget pending-deletion calls
  aren't race-guarded against a second overlapping `clearEntries` call the way
  `syncEngine.ts`'s sync loop is — low risk in practice since "delete" UI
  actions are single-fire by construction, not a sync-loop-style repeated
  trigger.
