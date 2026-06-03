/**
 * addKidStore - Open the AddKidSheet from anywhere in the parent app (the
 * header kebab menu, etc.) without duplicating sheet mounts. The sheet is
 * mounted once by ParentStartSomethingFab in the (tabs) parent layout, mirroring
 * inviteObserverStore.
 */

import { create } from 'zustand';

interface AddKidState {
  visible: boolean;
  /** Bumped when a child is created or edited (e.g. avatar) so children lists
   *  (useMyChildren) refetch and pick up the change immediately. */
  version: number;
  open: () => void;
  close: () => void;
  refreshChildren: () => void;
}

export const useAddKidStore = create<AddKidState>((set) => ({
  visible: false,
  version: 0,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
  refreshChildren: () => set((s) => ({ version: s.version + 1 })),
}));
