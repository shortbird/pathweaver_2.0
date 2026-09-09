/**
 * authStore OAuth TOS consent flow — a first-time OAuth user must explicitly
 * accept the Terms of Service; the store must never accept on their behalf
 * (it used to auto-POST accepted_tos:true, defeating the backend gate).
 */

import { createMockUser } from '@/src/__tests__/utils/mockFactories';

import { useAuthStore } from '../authStore';
import { api } from '@/src/services/api';
import { tokenStore } from '@/src/services/tokenStore';
import { router } from 'expo-router';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: {
    restore: jest.fn(),
    restoreDetailed: jest.fn(),
    setTokens: jest.fn().mockResolvedValue(undefined),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
    getCachedUser: jest.fn().mockResolvedValue(null),
    setCachedUser: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/src/stores/actingAsStore', () => ({
  useActingAsStore: {
    getState: jest.fn(() => ({ clear: jest.fn() })),
  },
}));

const mockUser = createMockUser();

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
    pendingTosToken: null,
  });
  jest.clearAllMocks();
});

describe('OAuth TOS consent', () => {
  it('parks the token and routes to accept-terms instead of auto-accepting', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: { requires_tos_acceptance: true, tos_acceptance_token: 'tos-tok-123' },
    });

    await useAuthStore.getState().handleGoogleCallback('sb-access', 'sb-refresh');

    const state = useAuthStore.getState();
    expect(state.pendingTosToken).toBe('tos-tok-123');
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    // Exactly one POST (the callback exchange) — no accept-tos call.
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(tokenStore.setTokens).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(auth)/accept-terms');
  });

  it('acceptPendingTos posts the acceptance and establishes the session', async () => {
    useAuthStore.setState({ pendingTosToken: 'tos-tok-123' });
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: { app_access_token: 'a-tok', app_refresh_token: 'r-tok', user: mockUser },
    });

    await useAuthStore.getState().acceptPendingTos();

    expect(api.post).toHaveBeenCalledWith('/api/auth/google/accept-tos', {
      tos_acceptance_token: 'tos-tok-123',
      accepted_tos: true,
      accepted_privacy: true,
    });
    expect(tokenStore.setTokens).toHaveBeenCalledWith('a-tok', 'r-tok');
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(mockUser);
    expect(state.pendingTosToken).toBeNull();
  });

  it('acceptPendingTos is a no-op with nothing pending', async () => {
    await useAuthStore.getState().acceptPendingTos();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('acceptPendingTos surfaces errors and keeps the token for retry', async () => {
    useAuthStore.setState({ pendingTosToken: 'tos-tok-123', isLoading: false });
    (api.post as jest.Mock).mockRejectedValueOnce({
      response: { data: { error: 'Acceptance token expired' } },
    });

    await expect(useAuthStore.getState().acceptPendingTos()).rejects.toBeDefined();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBeTruthy();
    expect(state.pendingTosToken).toBe('tos-tok-123');
  });

  it('declinePendingTos abandons the sign-up without creating a session', () => {
    useAuthStore.setState({ pendingTosToken: 'tos-tok-123' });

    useAuthStore.getState().declinePendingTos();

    const state = useAuthStore.getState();
    expect(state.pendingTosToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('Apple callback goes through the same consent gate', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: { requires_tos_acceptance: true, tos_acceptance_token: 'tos-apple-1' },
    });

    await useAuthStore.getState().handleAppleCallback('sb-access', 'sb-refresh');

    const state = useAuthStore.getState();
    expect(state.pendingTosToken).toBe('tos-apple-1');
    expect(state.isAuthenticated).toBe(false);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/(auth)/accept-terms');
  });
});
