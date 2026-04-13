/**
 * @jest-environment jsdom
 *
 * tokenStore web-platform tests (H2).
 *
 * Verifies the post-H2 invariant: on web we never read or write tokens to
 * localStorage; persistent session lives only in the httpOnly refresh cookie.
 * Native behavior is covered by tokenStore.test.ts.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
}));

import * as SecureStore from 'expo-secure-store';

// Load tokenStore lazily inside isolated module registries so we can seed
// localStorage *before* the module's top-level purge runs.
function loadFreshTokenStore(): typeof import('../tokenStore').tokenStore {
  let mod!: typeof import('../tokenStore');
  jest.isolateModules(() => {
    mod = require('../tokenStore');
  });
  return mod.tokenStore;
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe('tokenStore (web)', () => {
  it('purges legacy localStorage tokens at import time', () => {
    localStorage.setItem('optio_access_token', 'legacy-access');
    localStorage.setItem('optio_refresh_token', 'legacy-refresh');

    loadFreshTokenStore();

    expect(localStorage.getItem('optio_access_token')).toBeNull();
    expect(localStorage.getItem('optio_refresh_token')).toBeNull();
  });

  it('setTokens does not write to localStorage or SecureStore on web', async () => {
    const tokenStore = loadFreshTokenStore();
    await tokenStore.setTokens('access-123', 'refresh-456');

    expect(localStorage.getItem('optio_access_token')).toBeNull();
    expect(localStorage.getItem('optio_refresh_token')).toBeNull();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('getters return the in-memory values set by setTokens', async () => {
    const tokenStore = loadFreshTokenStore();
    await tokenStore.setTokens('access-123', 'refresh-456');

    expect(tokenStore.getAccessToken()).toBe('access-123');
    expect(tokenStore.getRefreshToken()).toBe('refresh-456');
  });

  it('restore returns false on web (no persistent source) and never touches SecureStore', async () => {
    const tokenStore = loadFreshTokenStore();
    const result = await tokenStore.restore();

    expect(result).toBe(false);
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.getRefreshToken()).toBeNull();
  });

  it('clearTokens wipes memory only — no SecureStore calls on web', async () => {
    const tokenStore = loadFreshTokenStore();
    await tokenStore.setTokens('access-123', 'refresh-456');
    await tokenStore.clearTokens();

    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.getRefreshToken()).toBeNull();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});
