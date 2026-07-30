/**
 * tokenStore: an unreadable keychain is NOT a logout.
 *
 * The bug this pins: `getSecure` used to let a SecureStore failure propagate.
 * `authStore.loadUser` caught it, `extractApiError` mapped the plain Error to
 * isAuthError=false/isNetworkError=false, and the catch cleared the tokens —
 * so one transient keychain read error destroyed a valid session for good.
 *
 * The read genuinely can fail: on iOS the default keychain accessibility is
 * WHEN_UNLOCKED, so a process started while the device is locked (a push
 * notification is enough) cannot read the item at all. tokenStore now writes
 * with AFTER_FIRST_UNLOCK and reports 'unavailable' instead of throwing, so
 * callers can retry rather than tear the session down.
 */

import * as SecureStore from 'expo-secure-store';
import { tokenStore } from '../tokenStore';

beforeEach(async () => {
  await tokenStore.clearTokens();
  jest.clearAllMocks();
});

describe('tokenStore.restoreDetailed', () => {
  it('reports "restored" and populates memory when the keychain has tokens', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('stored-access')
      .mockResolvedValueOnce('stored-refresh');

    expect(await tokenStore.restoreDetailed()).toBe('restored');
    expect(tokenStore.getAccessToken()).toBe('stored-access');
  });

  it('reports "empty" when the keychain reads fine but holds nothing', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    expect(await tokenStore.restoreDetailed()).toBe('empty');
  });

  it('reports "unavailable" — not "empty" — when the keychain read throws', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(
      new Error('User interaction is not allowed.'),
    );

    // The whole point: this must be distinguishable from a real logout.
    expect(await tokenStore.restoreDetailed()).toBe('unavailable');
  });
});

describe('tokenStore.restore (boolean wrapper)', () => {
  it('never throws when the keychain is unreadable', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('keychain locked'));

    // Callers that catch a throw here clear the session; returning false keeps
    // the tokens on disk for the next launch.
    await expect(tokenStore.restore()).resolves.toBe(false);
  });

  it('still returns true on a successful restore', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('a')
      .mockResolvedValueOnce('r');
    await expect(tokenStore.restore()).resolves.toBe(true);
  });
});

describe('tokenStore.getCachedUser', () => {
  it('returns null instead of throwing when the keychain is unreadable', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('keychain locked'));

    // A missing optimistic-restore cache is a lost optimisation, never an auth
    // failure — it must not reach loadUser's catch.
    await expect(tokenStore.getCachedUser()).resolves.toBeNull();
  });
});

describe('keychain accessibility', () => {
  it('writes tokens with AFTER_FIRST_UNLOCK so a locked-device launch can read them', async () => {
    await tokenStore.setTokens('a', 'r');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
    );
  });
});

describe('tokenStore.clearTokens', () => {
  it('completes even if the keychain delete fails', async () => {
    await tokenStore.setTokens('a', 'r');
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(new Error('keystore error'));

    // Logout must never hang or throw: the in-memory copy is what authorizes
    // requests, and it is dropped regardless.
    await expect(tokenStore.clearTokens()).resolves.toBeUndefined();
    expect(tokenStore.getAccessToken()).toBeNull();
  });
});
