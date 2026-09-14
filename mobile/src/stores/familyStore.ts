/**
 * familyStore - the parent's family, in one place.
 *
 * Two things that used to live apart:
 *
 *  - the Add-a-kid sheet's open/close state and the `version` counter that
 *    tells children lists to refetch (this was addKidStore; the sheet is
 *    mounted once by ParentStartSomethingFab in the (tabs) parent layout,
 *    mirroring inviteObserverStore);
 *  - WHICH CHILD the parent is working for -- the family scope.
 *
 * Family scope (2026-09-15): a parent picks a child on the Family tab and the
 * child's own screens -- dashboard, quests, quest detail, journal, profile --
 * render pointed at that child. Every read adds `student_id`, every write
 * carries it, and the backend's @student_scope verifies the guardian and
 * swaps whose rows the route touches. The parent stays signed in as
 * themselves. Until now three screens each kept their own selection (the
 * Family tab, the Feed's kid filter, the capture sheet), and the only carrier
 * between screens was a route param; the selection is here now, once, and
 * survives a relaunch.
 *
 * The children list itself still comes from hooks/useParent.useMyChildren,
 * which knows the role rules and the hold epochs; it calls `reconcile` after
 * every fetch so the selection is dropped when the child is no longer in the
 * family, and defaults to the first child when none was ever picked -- on
 * mobile the Family tab always shows SOMEONE, so a default is the right call
 * where on the web it is not.
 */

import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Child } from '../types/family';

const STORAGE_PREFIX = 'optio_family_scope:';

// Web keeps the child across tabs and relaunches (localStorage, not the
// session-scoped store actingAsStore uses -- a new tab should open on the
// same child). Native uses SecureStore, the already-installed key-value store.
function saveToStorage(key: string, value: string) {
  if (Platform.OS === 'web') {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  } else {
    SecureStore.setItemAsync(key, value).catch(() => { /* ignore */ });
  }
}

async function getFromStorageAsync(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}

function removeFromStorage(key: string) {
  if (Platform.OS === 'web') {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  } else {
    SecureStore.deleteItemAsync(key).catch(() => { /* ignore */ });
  }
}

interface FamilyState {
  // ── Add a kid ──
  visible: boolean;
  /** Bumped when a child is created or edited (e.g. avatar) so children lists
   *  (useMyChildren) refetch and pick up the change immediately. */
  version: number;
  open: () => void;
  close: () => void;
  refreshChildren: () => void;

  // ── Family scope ──
  /** The parent this selection belongs to; a different account gets its own. */
  parentId: string | null;
  /** The children as last fetched by useMyChildren. */
  children: Child[];
  selectedChildId: string | null;
  /** Pick a child by hand. Remembered per parent. */
  setSelected: (childId: string | null) => void;
  /** Leave scope (logout, account switch). Forgets nothing on disk. */
  clear: () => void;
  /** Called by useMyChildren after every fetch: keep the selection if the
   *  child is still there, restore the remembered one, else pick the first. */
  reconcile: (parentId: string | null, children: Child[]) => Promise<void>;
}

export const useFamilyStore = create<FamilyState>((set, get) => ({
  visible: false,
  version: 0,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
  refreshChildren: () => set((s) => ({ version: s.version + 1 })),

  parentId: null,
  children: [],
  selectedChildId: null,

  setSelected: (childId) => {
    const { parentId } = get();
    set({ selectedChildId: childId });
    if (!parentId) return;
    if (childId) saveToStorage(STORAGE_PREFIX + parentId, childId);
    else removeFromStorage(STORAGE_PREFIX + parentId);
  },

  clear: () => set({ parentId: null, children: [], selectedChildId: null }),

  reconcile: async (parentId, children) => {
    const current = get();
    const switchedAccount = current.parentId !== parentId;
    let selected = switchedAccount ? null : current.selectedChildId;
    if (!selected && parentId) {
      selected = await getFromStorageAsync(STORAGE_PREFIX + parentId);
    }
    if (selected && !children.some((c) => c.id === selected)) selected = null;
    if (!selected && children.length > 0) selected = children[0].id;
    set({ parentId, children, selectedChildId: selected });
  },
}));

/** The child the parent is working for, or null. */
export const useSelectedChild = (): Child | null =>
  useFamilyStore((s) => s.children.find((c) => c.id === s.selectedChildId) || null);

/**
 * Backwards-compatible name for the Add-a-kid half of this store. The seven
 * places that open the sheet or bump `version` keep working unchanged.
 */
export const useAddKidStore = useFamilyStore;
