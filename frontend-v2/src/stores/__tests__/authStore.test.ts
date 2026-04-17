/**
 * authStore tests - login, register, logout, loadUser flows.
 */

import { createMockUser } from '@/src/__tests__/utils/mockFactories';

// Mock the dependencies
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
  useActingAsStore: {
    getState: jest.fn(() => ({
      clear: jest.fn(),
    })),
  },
}));

import { useAuthStore } from '../authStore';
import { authAPI } from '@/src/services/api';
import { tokenStore } from '@/src/services/tokenStore';

const mockUser = createMockUser();

beforeEach(() => {
  // Reset store to initial state
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });
  jest.clearAllMocks();
});

describe('authStore', () => {
  describe('login', () => {
    it('calls authAPI.login, stores tokens, and sets user in state', async () => {
      (authAPI.login as jest.Mock).mockResolvedValue({
        data: {
          app_access_token: 'access-tok',
          app_refresh_token: 'refresh-tok',
          user: mockUser,
        },
      });

      await useAuthStore.getState().login('student@test.com', 'password123');

      expect(authAPI.login).toHaveBeenCalledWith('student@test.com', 'password123');
      expect(tokenStore.setTokens).toHaveBeenCalledWith('access-tok', 'refresh-tok');

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error on login failure', async () => {
      (authAPI.login as jest.Mock).mockRejectedValue({
        response: { data: { error: { message: 'Invalid credentials' } } },
      });

      await expect(
        useAuthStore.getState().login('bad@test.com', 'wrong')
      ).rejects.toBeDefined();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe('Invalid credentials');
    });
  });

  describe('loginWithUsername', () => {
    it('calls authAPI.loginWithUsername, stores tokens, and sets user', async () => {
      (authAPI.loginWithUsername as jest.Mock).mockResolvedValue({
        data: {
          app_access_token: 'org-access-tok',
          app_refresh_token: 'org-refresh-tok',
          user: { ...mockUser, role: 'org_managed', org_role: 'student' },
        },
      });

      await useAuthStore.getState().loginWithUsername('my-school', 'jdoe', 'password123');

      expect(authAPI.loginWithUsername).toHaveBeenCalledWith('my-school', 'jdoe', 'password123');
      expect(tokenStore.setTokens).toHaveBeenCalledWith('org-access-tok', 'org-refresh-tok');

      const state = useAuthStore.getState();
      expect(state.user?.role).toBe('org_managed');
      expect(state.isAuthenticated).toBe(true);
      expect(state.error).toBeNull();
    });

    it('sets error on loginWithUsername failure', async () => {
      (authAPI.loginWithUsername as jest.Mock).mockRejectedValue({
        response: { data: { error: 'Invalid username or password' } },
      });

      await expect(
        useAuthStore.getState().loginWithUsername('my-school', 'bad', 'wrong')
      ).rejects.toBeDefined();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe('Invalid username or password');
    });
  });

  describe('register', () => {
    it('calls authAPI.register, stores tokens, fetches /me, and sets user', async () => {
      // Backend returns `app_access_token` / `app_refresh_token` (Optio naming
      // convention, not generic access_token). authStore.register keys on those.
      (authAPI.register as jest.Mock).mockResolvedValue({
        data: {
          app_access_token: 'new-access',
          app_refresh_token: 'new-refresh',
          user: mockUser,
        },
      });

      await useAuthStore.getState().register({
        email: 'new@test.com',
        password: 'pass123',
        first_name: 'New',
        last_name: 'User',
      });

      expect(authAPI.register).toHaveBeenCalled();
      expect(tokenStore.setTokens).toHaveBeenCalledWith('new-access', 'new-refresh');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
    });

    it('handles registration without auto-login (email verification)', async () => {
      (authAPI.register as jest.Mock).mockResolvedValue({
        data: { message: 'Verification email sent' },
      });

      await useAuthStore.getState().register({
        email: 'verify@test.com',
        password: 'pass123',
        first_name: 'Verify',
        last_name: 'User',
      });

      expect(tokenStore.setTokens).not.toHaveBeenCalled();
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('logout', () => {
    it('calls authAPI.logout, clears tokens, and resets state', async () => {
      // Start authenticated
      useAuthStore.setState({ user: mockUser, isAuthenticated: true, isLoading: false });

      (authAPI.logout as jest.Mock).mockResolvedValue({ data: {} });

      await useAuthStore.getState().logout();

      expect(authAPI.logout).toHaveBeenCalled();
      expect(tokenStore.clearTokens).toHaveBeenCalled();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('clears local state even if logout API call fails', async () => {
      useAuthStore.setState({ user: mockUser, isAuthenticated: true, isLoading: false });

      (authAPI.logout as jest.Mock).mockRejectedValue(new Error('Network error'));

      await useAuthStore.getState().logout();

      expect(tokenStore.clearTokens).toHaveBeenCalled();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('loadUser', () => {
    it('restores tokens and fetches user from /me', async () => {
      (tokenStore.restore as jest.Mock).mockResolvedValue(true);
      (authAPI.me as jest.Mock).mockResolvedValue({ data: mockUser });

      await useAuthStore.getState().loadUser();

      expect(tokenStore.restore).toHaveBeenCalled();
      expect(authAPI.me).toHaveBeenCalled();

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('sets unauthenticated when no tokens exist', async () => {
      (tokenStore.restore as jest.Mock).mockResolvedValue(false);

      await useAuthStore.getState().loadUser();

      expect(authAPI.me).not.toHaveBeenCalled();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('clears tokens and state when /me fails (expired token)', async () => {
      (tokenStore.restore as jest.Mock).mockResolvedValue(true);
      (authAPI.me as jest.Mock).mockRejectedValue(new Error('401'));

      await useAuthStore.getState().loadUser();

      expect(tokenStore.clearTokens).toHaveBeenCalled();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });

  // ── Register Error Object Handling (v2 launch audit fix) ──

  describe('register error handling', () => {
    it('extracts message string from error object {code, message, ...}', async () => {
      (authAPI.register as jest.Mock).mockRejectedValue({
        response: {
          data: {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'You must accept the Terms of Service',
              request_id: 'abc-123',
              timestamp: '2026-03-27T00:00:00Z',
            },
          },
        },
      });

      await expect(
        useAuthStore.getState().register({
          email: 'test@test.com',
          password: 'pass',
          first_name: 'Test',
          last_name: 'User',
        })
      ).rejects.toBeDefined();

      const { error } = useAuthStore.getState();
      expect(typeof error).toBe('string');
      expect(error).toBe('You must accept the Terms of Service');
    });

    it('handles plain string error from backend', async () => {
      (authAPI.register as jest.Mock).mockRejectedValue({
        response: { data: { error: 'Email already registered' } },
      });

      await expect(
        useAuthStore.getState().register({
          email: 'test@test.com',
          password: 'pass',
          first_name: 'Test',
          last_name: 'User',
        })
      ).rejects.toBeDefined();

      expect(useAuthStore.getState().error).toBe('Email already registered');
    });

    it('uses fallback message when error field is missing', async () => {
      (authAPI.register as jest.Mock).mockRejectedValue({
        response: { data: {} },
      });

      await expect(
        useAuthStore.getState().register({
          email: 'test@test.com',
          password: 'pass',
          first_name: 'Test',
          last_name: 'User',
        })
      ).rejects.toBeDefined();

      expect(useAuthStore.getState().error).toBe('Registration failed. Please try again.');
    });
  });

  // ── Forgot Password (v2 launch audit addition) ──

  describe('forgotPassword', () => {
    it('calls authAPI.forgotPassword and returns success message', async () => {
      (authAPI.forgotPassword as jest.Mock).mockResolvedValue({
        data: { message: 'If an account exists, you will receive reset instructions.' },
      });

      const message = await useAuthStore.getState().forgotPassword('test@test.com');

      expect(authAPI.forgotPassword).toHaveBeenCalledWith('test@test.com');
      expect(message).toContain('account exists');
    });

    it('throws error message on API failure', async () => {
      (authAPI.forgotPassword as jest.Mock).mockRejectedValue({
        response: { data: { error: 'Invalid email format' } },
      });

      await expect(
        useAuthStore.getState().forgotPassword('bad')
      ).rejects.toThrow('Invalid email format');
    });

    it('throws fallback message when no error detail', async () => {
      (authAPI.forgotPassword as jest.Mock).mockRejectedValue({
        response: { data: {} },
      });

      await expect(
        useAuthStore.getState().forgotPassword('test@test.com')
      ).rejects.toThrow('Failed to send reset email');
    });
  });
});
