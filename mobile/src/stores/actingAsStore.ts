/**
 * Acting-As Store - Zustand store for admin masquerade.
 *
 * When active, swaps the auth token so all API calls execute as the target
 * user; the header shows an "as <name>" badge and the avatar menu carries the
 * exit. Until 2026-09-15 this store also held a parent's "act as dependent"
 * mode (a swapped token for the child); family scope (stores/familyStore)
 * replaced it, the buttons that started it were gone, and the half of this
 * store that served it went with the backend routes (REGISTER GAP-3).
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

export type ActingAsMode = 'masquerade';

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
  /** 'masquerade' while an admin is another user; null otherwise */
  mode: ActingAsMode | null;
  /** Loading state for switch operations */
  switching: boolean;

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
// The admin's own tokens while masquerading. The key names predate the
// masquerade-only store (they held a parent's tokens too); a rename would
// orphan what installed builds saved.
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

  startMasquerade: async (userId) => {
    set({ switching: true });
    try {
      // Save admin tokens
      const adminAccess = tokenStore.getAccessToken();
      const adminRefresh = tokenStore.getRefreshToken();
      if (adminAccess) saveToStorage(PARENT_ACCESS_KEY, adminAccess);
      if (adminRefresh) saveToStorage(PARENT_REFRESH_KEY, adminRefresh);

      const { data } = await api.post(`/api/admin/masquerade/${userId}`, {});
      const { masquerade_token, masquerade_refresh_token, target_user } = data;

      // Use the masquerade refresh token (not the admin's) so a token refresh
      // re-mints a masquerade token instead of silently reverting to the admin.
      // Fall back to adminRefresh only if the backend didn't supply one.
      await tokenStore.setTokens(masquerade_token, masquerade_refresh_token || adminRefresh || '');

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
    let storedState: { target?: ActingAsTarget; mode?: ActingAsMode } | null = null;
    if (stored) {
      try {
        storedState = JSON.parse(stored);
      } catch {
        removeFromStorage(STORAGE_KEY);
      }
    }

    // A 'dependent' entry left by a build from before 2026-09-15: that mode is
    // gone, and the token it went with is what the server refuses now.
    if (storedState && storedState.mode !== 'masquerade') {
      removeFromStorage(STORAGE_KEY);
      storedState = null;
    }

    // For masquerade, the access token is the source of truth -- masquerading
    // swaps the access token for a masquerade JWT, and the backend derives
    // is_masquerading purely from the presented token. So a stale optio_acting_as
    // key (e.g. left by a masquerade that was started/ended on a DIFFERENT device,
    // or a prior session) must NOT light up the badge here. Confirm with the
    // server and clear local state if this device isn't actually masquerading.
    // Tokens may still be on disk only -- pull them into memory first or the
    // interceptor sends the request unauthenticated and we silently bail.
    try {
      await tokenStore.restore();
      if (!tokenStore.getAccessToken()) {
        // Can't validate without a token -- fall back to stored state optimistically.
        if (storedState?.target && storedState?.mode) {
          set({ target: storedState.target, isActive: true, mode: storedState.mode });
        }
        return;
      }
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
      } else {
        // Server confirms this token isn't masquerading -- drop any stale local
        // state so the badge doesn't appear on a non-masquerading device.
        removeFromStorage(STORAGE_KEY);
        set({ target: null, isActive: false, mode: null });
      }
    } catch {
      // Network/endpoint error -- don't wipe state we couldn't verify; trust stored.
      if (storedState?.target && storedState?.mode) {
        set({ target: storedState.target, isActive: true, mode: storedState.mode });
      }
    }
  },

  clear: () => {
    removeFromStorage(STORAGE_KEY);
    removeFromStorage(PARENT_ACCESS_KEY);
    removeFromStorage(PARENT_REFRESH_KEY);
    set({ target: null, isActive: false, mode: null, switching: false });
  },
}));
