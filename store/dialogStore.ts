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
  current: DialogOptions | null;
  queue: DialogOptions[];
  show: (options: DialogOptions) => void;
  hide: () => void;
};

export const useDialogStore = create<DialogState>()((set, get) => ({
  visible: false,
  current: null,
  queue: [],
  show: (options) => {
    const { visible, queue } = get();
    if (!visible) {
      // Nothing showing right now — display this one immediately.
      set({ visible: true, current: options, queue: [] });
    } else {
      // Something's already up — queue this one for after.
      set({ queue: [...queue, options] });
    }
  },
  hide: () => {
    const { queue } = get();
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      set({ visible: true, current: next, queue: rest });
    } else {
      set({ visible: false, current: null });
    }
  },
}));

// Imperative entry point — mirrors Alert.alert's ergonomics (callable from
// anywhere, not just inside a component) so existing call sites migrate
// with minimal rewriting: `text` -> `label`, otherwise the same shape.
export function showDialog(options: DialogOptions) {
  useDialogStore.getState().show(options);
}
