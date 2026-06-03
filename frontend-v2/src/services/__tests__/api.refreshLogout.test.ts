/**
 * Interceptor logout-on-refresh-failure behavior (bug #2: tapping notifications
 * logged the user out).
 *
 * The 401 auto-refresh interceptor must only clear tokens when the refresh
 * GENUINELY fails (refresh token invalid/expired → 401/403, or no refresh token
 * at all). A transient/recoverable refresh failure — network error, timeout, or
 * 5xx — must leave the session intact so a flaky 401 on a non-critical screen
 * doesn't bounce the user to login.
 *
 * We drive the real axios instance + its interceptors via a custom adapter, and
 * mock `postRefreshWithRetry` so each test controls exactly how the refresh
 * resolves/rejects without going over the network.
 */

import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: {
    restore: jest.fn(),
    setTokens: jest.fn().mockResolvedValue(undefined),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn().mockReturnValue('old-access-token'),
    getRefreshToken: jest.fn().mockReturnValue('old-refresh-token'),
  },
}));

// Control the refresh outcome per-test without hitting the network.
jest.mock('@/src/services/refreshRetry', () => ({
  postRefreshWithRetry: jest.fn(),
}));

// Keep the diagnostics/sentry side-effect interceptors quiet.
jest.mock('@/src/services/diagnostics', () => ({ recordApiCall: jest.fn() }));
jest.mock('@/src/services/sentry', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

import { api } from '@/src/services/api';
import { tokenStore } from '@/src/services/tokenStore';
import { postRefreshWithRetry } from '@/src/services/refreshRetry';

const mockRefresh = postRefreshWithRetry as jest.Mock;

type Cfg = InternalAxiosRequestConfig & { _retry?: boolean };

/** Build an axios-shaped error with an optional response status. */
function axiosErr(status: number | undefined, config: Cfg): AxiosError {
  const err = new Error(`status ${status}`) as AxiosError;
  err.isAxiosError = true;
  err.config = config;
  if (status !== undefined) {
    err.response = {
      status,
      statusText: 'err',
      data: {},
      headers: {},
      config,
    } as AxiosError['response'];
  }
  return err;
}

// Custom adapter: the protected endpoint 401s on first hit, and (once the
// interceptor has marked it _retry) succeeds — so a successful refresh produces
// a 200, and a failed refresh leaves the original 401 to propagate.
beforeAll(() => {
  api.defaults.adapter = async (config) => {
    const cfg = config as Cfg;
    const url = cfg.url || '';
    if (url.includes('/api/notifications') && !cfg._retry) {
      return Promise.reject(axiosErr(401, cfg));
    }
    return {
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    } as any;
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  (tokenStore.getAccessToken as jest.Mock).mockReturnValue('old-access-token');
  (tokenStore.getRefreshToken as jest.Mock).mockReturnValue('old-refresh-token');
});

describe('refresh interceptor — logout only on genuine auth failure', () => {
  it('does NOT clear tokens when the refresh fails transiently (5xx)', async () => {
    mockRefresh.mockRejectedValueOnce(axiosErr(503, {} as Cfg));

    await expect(api.get('/api/notifications')).rejects.toBeDefined();

    expect(tokenStore.clearTokens).not.toHaveBeenCalled();
  });

  it('does NOT clear tokens when the refresh fails with a network error (no response)', async () => {
    mockRefresh.mockRejectedValueOnce(axiosErr(undefined, {} as Cfg));

    await expect(api.get('/api/notifications')).rejects.toBeDefined();

    expect(tokenStore.clearTokens).not.toHaveBeenCalled();
  });

  it('DOES clear tokens when the refresh token is genuinely rejected (401)', async () => {
    mockRefresh.mockRejectedValueOnce(axiosErr(401, {} as Cfg));

    await expect(api.get('/api/notifications')).rejects.toBeDefined();

    expect(tokenStore.clearTokens).toHaveBeenCalledTimes(1);
  });

  it('DOES clear tokens when the refresh token is genuinely rejected (403)', async () => {
    mockRefresh.mockRejectedValueOnce(axiosErr(403, {} as Cfg));

    await expect(api.get('/api/notifications')).rejects.toBeDefined();

    expect(tokenStore.clearTokens).toHaveBeenCalledTimes(1);
  });

  it('DOES clear tokens when there is no refresh token on native (session gone)', async () => {
    (tokenStore.getRefreshToken as jest.Mock).mockReturnValue(null);

    await expect(api.get('/api/notifications')).rejects.toBeDefined();

    // Refresh is never even attempted — the session is unrecoverable.
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(tokenStore.clearTokens).toHaveBeenCalledTimes(1);
  });

  it('refreshes successfully and keeps the session (no logout)', async () => {
    mockRefresh.mockResolvedValueOnce({
      data: { access_token: 'new-access', refresh_token: 'new-refresh' },
    });

    const res = await api.get('/api/notifications');

    expect(res.status).toBe(200);
    expect(tokenStore.setTokens).toHaveBeenCalledWith('new-access', 'new-refresh');
    expect(tokenStore.clearTokens).not.toHaveBeenCalled();
  });
});
