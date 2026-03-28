/**
 * tokenStore tests - verifies token persistence and synchronous access.
 */

import * as SecureStore from 'expo-secure-store';

// Must import after mocks are set up by setup.ts
import { tokenStore } from '../tokenStore';

beforeEach(async () => {
  await tokenStore.clearTokens();
  jest.clearAllMocks();
});

describe('tokenStore', () => {
  it('setTokens stores tokens and getters return them synchronously', async () => {
    await tokenStore.setTokens('access-123', 'refresh-456');

    expect(tokenStore.getAccessToken()).toBe('access-123');
    expect(tokenStore.getRefreshToken()).toBe('refresh-456');
  });

  it('restore returns true and populates memory when storage has tokens', async () => {
    // Simulate tokens in secure storage
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('stored-access')   // ACCESS_KEY
      .mockResolvedValueOnce('stored-refresh');  // REFRESH_KEY

    const result = await tokenStore.restore();

    expect(result).toBe(true);
    expect(tokenStore.getAccessToken()).toBe('stored-access');
    expect(tokenStore.getRefreshToken()).toBe('stored-refresh');
  });

  it('restore returns false when no tokens in storage', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await tokenStore.restore();

    expect(result).toBe(false);
    expect(tokenStore.getAccessToken()).toBeNull();
  });

  it('clearTokens removes tokens from memory and storage', async () => {
    await tokenStore.setTokens('access-123', 'refresh-456');
    expect(tokenStore.getAccessToken()).toBe('access-123');

    await tokenStore.clearTokens();

    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.getRefreshToken()).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(2);
  });
});
