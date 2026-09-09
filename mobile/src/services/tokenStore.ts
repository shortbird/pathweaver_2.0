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
const USER_KEY = 'optio_cached_user';
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

// iOS: default keychain accessibility is WHEN_UNLOCKED, which makes reads fail
// outright if the process starts while the device is locked — a push
// notification or a background launch is enough. The restore then finds no
// tokens and the user lands on the login screen holding a session that was
// never actually invalid. AFTER_FIRST_UNLOCK keeps the item readable from the
// first unlock after boot onward, which is the right trade for a session token.
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

/** Raised when the keychain/keystore itself could not be read — as opposed to
 *  being read successfully and found empty. The difference matters: empty means
 *  "logged out", unreadable means "ask again later, don't destroy anything". */
export class SecureStoreUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`SecureStore unavailable: ${String(cause)}`);
    this.name = 'SecureStoreUnavailableError';
  }
}

async function setSecure(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') return; // memory-only on web
  await SecureStore.setItemAsync(key, value, SECURE_OPTS);
}

async function getSecure(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return null; // memory-only on web
  try {
    return await SecureStore.getItemAsync(key, SECURE_OPTS);
  } catch (err) {
    // Keychain/keystore read genuinely failed (device locked, corrupted entry
    // after an OS restore, Android keystore rotation). Never let this look like
    // "no token" — that path clears the session and locks the user out for good.
    throw new SecureStoreUnavailableError(err);
  }
}

async function deleteSecure(key: string): Promise<void> {
  if (Platform.OS === 'web') return; // memory-only on web
  try {
    await SecureStore.deleteItemAsync(key, SECURE_OPTS);
  } catch {
    // A failed delete must not abort logout — the caller has already dropped
    // the in-memory copy, which is what authorizes requests.
  }
}

export type RestoreOutcome = 'restored' | 'empty' | 'unavailable';

/**
 * Restore tokens into memory on app start, reporting *why* it failed.
 *
 *   'restored'    — tokens are in memory, carry on.
 *   'empty'       — the store was readable and held nothing: really logged out.
 *   'unavailable' — the keychain/keystore could not be read. Says nothing about
 *                   whether a session exists; the caller must retry rather than
 *                   treat it as a logout.
 *
 * Web always reports 'empty': tokens are memory-only there, and the caller mints
 * a fresh access token from the httpOnly refresh cookie instead.
 *
 * Defined at module scope (not as a method) so the two exported entry points
 * can't disagree if a caller ever destructures them off the object.
 */
async function restoreDetailedImpl(): Promise<RestoreOutcome> {
  if (Platform.OS === 'web') return 'empty';
  let access: string | null;
  let refresh: string | null;
  try {
    access = await getSecure(ACCESS_KEY);
    refresh = await getSecure(REFRESH_KEY);
  } catch (err) {
    if (err instanceof SecureStoreUnavailableError) return 'unavailable';
    throw err;
  }
  if (access) {
    memoryAccess = access;
    memoryRefresh = refresh;
    return 'restored';
  }
  return 'empty';
}

export const tokenStore = {
  restoreDetailed: restoreDetailedImpl,

  /**
   * Restore tokens into memory on app start.
   * Native: reads SecureStore. Web: returns false — caller must hit /api/auth/refresh
   * to mint an access token from the httpOnly refresh cookie.
   *
   * Never throws: an unreadable keychain reports false rather than propagating,
   * because callers that catch a throw here tend to clear the session — the
   * exact overreaction this is guarding against.
   */
  async restore(): Promise<boolean> {
    return (await restoreDetailedImpl()) === 'restored';
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
    await deleteSecure(USER_KEY);
  },

  /** Cache user JSON for fast restore on next launch (native only) */
  async setCachedUser(user: unknown): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      await setSecure(USER_KEY, JSON.stringify(user));
    } catch {
      // ignore cache write failures
    }
  },

  /** Read cached user JSON (native only). Never throws — an unreadable cache is
   *  a missing optimisation, not an auth failure. */
  async getCachedUser<T>(): Promise<T | null> {
    if (Platform.OS === 'web') return null;
    let raw: string | null;
    try {
      raw = await getSecure(USER_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
};
