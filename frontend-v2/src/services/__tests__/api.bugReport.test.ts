/**
 * bugReportAPI.submit tests — verifies the raw-fetch bug reporter recovers from
 * an expired access token by refreshing once and retrying (Sentry NODE-B). The
 * fetch path bypasses the axios 401 interceptor, so this behavior lives in
 * bugReportAPI.submit itself.
 */

jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: {
    setTokens: jest.fn().mockResolvedValue(undefined),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn().mockReturnValue('expired-access-token'),
    getRefreshToken: jest.fn().mockReturnValue('valid-refresh-token'),
  },
}));

// Refresh succeeds by default; individual tests override.
jest.mock('@/src/services/refreshRetry', () => ({
  postRefreshWithRetry: jest.fn().mockResolvedValue({
    data: { access_token: 'fresh-access-token', refresh_token: 'fresh-refresh-token' },
  }),
}));

import { bugReportAPI } from '@/src/services/api';
import { tokenStore } from '@/src/services/tokenStore';
import { postRefreshWithRetry } from '@/src/services/refreshRetry';

const ctx = { message: 'it broke' } as any;

function authHeaderOf(call: any): string | undefined {
  return call?.[1]?.headers?.Authorization;
}

beforeEach(() => {
  jest.clearAllMocks();
  (tokenStore.getAccessToken as jest.Mock).mockReturnValue('expired-access-token');
  (tokenStore.getRefreshToken as jest.Mock).mockReturnValue('valid-refresh-token');
  (postRefreshWithRetry as jest.Mock).mockResolvedValue({
    data: { access_token: 'fresh-access-token', refresh_token: 'fresh-refresh-token' },
  });
});

describe('bugReportAPI.submit', () => {
  it('refreshes and retries once on a 401, then succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'unauthorized' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'report-1' }) });
    (global as any).fetch = fetchMock;

    const result = await bugReportAPI.submit(ctx, null);

    expect(result).toEqual({ id: 'report-1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // First attempt uses the stale token, the retry uses the refreshed one.
    expect(authHeaderOf(fetchMock.mock.calls[0])).toBe('Bearer expired-access-token');
    expect(authHeaderOf(fetchMock.mock.calls[1])).toBe('Bearer fresh-access-token');
    expect(tokenStore.setTokens).toHaveBeenCalledWith('fresh-access-token', 'fresh-refresh-token');
  });

  it('does not retry when the first attempt succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'report-2' }) });
    (global as any).fetch = fetchMock;

    const result = await bugReportAPI.submit(ctx, null);

    expect(result).toEqual({ id: 'report-2' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(postRefreshWithRetry).not.toHaveBeenCalled();
  });

  it('throws the original 401 when refresh cannot recover', async () => {
    // No refresh token available → refreshAccessToken returns null, no retry.
    (tokenStore.getRefreshToken as jest.Mock).mockReturnValue(null);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'unauthorized' });
    (global as any).fetch = fetchMock;

    await expect(bugReportAPI.submit(ctx, null)).rejects.toThrow(/Bug report failed \(401\)/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
