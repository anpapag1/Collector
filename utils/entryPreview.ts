import { Entry } from '../types';

// Pulls the first meaningful text value out of an entry to use as a
// one-line preview — shared by components/EntryCard.tsx (mobile list rows)
// and the web dashboard's map sidebar list, so both surfaces summarize an
// entry the same way instead of each deriving their own heuristic.
export function previewTitleForEntry(entry: Pick<Entry, 'fields' | 'data'>): string | null {
  const { fields, data } = entry;
  if (fields) {
    for (const f of fields) {
      if ((f.type === 'text' || f.type === 'textarea') && data[f.id]) {
        const val = String(data[f.id]).trim();
        if (val) return val;
      }
    }
    return null;
  }
  // Legacy entries with no `fields` snapshot: scan data values.
  for (const v of Object.values(data)) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}
