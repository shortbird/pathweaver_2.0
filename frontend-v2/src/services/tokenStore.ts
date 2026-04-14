/**
 * Token Store - Platform-aware secure token storage.
 *
 * Native: expo-secure-store (encrypted keychain/keystore) — persists across app launches.
 * Web: in-memory only. Persistent session lives in the httpOnly refresh cookie set by
 *   the backend on login; on reload, authStore calls /api/auth/refresh to mint a new
 *   access token using that cookie. Never write tokens to localStorage on web (XSS surface).
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'optio_access_token';
const REFRESH_KEY = 'optio_refresh_token';
const LEGACY_WEB_KEYS = [ACCESS_KEY, REFRESH_KEY];

// In-memory cache for synchronous access in interceptors
let memoryAccess: string | null = null;
let memoryRefresh: string | null = null;

// One-shot purge of any pre-H2 localStorage tokens left on disk in the browser.
function purgeLegacyWebStorage(): void {
  if (Platform.OS !== 'web') return;
  try {
    for (const key of LEGACY_WEB_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // localStorage may be unavailable (private mode, SSR) — nothing to purge.
  }
}
purgeLegacyWebStorage();

async function setSecure(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') return; // memory-only on web
  await SecureStore.setItemAsync(key, value);
}

async function getSecure(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return null; // memory-only on web
  return SecureStore.getItemAsync(key);
}

async function deleteSecure(key: string): Promise<void> {
  if (Platform.OS === 'web') return; // memory-only on web
  await SecureStore.deleteItemAsync(key);
}

export const tokenStore = {
  /**
   * Restore tokens into memory on app start.
   * Native: reads SecureStore. Web: returns false — caller must hit /api/auth/refresh
   * to mint an access token from the httpOnly refresh cookie.
   */
  async restore(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    const access = await getSecure(ACCESS_KEY);
    const refresh = await getSecure(REFRESH_KEY);
    if (access) {
      memoryAccess = access;
      memoryRefresh = refresh;
      return true;
    }
    return false;
  },

  /** Store tokens in memory (and SecureStore on native). */
  async setTokens(access: string, refresh: string): Promise<void> {
    memoryAccess = access;
    memoryRefresh = refresh;
    await setSecure(ACCESS_KEY, access);
    await setSecure(REFRESH_KEY, refresh);
  },

  /** Get access token synchronously from memory */
  getAccessToken(): string | null {
    return memoryAccess;
  },

  /** Get refresh token synchronously from memory */
  getRefreshToken(): string | null {
    return memoryRefresh;
  },

  /** Clear all tokens */
  async clearTokens(): Promise<void> {
    memoryAccess = null;
    memoryRefresh = null;
    await deleteSecure(ACCESS_KEY);
    await deleteSecure(REFRESH_KEY);
  },
};
