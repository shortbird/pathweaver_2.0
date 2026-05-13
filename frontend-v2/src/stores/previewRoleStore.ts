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
    const stored = readStorage();
    if (stored) set({ previewRole: stored });
  },
}));
