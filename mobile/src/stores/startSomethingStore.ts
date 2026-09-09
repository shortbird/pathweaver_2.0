/**
 * startSomethingStore - Tiny shared store so any UI affordance (the global
 * FAB in (tabs)/_layout, the "Start something new" tile on Home, etc.) can
 * trigger the StartSomethingSheet without duplicating the sheet mounts.
 *
 * StartSomethingFab is the canonical owner of the sheet — it subscribes to
 * `visible` and renders the chained sheets. Other components just call
 * `useStartSomethingStore.getState().open()` to trigger it.
 */

import { create } from 'zustand';

interface StartSomethingState {
  visible: boolean;
  open: () => void;
  close: () => void;
  /** CreateQuestSheet visibility — opened directly from the Quests page's
   *  "Create your own quest" button (no longer chained off the menu). */
  createQuestVisible: boolean;
  openCreateQuest: () => void;
  closeCreateQuest: () => void;
}

export const useStartSomethingStore = create<StartSomethingState>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
  createQuestVisible: false,
  openCreateQuest: () => set({ createQuestVisible: true }),
  closeCreateQuest: () => set({ createQuestVisible: false }),
}));
