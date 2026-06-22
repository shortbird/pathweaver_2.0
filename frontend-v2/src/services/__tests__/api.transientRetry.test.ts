/**
 * isRetriableTransient tests — guards which failures the api client auto-retries.
 *
 * The retry interceptor masks brief backend-unavailability blips (worker
 * restart / memory-spike OOM on the 512MB prod instance) that surface as
 * network errors / timeouts / 502 / 503 / 504. Only idempotent GET/HEAD may be
 * retried — never POST/PUT/PATCH/DELETE (could double-write) — and real client
 * errors (4xx) must NOT be retried.
 */

jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: {
    restore: jest.fn(),
    setTokens: jest.fn().mockResolvedValue(undefined),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn().mockReturnValue('t'),
    getRefreshToken: jest.fn().mockReturnValue('r'),
  },
}));

jest.mock('@/src/services/sentry', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  initSentry: jest.fn(),
  setSentryUser: jest.fn(),
  wrapWithSentry: (c: unknown) => c,
}));

import axios from 'axios';
import { isRetriableTransient } from '@/src/services/api';

function axiosErr(status: number | null, method = 'get') {
  return {
    isAxiosError: true,
    message: status ? `Request failed with status code ${status}` : 'Network Error',
    config: { url: '/api/quests/abc', method },
    response: status ? ({ status, data: {} } as any) : undefined,
  } as any;
}

describe('isRetriableTransient', () => {
  it('retries idempotent GET on 502/503/504', () => {
    for (const s of [502, 503, 504]) {
      expect(isRetriableTransient(axiosErr(s, 'get'))).toBe(true);
    }
  });

  it('retries GET network error / timeout (no response)', () => {
    expect(isRetriableTransient(axiosErr(null, 'get'))).toBe(true);
  });

  it('does NOT retry non-idempotent methods even on a transient status', () => {
    for (const m of ['post', 'put', 'patch', 'delete']) {
      expect(isRetriableTransient(axiosErr(502, m))).toBe(false);
      expect(isRetriableTransient(axiosErr(null, m))).toBe(false);
    }
  });

  it('does NOT retry real client/server errors that are not transient', () => {
    for (const s of [400, 401, 403, 404, 409, 422, 500]) {
      expect(isRetriableTransient(axiosErr(s, 'get'))).toBe(false);
    }
  });

  it('does NOT retry canceled requests', () => {
    const canceled = new axios.Cancel('canceled') as any;
    expect(isRetriableTransient(canceled)).toBe(false);
  });
});
