# TODO app

- [x] Edit existing entries — added an Edit button on the entry detail screen. Text/number/textarea/select/boolean/rating/date fields are editable; photos and GPS are shown read-only (not editable yet, to avoid risking the data captured at collection time). Edits re-upsert on `(user_id, local_id)`, so they update the existing remote row — last-write-wins if edited from two devices, no real conflict merge (acceptable since edits are rare/typo-fix scale).
- [ ] Make photos and GPS editable on the edit-entry screen (currently read-only — see `app/edit-entry/[id].tsx`).
- [x] Sync custom forms (Supabase) — imported/custom forms now push to the `forms` table on import and pull down on sync (`store/pickerStore.ts`, `services/syncEngine.ts`). Scope: only `customForms` syncs; `hiddenPresetIds`/`activePresetId` stay device-local on purpose. No remote delete on form removal, and no claim-on-signin for forms imported while signed out (lower priority than entries since forms change rarely) — would need to revisit if that turns out to matter in practice.
- [ ] Map view — GPS is already captured per entry; a simple map screen pinning all entries would be a high-leverage addition for a "field data collection" app.
- [ ] GPS component have the option street that automatically takes the street name and number by a gps button or location picker.
- [ ] Custom SMTP provider for Supabase auth emails — the built-in email service has a strict rate limit (fine for production-scale, but easy to hit during testing); add Resend/SendGrid/etc. before relying on email verification at scale.

# TODO web

- [ ] Add a web version of the app, for browsing and managing data. This would allow users to access their data from a desktop browser and provide a more convenient interface for data management and form creation.
