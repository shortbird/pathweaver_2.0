/**
 * Session-expired notification: when a token refresh fails because the session
 * is genuinely gone (revoked family, expired refresh token), refreshOnce's
 * settle handler clears the tokens AND fires onSessionExpired — once per failed
 * refresh, no matter how many requests joined it. Transient refresh failures
 * must fire nothing.
 *
 * Same harness as api.refreshLogout.test.ts: real axios instance + custom
 * adapter, mocked postRefreshWithRetry.
 */

import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

import { api, onSessionExpired } from '@/src/services/api';
import { tokenStore } from '@/src/services/tokenStore';
import { postRefreshWithRetry } from '@/src/services/refreshRetry';

jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: {
    restore: jest.fn(),
    setTokens: jest.fn().mockResolvedValue(undefined),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn().mockReturnValue('old-access-token'),
    getRefreshToken: jest.fn().mockReturnValue('old-refresh-token'),
  },
}));

jest.mock('@/src/services/refreshRetry', () => ({
  postRefreshWithRetry: jest.fn(),
}));

jest.mock('@/src/services/diagnostics', () => ({ recordApiCall: jest.fn() }));
jest.mock('@/src/services/sentry', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

const mockRefresh = postRefreshWithRetry as jest.Mock;

type Cfg = InternalAxiosRequestConfig & { _retry?: boolean };

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

beforeAll(() => {
  api.defaults.adapter = async (config) => {
    const cfg = config as Cfg;
    if ((cfg.url || '').includes('/api/notifications') && !cfg._retry) {
      return Promise.reject(axiosErr(401, cfg));
    }
    return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config } as any;
  };
});

/** The teardown runs in refreshOnce's settle side-channel (an async catch),
 *  so give the microtask queue a couple of turns to drain. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('onSessionExpired', () => {
  let expired: jest.Mock;
  let unsubscribe: () => void;

  beforeEach(() => {
    jest.clearAllMocks();
    (tokenStore.getAccessToken as jest.Mock).mockReturnValue('old-access-token');
    (tokenStore.getRefreshToken as jest.Mock).mockReturnValue('old-refresh-token');
    expired = jest.fn();
    unsubscribe = onSessionExpired(expired);
  });

  afterEach(() => {
    unsubscribe();
  });

  it('fires (with tokens cleared) when the refresh is rejected 401', async () => {
    mockRefresh.mockRejectedValueOnce(axiosErr(401, {} as Cfg));

    await expect(api.get('/api/notifications')).rejects.toBeDefined();
    await flush();

    expect(tokenStore.clearTokens).toHaveBeenCalledTimes(1);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('fires when there is no refresh token at all (native session gone)', async () => {
    (tokenStore.getRefreshToken as jest.Mock).mockReturnValue(null);

    await expect(api.get('/api/notifications')).rejects.toBeDefined();
    await flush();

    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire on a transient refresh failure (5xx)', async () => {
    mockRefresh.mockRejectedValueOnce(axiosErr(503, {} as Cfg));

    await expect(api.get('/api/notifications')).rejects.toBeDefined();
    await flush();

    expect(tokenStore.clearTokens).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
  });

  it('does NOT fire on a network error (no response)', async () => {
    mockRefresh.mockRejectedValueOnce(axiosErr(undefined, {} as Cfg));

    await expect(api.get('/api/notifications')).rejects.toBeDefined();
    await flush();

    expect(expired).not.toHaveBeenCalled();
  });

  it('does NOT fire when the refresh succeeds', async () => {
    mockRefresh.mockResolvedValueOnce({
      data: { access_token: 'new-access', refresh_token: 'new-refresh' },
    });

    const res = await api.get('/api/notifications');
    await flush();

    expect(res.status).toBe(200);
    expect(expired).not.toHaveBeenCalled();
  });

  it('fires ONCE even when several 401s join the same failed refresh', async () => {
    // One shared refresh for the burst; it fails 401.
    mockRefresh.mockRejectedValue(axiosErr(401, {} as Cfg));

    const results = await Promise.allSettled([
      api.get('/api/notifications'),
      api.get('/api/notifications'),
      api.get('/api/notifications'),
    ]);
    await flush();

    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(expired).toHaveBeenCalledTimes(1);
    mockRefresh.mockReset();
  });

  it('unsubscribe stops future notifications', async () => {
    unsubscribe();
    mockRefresh.mockRejectedValueOnce(axiosErr(401, {} as Cfg));

    await expect(api.get('/api/notifications')).rejects.toBeDefined();
    await flush();

    expect(expired).not.toHaveBeenCalled();
    // Re-subscribe so afterEach's unsubscribe stays a no-op.
    unsubscribe = onSessionExpired(expired);
  });
});
