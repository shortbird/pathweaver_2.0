/**
 * Preview Role Store - Superadmin-only UI shell preview.
 *
 * Lets a superadmin visually preview the app as a different role (parent / student /
 * observer) WITHOUT swapping tokens. All API calls still execute as the superadmin;
 * only the navigation shell, role-gated UI, and tab bar change.
 *
 * For real impersonation (seeing another user's actual data), use the masquerade
 * flow in actingAsStore.ts instead.
 */

import { create } from 'zustand';
import { Platform } from 'react-native';

export type PreviewRole = 'parent' | 'student' | 'observer';

interface PreviewRoleState {
  previewRole: PreviewRole | null;
  setPreviewRole: (role: PreviewRole | null) => void;
  /**
   * Hydrate the preview role on app entry: the stored choice, else none.
   *
   * Until 2026-09-15 a superadmin with no stored choice was dropped into the
   * Student preview. That hid their own family: in Student preview the
   * children list is skipped (useMyChildren), so the Family tab read "No
   * students linked" for an account with a child on it, and the account
   * menu's "Preview as Parent" was the only way out. A superadmin now opens
   * the app as themselves -- the parent shell when they have children, the
   * student shell otherwise (useIsParent) -- and previews only by choice.
   */
  restore: () => void;
}

const STORAGE_KEY = 'optio_preview_role';

function readStorage(): PreviewRole | null {
  if (Platform.OS !== 'web') return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'parent' || v === 'student' || v === 'observer') return v;
  } catch {
    // ignore
  }
  return null;
}

function writeStorage(value: PreviewRole | null) {
  if (Platform.OS !== 'web') return;
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const usePreviewRoleStore = create<PreviewRoleState>((set) => ({
  previewRole: null,
  setPreviewRole: (role) => {
    writeStorage(role);
    set({ previewRole: role });
  },
  restore: () => {
    set({ previewRole: readStorage() });
  },
}));
