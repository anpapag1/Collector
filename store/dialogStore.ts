import { create } from 'zustand';

export type DialogAction = {
  label: string;
  style?: 'default' | 'destructive' | 'cancel';
  onPress?: () => void;
};

export type DialogOptions = {
  title: string;
  message?: string;
  actions: DialogAction[];
};

type DialogState = {
  visible: boolean;
  options: DialogOptions | null;
  show: (options: DialogOptions) => void;
  hide: () => void;
};

export const useDialogStore = create<DialogState>()((set) => ({
  visible: false,
  options: null,
  show: (options) => set({ visible: true, options }),
  hide: () => set({ visible: false }),
}));

// Imperative entry point — mirrors Alert.alert's ergonomics (callable from
// anywhere, not just inside a component) so existing call sites migrate
// with minimal rewriting: `text` -> `label`, otherwise the same shape.
export function showDialog(options: DialogOptions) {
  useDialogStore.getState().show(options);
}
