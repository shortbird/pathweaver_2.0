/**
 * addKidStore - Open the AddKidSheet from anywhere in the parent app (the
 * header kebab menu, etc.) without duplicating sheet mounts. The sheet is
 * mounted once by ParentStartSomethingFab in the (tabs) parent layout, mirroring
 * inviteObserverStore.
 */

import { create } from 'zustand';

interface AddKidState {
  visible: boolean;
  open: () => void;
  close: () => void;
}

export const useAddKidStore = create<AddKidState>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));
