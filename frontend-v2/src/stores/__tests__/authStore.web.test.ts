/**
 * authStore.loadUser web-platform tests (H2).
 *
 * On web, tokens are memory-only, so a hard reload leaves tokenStore.restore()
 * returning false. loadUser must then attempt a cookie-driven /api/auth/refresh
 * and stash the returned tokens before calling /me. Native path is covered in
 * authStore.test.ts.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
}));

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: {
    restore: jest.fn(),
    setTokens: jest.fn().mockResolvedValue(undefined),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
  },
}));

jest.mock('@/src/stores/actingAsStore', () => ({
  useActingAsStore: { getState: jest.fn(() => ({ clear: jest.fn() })) },
}));

import { useAuthStore } from '../authStore';
import { api, authAPI } from '@/src/services/api';
import { tokenStore } from '@/src/services/tokenStore';
import { createMockUser } from '@/src/__tests__/utils/mockFactories';

const mockUser = createMockUser();

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });
  jest.clearAllMocks();
});

describe('authStore.loadUser (web cookie-refresh fallback)', () => {
  it('refreshes via cookie and loads /me when restore returns false', async () => {
    (tokenStore.restore as jest.Mock).mockResolvedValue(false);
    (api.post as jest.Mock).mockResolvedValue({
      data: { access_token: 'new-access', refresh_token: 'new-refresh' },
    });
    (authAPI.me as jest.Mock).mockResolvedValue({ data: mockUser });

    await useAuthStore.getState().loadUser();

    expect(api.post).toHaveBeenCalledWith('/api/auth/refresh', {});
    expect(tokenStore.setTokens).toHaveBeenCalledWith('new-access', 'new-refresh');
    expect(authAPI.me).toHaveBeenCalled();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it('falls through to unauthenticated when refresh cookie is missing/invalid', async () => {
    (tokenStore.restore as jest.Mock).mockResolvedValue(false);
    (api.post as jest.Mock).mockRejectedValue(new Error('401'));

    await useAuthStore.getState().loadUser();

    expect(api.post).toHaveBeenCalledWith('/api/auth/refresh', {});
    expect(tokenStore.setTokens).not.toHaveBeenCalled();
    expect(authAPI.me).not.toHaveBeenCalled();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it('skips cookie refresh when restore already returned tokens', async () => {
    (tokenStore.restore as jest.Mock).mockResolvedValue(true);
    (authAPI.me as jest.Mock).mockResolvedValue({ data: mockUser });

    await useAuthStore.getState().loadUser();

    expect(api.post).not.toHaveBeenCalled();
    expect(authAPI.me).toHaveBeenCalled();
  });
});
