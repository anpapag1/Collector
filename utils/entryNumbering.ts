import { Entry } from '../types';

// Derives a stable, collision-free display number for entries purely from
// chronological position (oldest = 1, ascending). Computed fresh from
// whatever entries currently exist locally — never stored, never synced —
// so numbering stays consistent regardless of how many devices' data has
// been merged in.
export function getEntryDisplayNumbers(entries: Entry[]): Map<string, number> {
  const sorted = [...entries].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    // Same millisecond: fall back to a deterministic, device-independent
    // tiebreaker (the UUID id) instead of relying on array insertion order,
    // which can differ between devices that merged entries in a different
    // sequence.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const numbers = new Map<string, number>();
  sorted.forEach((entry, index) => {
    numbers.set(entry.id, index + 1);
  });
  return numbers;
}
