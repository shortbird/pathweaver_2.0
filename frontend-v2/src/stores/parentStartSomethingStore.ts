/**
 * parentStartSomethingStore - Tiny shared store mirroring the student
 * startSomethingStore. Lets any UI affordance (the global parent FAB, a
 * dashboard CTA, etc.) trigger the parent action sheet without duplicating
 * the sheet mounts.
 *
 * ParentStartSomethingFab is the canonical owner of the sheets — it
 * subscribes to `visible` and renders the chained action sheets.
 */

import { create } from 'zustand';

interface ParentStartSomethingState {
  visible: boolean;
  open: () => void;
  close: () => void;
}

export const useParentStartSomethingStore = create<ParentStartSomethingState>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));
