/**
 * Token Store - Platform-aware secure token storage.
 *
 * Native: expo-secure-store (encrypted keychain/keystore)
 * Web: in-memory + localStorage (upgrade to IndexedDB later)
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'optio_access_token';
const REFRESH_KEY = 'optio_refresh_token';

// In-memory cache for synchronous access in interceptors
let memoryAccess: string | null = null;
let memoryRefresh: string | null = null;

async function setSecure(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private mode or storage full -- memory-only is fine
    }
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function getSecure(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  } else {
    return SecureStore.getItemAsync(key);
  }
}

async function deleteSecure(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

export const tokenStore = {
  /** Restore tokens from persistent storage into memory (call on app start) */
  async restore(): Promise<boolean> {
    const access = await getSecure(ACCESS_KEY);
    const refresh = await getSecure(REFRESH_KEY);
    if (access) {
      memoryAccess = access;
      memoryRefresh = refresh;
      return true;
    }
    return false;
  },

  /** Store tokens in memory + persistent storage */
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
