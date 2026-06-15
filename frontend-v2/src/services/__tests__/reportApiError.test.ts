/**
 * reportApiError tests — guards how API failures are routed to Sentry.
 *
 * Regression net for the NODE-7 class of issue: expected client/auth errors
 * (401/403/404) must NOT be reported (they're normal control flow and just
 * create noise), while network errors + 5xx go to captureException and other
 * 4xx go to captureMessage — each fingerprinted per endpoint so they don't
 * collapse into one unactionable bucket.
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

import { reportApiError, SILENCED_API_STATUSES } from '@/src/services/api';
import { captureException, captureMessage } from '@/src/services/sentry';

function axiosErr(status: number | null, url = '/api/quests/abc', method = 'get') {
  return {
    isAxiosError: true,
    message: status ? `Request failed with status code ${status}` : 'Network Error',
    config: { url, method },
    response: status ? ({ status, data: {} } as any) : undefined,
  } as any;
}

beforeEach(() => jest.clearAllMocks());

describe('reportApiError', () => {
  it('silences expected client/auth statuses (401/403/404) — no Sentry noise', () => {
    expect(SILENCED_API_STATUSES.has(401)).toBe(true);
    expect(SILENCED_API_STATUSES.has(403)).toBe(true);
    expect(SILENCED_API_STATUSES.has(404)).toBe(true);
    for (const s of [401, 403, 404]) {
      reportApiError(axiosErr(s), s);
    }
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('sends 5xx to captureException, fingerprinted by endpoint', () => {
    reportApiError(axiosErr(500, '/api/quests/123'), 500);
    expect(captureException).toHaveBeenCalledTimes(1);
    const opts = (captureException as jest.Mock).mock.calls[0][1];
    expect(opts.fingerprint).toEqual(['api-error', 'GET', '/api/quests/:id', '500']);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('sends network errors (no response) to captureException', () => {
    reportApiError(axiosErr(null, '/api/quests/123'), null);
    expect(captureException).toHaveBeenCalledTimes(1);
    const opts = (captureException as jest.Mock).mock.calls[0][1];
    expect(opts.fingerprint).toEqual(['api-error', 'GET', '/api/quests/:id', 'network']);
  });

  it('sends non-silenced 4xx to captureMessage, fingerprinted per endpoint (not one bucket)', () => {
    reportApiError(axiosErr(422, '/api/quests/123', 'post'), 422);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [msg, opts] = (captureMessage as jest.Mock).mock.calls[0];
    expect(opts.level).toBe('warning');
    expect(opts.fingerprint).toEqual(['api-warning', 'POST', '/api/quests/:id', '422']);
    // The grouping key must include the endpoint, not collapse everything.
    expect(msg).toContain('/api/quests/:id');
    expect(captureException).not.toHaveBeenCalled();
  });
});
