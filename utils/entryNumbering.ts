import { Entry } from '../types';

// Derives a stable, collision-free display number for entries purely from
// chronological position (oldest = 1, ascending). Computed fresh from
// whatever entries currently exist locally — never stored, never synced —
// so numbering stays consistent regardless of how many devices' data has
// been merged in.
export function getEntryDisplayNumbers(entries: Entry[]): Map<string, number> {
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const numbers = new Map<string, number>();
  sorted.forEach((entry, index) => {
    numbers.set(entry.id, index + 1);
  });
  return numbers;
}
