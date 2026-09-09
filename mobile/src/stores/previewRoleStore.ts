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
   * Hydrate the preview role on app entry. Pass the user's REAL role so a
   * superadmin with no stored preference defaults into the Student shell
   * (the role they spend the most time previewing). Non-superadmins are
   * unaffected — every consumer ignores previewRole unless role==='superadmin'.
   */
  restore: (realRole?: string | null) => void;
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
  restore: (realRole) => {
    const stored = readStorage();
    if (stored) {
      set({ previewRole: stored });
      return;
    }
    // Superadmins land in the Student shell by default. Not persisted — storage
    // holds only explicit choices, so "Exit preview" / picking another role
    // still wins for the session and across reloads on web.
    if (realRole === 'superadmin') {
      set({ previewRole: 'student' });
    }
  },
}));
