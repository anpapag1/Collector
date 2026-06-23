# TODO

- [ ] Edit existing entries — right now entries are create-once/read-only; field teams often need to correct a typo after the fact. Note: the sync engine currently assumes entries are append-only (no conflict resolution) — adding edit support means revisiting `services/syncEngine.ts`'s upsert logic (last-write-wins or real merge).
- [ ] Map view — GPS is already captured per entry; a simple map screen pinning all entries would be a high-leverage addition for a "field data collection" app.
- [ ] GPS component have the option street that automatically takes the street name and number by a gps button or location picker.
- [x] CSV export option alongside ZIP/JSON, for people who just want to drop data into Excel/Sheets without unzipping.
- [x] Remote sync (Supabase) — entries/photos sync per-account, local-first with two-way background sync (push + pull), email/Google auth, per-entry and global sync status indicators.
- [ ] Custom SMTP provider for Supabase auth emails — the built-in email service has a strict rate limit (fine for production-scale, but easy to hit during testing); add Resend/SendGrid/etc. before relying on email verification at scale.
