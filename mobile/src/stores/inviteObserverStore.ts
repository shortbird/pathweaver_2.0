/**
 * inviteObserverStore - Open the InviteObserverSheet from anywhere in the
 * parent app (Family tab observers section, FAB sheet, etc.) without
 * duplicating sheet mounts. The sheet is mounted once by
 * ParentStartSomethingFab in the (tabs) parent layout.
 */

import { create } from 'zustand';

interface InviteObserverState {
  visible: boolean;
  open: () => void;
  close: () => void;
}

export const useInviteObserverStore = create<InviteObserverState>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));
