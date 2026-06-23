import { useEntriesStore } from '../store/entriesStore';
import { requestSync } from './syncEngine';

// Claims entries collected before the user ever signed in (userId == null) by
// stamping them with the now-known userId, one-shot per device. Already-claimed
// entries (collected under a different account on this device) are left alone.
export function claimLegacyEntriesForUser(userId: string) {
  const { entries } = useEntriesStore.getState();
  const unclaimed = entries.filter((e) => !e.userId);
  if (unclaimed.length === 0) return;

  useEntriesStore.setState({
    entries: entries.map((e) =>
      e.userId
        ? e
        : { ...e, userId, syncStatus: 'pending', updatedAt: Date.now() }
    ),
  });
  requestSync();
}
