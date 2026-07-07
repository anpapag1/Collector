import { create } from 'zustand';
import { FormConfig } from '../types';

// Transient (non-persisted) handoff for "Copy & edit": the web dashboard's
// forms grid already has the full FormConfig in hand for ANY visible form
// (its own, or — in admin mode — another user's, fetched via
// services/adminService.ts and never present in the local pickerStore). A
// query param can't reasonably carry a whole form schema, so this store
// carries it across the navigation to /form-builder instead. Cleared as soon
// as form-builder.tsx reads it.
type FormDraftState = {
  duplicateSeed: FormConfig | null;
  setDuplicateSeed: (config: FormConfig) => void;
  takeDuplicateSeed: () => FormConfig | null;
};

export const useFormDraftStore = create<FormDraftState>((set, get) => ({
  duplicateSeed: null,
  setDuplicateSeed: (config) => set({ duplicateSeed: config }),
  takeDuplicateSeed: () => {
    const seed = get().duplicateSeed;
    set({ duplicateSeed: null });
    return seed;
  },
}));
