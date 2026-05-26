/**
 * Acting-As Store - Zustand store for parent "act as dependent" and admin masquerade.
 *
 * When active, swaps the auth token so all API calls execute as the target user.
 * A banner is shown across the app with a "Switch Back" button.
 */

import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { api } from '../services/api';
import { tokenStore } from '../services/tokenStore';

// authStore imports actingAsStore for logout, so we can't do a static import
// here without creating a circular dependency that leaves the store uninitialized.
// Use a lazy require at call sites instead.
function refetchAuthUser() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('./authStore').useAuthStore.getState().loadUser();
}

/**
 * Force a full page reload to flush all cached hook/store data.
 * On web, window.location.href clears all React state.
 * On mobile, router.replace + a flag that triggers re-fetch on mount.
 */
function forceReload(path: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.href = path;
  } else {
    router.replace(path as any);
  }
}

export type ActingAsMode = 'dependent' | 'masquerade';

export interface ActingAsTarget {
  id: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  role?: string;
}

interface ActingAsState {
  /** The user being impersonated */
  target: ActingAsTarget | null;
  /** Whether we're currently acting as someone */
  isActive: boolean;
  /** 'dependent' for parent->child, 'masquerade' for admin->user */
  mode: ActingAsMode | null;
  /** Loading state for switch operations */
  switching: boolean;

  /** Parent starts acting as a dependent child */
  startActingAs: (dependent: ActingAsTarget) => Promise<void>;
  /** Stop acting as dependent, restore parent tokens */
  stopActingAs: () => Promise<void>;
  /** Admin masquerade as any user */
  startMasquerade: (userId: string) => Promise<void>;
  /** Stop admin masquerade */
  stopMasquerade: () => Promise<void>;
  /** Restore state from storage on app init */
  restore: () => void | Promise<void>;
  /** Clear everything (for logout) */
  clear: () => void;
}

const STORAGE_KEY = 'optio_acting_as';
const PARENT_ACCESS_KEY = 'optio_parent_access';
const PARENT_REFRESH_KEY = 'optio_parent_refresh';

// Web uses sessionStorage; native uses SecureStore.
// The state we persist is small (target + mode) and non-secret on its own —
// SecureStore is just a convenient already-installed key-value store.
function saveToStorage(key: string, value: string) {
  if (Platform.OS === 'web') {
    try { sessionStorage.setItem(key, value); } catch { /* ignore */ }
  } else {
    SecureStore.setItemAsync(key, value).catch(() => { /* ignore */ });
  }
}

function getFromStorage(key: string): string | null {
  if (Platform.OS === 'web') {
    try { return sessionStorage.getItem(key); } catch { return null; }
  }
  return null;
}

async function getFromStorageAsync(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return getFromStorage(key);
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}

function removeFromStorage(key: string) {
  if (Platform.OS === 'web') {
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  } else {
    SecureStore.deleteItemAsync(key).catch(() => { /* ignore */ });
  }
}

export const useActingAsStore = create<ActingAsState>((set, get) => ({
  target: null,
  isActive: false,
  mode: null,
  switching: false,

  startActingAs: async (dependent) => {
    set({ switching: true });
    try {
      // Save parent tokens before switching
      const parentAccess = tokenStore.getAccessToken();
      const parentRefresh = tokenStore.getRefreshToken();
      if (parentAccess) saveToStorage(PARENT_ACCESS_KEY, parentAccess);
      if (parentRefresh) saveToStorage(PARENT_REFRESH_KEY, parentRefresh);

      // Get acting-as token from backend
      const { data } = await api.post(`/api/dependents/${dependent.id}/act-as`, {});
      const actingAsToken = data.acting_as_token;

      // Swap to dependent token
      await tokenStore.setTokens(actingAsToken, parentRefresh || '');

      // Persist state
      saveToStorage(STORAGE_KEY, JSON.stringify({
        target: dependent,
        mode: 'dependent',
      }));

      set({
        target: dependent,
        isActive: true,
        mode: 'dependent',
        switching: false,
      });

      if (Platform.OS !== 'web') {
        await refetchAuthUser();
      }

      // Full page reload to flush all cached data from parent session
      forceReload('/dashboard');
    } catch (err) {
      set({ switching: false });
      throw err;
    }
  },

  stopActingAs: async () => {
    set({ switching: true });
    try {
      // Ask backend for fresh parent tokens
      const { data } = await api.post('/api/dependents/stop-acting-as', {});
      if (data.success) {
        await tokenStore.setTokens(data.access_token, data.refresh_token);
      } else {
        // Fallback: restore from sessionStorage
        const parentAccess = getFromStorage(PARENT_ACCESS_KEY);
        const parentRefresh = getFromStorage(PARENT_REFRESH_KEY);
        if (parentAccess && parentRefresh) {
          await tokenStore.setTokens(parentAccess, parentRefresh);
        }
      }
    } catch {
      // Fallback: restore from sessionStorage
      const parentAccess = getFromStorage(PARENT_ACCESS_KEY);
      const parentRefresh = getFromStorage(PARENT_REFRESH_KEY);
      if (parentAccess && parentRefresh) {
        await tokenStore.setTokens(parentAccess, parentRefresh);
      }
    }

    // Clean up
    removeFromStorage(STORAGE_KEY);
    removeFromStorage(PARENT_ACCESS_KEY);
    removeFromStorage(PARENT_REFRESH_KEY);

    set({ target: null, isActive: false, mode: null, switching: false });

    if (Platform.OS !== 'web') {
      await refetchAuthUser();
    }

    // Full page reload to flush cached dependent data
    forceReload('/family');
  },

  startMasquerade: async (userId) => {
    set({ switching: true });
    try {
      // Save admin tokens
      const adminAccess = tokenStore.getAccessToken();
      const adminRefresh = tokenStore.getRefreshToken();
      if (adminAccess) saveToStorage(PARENT_ACCESS_KEY, adminAccess);
      if (adminRefresh) saveToStorage(PARENT_REFRESH_KEY, adminRefresh);

      const { data } = await api.post(`/api/admin/masquerade/${userId}`, {});
      const { masquerade_token, target_user } = data;

      await tokenStore.setTokens(masquerade_token, adminRefresh || '');

      const target: ActingAsTarget = {
        id: target_user.id,
        display_name: target_user.display_name,
        first_name: target_user.first_name,
        last_name: target_user.last_name,
        avatar_url: target_user.avatar_url,
        role: target_user.role,
      };

      saveToStorage(STORAGE_KEY, JSON.stringify({ target, mode: 'masquerade' }));

      set({ target, isActive: true, mode: 'masquerade', switching: false });

      // Mobile: forceReload uses router.replace which doesn't re-fetch
      // authStore.user, so the profile page would keep showing the admin's
      // info. Pull the masqueraded user explicitly. Web reloads the page
      // and reruns loadUser on its own.
      if (Platform.OS !== 'web') {
        await refetchAuthUser();
      }

      // Full page reload to flush admin session cache
      const role = target_user.org_role && target_user.role === 'org_managed'
        ? target_user.org_role : target_user.role;
      const redirectPath = role === 'parent' ? '/family'
        : role === 'observer' ? '/feed'
        : '/dashboard';
      forceReload(redirectPath);
    } catch (err) {
      set({ switching: false });
      throw err;
    }
  },

  stopMasquerade: async () => {
    set({ switching: true });
    try {
      const { data } = await api.post('/api/admin/masquerade/exit', {});
      await tokenStore.setTokens(data.access_token, data.refresh_token);
    } catch {
      // Fallback
      const adminAccess = getFromStorage(PARENT_ACCESS_KEY);
      const adminRefresh = getFromStorage(PARENT_REFRESH_KEY);
      if (adminAccess && adminRefresh) {
        await tokenStore.setTokens(adminAccess, adminRefresh);
      }
    }

    removeFromStorage(STORAGE_KEY);
    removeFromStorage(PARENT_ACCESS_KEY);
    removeFromStorage(PARENT_REFRESH_KEY);

    set({ target: null, isActive: false, mode: null, switching: false });

    // Same reasoning as startMasquerade: mobile router.replace skips loadUser.
    if (Platform.OS !== 'web') {
      await refetchAuthUser();
    }

    // Full page reload to flush masquerade data
    forceReload('/admin');
  },

  restore: async () => {
    const stored = await getFromStorageAsync(STORAGE_KEY);
    if (stored) {
      try {
        const { target, mode } = JSON.parse(stored);
        if (target && mode) {
          set({ target, isActive: true, mode });
          return;
        }
      } catch {
        removeFromStorage(STORAGE_KEY);
      }
    }

    // Fallback: if there's no local state but the access token is a
    // masquerade token (e.g. after a Metro reload, app restart, or upgrade
    // path where we hadn't yet persisted state), ask the server.
    // Tokens may still be on disk only — pull them into memory first or the
    // interceptor sends the request unauthenticated and we silently bail.
    try {
      await tokenStore.restore();
      if (!tokenStore.getAccessToken()) return;
      const { data } = await api.get('/api/admin/masquerade/status');
      if (data?.is_masquerading && data.target_user?.id) {
        const target: ActingAsTarget = {
          id: data.target_user.id,
          display_name: data.target_user.display_name,
          avatar_url: data.target_user.avatar_url,
          role: data.target_user.role,
        };
        saveToStorage(STORAGE_KEY, JSON.stringify({ target, mode: 'masquerade' }));
        set({ target, isActive: true, mode: 'masquerade' });
      }
    } catch {
      /* unauthenticated or endpoint down — leave inactive */
    }
  },

  clear: () => {
    removeFromStorage(STORAGE_KEY);
    removeFromStorage(PARENT_ACCESS_KEY);
    removeFromStorage(PARENT_REFRESH_KEY);
    set({ target: null, isActive: false, mode: null, switching: false });
  },
}));
