import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeAsyncStorage } from './entriesStore';

// Split out of store/syncStore.ts so services/syncEngine.ts doesn't have to
// import that store (which itself imports requestSync from syncEngine.ts) —
// that would be a require cycle. This store has no dependency on syncEngine.ts
// at all, so the two can both depend on it without depending on each other.
//
// Per-user cursors syncEngine.ts's pullRemoteEntries uses to fetch only rows
// changed since the last successful pull instead of the whole table every
// pass. Persisted so a cold app start doesn't lose the benefit. Keyed by
// userId (not global) so switching accounts on one device can't use one
// user's cursor against another's data.
type SyncCursorState = {
  lastSyncedAt: Record<string, number>;
  lastReconciledAt: Record<string, number>;
  setLastSyncedAt: (userId: string, ts: number) => void;
  setLastReconciledAt: (userId: string, ts: number) => void;
};

export const useSyncCursorStore = create<SyncCursorState>()(
  persist(
    (set) => ({
      lastSyncedAt: {},
      lastReconciledAt: {},
      setLastSyncedAt: (userId, ts) =>
        set((s) => ({ lastSyncedAt: { ...s.lastSyncedAt, [userId]: ts } })),
      setLastReconciledAt: (userId, ts) =>
        set((s) => ({ lastReconciledAt: { ...s.lastReconciledAt, [userId]: ts } })),
    }),
    {
      name: 'sync-storage',
      storage: createJSONStorage(() => safeAsyncStorage),
    }
  )
);
