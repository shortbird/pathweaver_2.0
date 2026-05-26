/**
 * Demo Mode Store - Superadmin-only chrome hiding for clean screenshots.
 *
 * When ON, the app hides chrome that real users never see — admin/superadmin
 * tools, the broadcast button, the role-preview switcher, debug labels — so
 * App Store / Play Store screenshots reflect the actual user experience.
 *
 * The toggle is gated on `user.role === 'superadmin'` at every consumer site.
 * A non-superadmin can never enable this (the menu item is hidden) and even
 * if the flag were forced on for one, the gated chrome is already hidden for
 * them by role checks. The flag adds chrome-hiding on top of role checks; it
 * does NOT grant any extra access.
 *
 * Persistence matches previewRoleStore: localStorage on web (so screenshots
 * across a multi-tab session keep the flag), in-memory on native (the next
 * app launch resets). For native screenshot sessions, toggle once at start.
 */

import { create } from 'zustand';
import { Platform } from 'react-native';

interface DemoModeState {
  demoMode: boolean;
  setDemoMode: (on: boolean) => void;
  restore: () => void;
}

const STORAGE_KEY = 'optio_demo_mode';

function readStorage(): boolean {
  if (Platform.OS !== 'web') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStorage(value: boolean) {
  if (Platform.OS !== 'web') return;
  try {
    if (value) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const useDemoModeStore = create<DemoModeState>((set) => ({
  demoMode: false,
  setDemoMode: (on) => {
    writeStorage(on);
    set({ demoMode: on });
  },
  restore: () => {
    set({ demoMode: readStorage() });
  },
}));
