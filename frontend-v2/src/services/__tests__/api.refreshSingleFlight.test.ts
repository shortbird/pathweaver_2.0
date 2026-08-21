/**
 * One refresh at a time, across every caller (Sentry OPTIO-BACKEND-6N).
 *
 * The backend rotates the refresh token on each use and treats a second
 * presentation of an already-rotated token as a replay — it revokes the whole
 * token family, ending every session on that chain. Two callers refreshing
 * concurrently on the same token is therefore not merely wasteful, it can log
 * the user out.
 *
 * The 401 interceptor shares its in-flight refresh with `refreshAccessToken()`,
 * which the raw-`fetch` upload paths (bug report, avatar, message attachments)
 * use because axios mangles RN multipart and they bypass the interceptor.
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

jest.mock('@/src/services/refreshRetry', () => ({
  postRefreshWithRetry: jest.fn(),
}));

jest.mock('@/src/services/diagnostics', () => ({ recordApiCall: jest.fn() }));
jest.mock('@/src/services/sentry', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

import { api, refreshAccessToken } from '@/src/services/api';
import { tokenStore } from '@/src/services/tokenStore';
import { postRefreshWithRetry } from '@/src/services/refreshRetry';

const mockRefresh = postRefreshWithRetry as jest.Mock;

type Cfg = InternalAxiosRequestConfig & { _retry?: boolean };

function axiosErr(status: number, config: Cfg): AxiosError {
  const err = new Error(`status ${status}`) as AxiosError;
  err.isAxiosError = true;
  err.config = config;
  err.response = {
    status,
    statusText: 'err',
    data: {},
    headers: {},
    config,
  } as AxiosError['response'];
  return err;
}

/** A refresh that stays pending until the test releases it. */
function deferredRefresh(failWith?: unknown) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  mockRefresh.mockImplementation(async () => {
    await gate;
    if (failWith) throw failWith;
    return { data: { access_token: 'new-access', refresh_token: 'new-refresh' } };
  });
  return release;
}

/**
 * Let every pending caller reach the shared refresh before it settles.
 *
 * A 401 travels through the adapter and three response interceptors before it
 * gets there, so a single microtask tick is not enough: release the gate too
 * early and the callers refresh in sequence, which is exactly the case these
 * tests exist to distinguish from.
 */
async function flush(ticks = 5) {
  for (let i = 0; i < ticks; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

beforeAll(() => {
  // 401 until the interceptor marks the request as retried, so a successful
  // refresh turns into a 200 and a failed one leaves the 401 to propagate.
  api.defaults.adapter = async (config) => {
    const cfg = config as Cfg;
    if ((cfg.url || '').includes('/api/notifications') && !cfg._retry) {
      return Promise.reject(axiosErr(401, cfg));
    }
    return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config } as any;
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  (tokenStore.getAccessToken as jest.Mock).mockReturnValue('old-access-token');
  (tokenStore.getRefreshToken as jest.Mock).mockReturnValue('old-refresh-token');
});

describe('refresh single-flight', () => {
  it('collapses a burst of 401s into ONE refresh', async () => {
    const release = deferredRefresh();

    const inFlight = Promise.all([
      api.get('/api/notifications'),
      api.get('/api/notifications'),
      api.get('/api/notifications'),
    ]);
    await flush();
    release();

    const results = await inFlight;

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.status === 200)).toBe(true);
  });

  it('shares one refresh between a raw-fetch caller and the 401 interceptor', async () => {
    const release = deferredRefresh();

    // The upload paths call this helper directly; the interceptor path runs
    // concurrently, as it does when a screen is loading behind the upload.
    const inFlight = Promise.all([
      refreshAccessToken(),
      api.get('/api/notifications'),
    ]);
    await flush();
    release();

    const [token, res] = await inFlight;

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(token).toBe('new-access');
    expect(res.status).toBe(200);
  });

  it('starts a new refresh once the previous one has settled', async () => {
    mockRefresh.mockResolvedValue({
      data: { access_token: 'new-access', refresh_token: 'new-refresh' },
    });

    expect(await refreshAccessToken()).toBe('new-access');
    expect(await refreshAccessToken()).toBe('new-access');

    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });

  it('rejects every joined caller when the shared refresh fails', async () => {
    const release = deferredRefresh(axiosErr(401, {} as Cfg));

    const inFlight = Promise.all([
      refreshAccessToken(),
      api.get('/api/notifications').then(() => 'ok', () => 'rejected'),
    ]);
    await flush();
    release();

    const [token, res] = await inFlight;

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(token).toBeNull();
    expect(res).toBe('rejected');
    // A genuinely rejected refresh token still ends the session.
    expect(tokenStore.clearTokens).toHaveBeenCalled();
  });
});
