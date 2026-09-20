/**
 * reportApiError tests — guards how API failures are routed to Sentry.
 *
 * Regression net for the NODE-7 class of issue: expected client/auth errors
 * (401/403/404) must NOT be reported (they're normal control flow and just
 * create noise), while network errors + 5xx go to captureException and other
 * 4xx go to captureMessage — each fingerprinted per endpoint so they don't
 * collapse into one unactionable bucket.
 */

import { AppState } from 'react-native';
import { reportApiError, SILENCED_API_STATUSES } from '@/src/services/api';
import { captureException, captureMessage } from '@/src/services/sentry';

// jest-expo's AppState.currentState is a mock function, not a status string.
const setAppState = (value: string) =>
  Object.defineProperty(AppState, 'currentState', { value, configurable: true });

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

function axiosErr(status: number | null, url = '/api/quests/abc', method = 'get', code?: string) {
  return {
    isAxiosError: true,
    message: status ? `Request failed with status code ${status}` : 'Network Error',
    code,
    config: { url, method },
    response: status ? ({ status, data: {} } as any) : undefined,
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  setAppState('active');
});

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

  it('sends timeouts (no response, request got out) to captureException per endpoint', () => {
    // A request that left the device and never came back can be a slow
    // endpoint, which is a fact about that endpoint.
    reportApiError(axiosErr(null, '/api/quests/123', 'get', 'ECONNABORTED'), null);
    expect(captureException).toHaveBeenCalledTimes(1);
    const opts = (captureException as jest.Mock).mock.calls[0][1];
    expect(opts.fingerprint).toEqual(['api-error', 'GET', '/api/quests/:id', 'network']);
  });

  it('folds an unreachable API (ERR_NETWORK) into one warning, not an issue per endpoint', () => {
    // Fifteen "AxiosError: Network Error" issues in a week, one to three users
    // each, every one a phone that was offline (OPTIO-MOBILE-7 and siblings,
    // 2026-09-14). One issue keeps the fleet-wide signal -- a dead host or an
    // expired certificate is a user-count spike there -- without a new issue
    // for every endpoint an offline phone happened to ask.
    reportApiError(axiosErr(null, '/api/quests/123', 'get', 'ERR_NETWORK'), null);
    reportApiError(axiosErr(null, '/api/bounties', 'get', 'ERR_NETWORK'), null);
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledTimes(2);
    for (const call of (captureMessage as jest.Mock).mock.calls) {
      expect(call[1].level).toBe('warning');
      expect(call[1].fingerprint).toEqual(['api-unreachable']);
    }
  });

  it('folds a timeout that fired while the app was backgrounded into one warning', () => {
    // OPTIO-MOBILE-20 and -21, 2026-09-18: GET /api/bounties and
    // /api/bounties/my-posted both timed out at the same instant with
    // in_foreground false. iOS had suspended the app; nothing was slow.
    setAppState('background');
    reportApiError(axiosErr(null, '/api/bounties', 'get', 'ECONNABORTED'), null);
    reportApiError(axiosErr(null, '/api/bounties/my-posted', 'get', 'ECONNABORTED'), null);
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledTimes(2);
    for (const call of (captureMessage as jest.Mock).mock.calls) {
      expect(call[1].level).toBe('warning');
      expect(call[1].fingerprint).toEqual(['api-timeout-backgrounded']);
    }
  });

  it('a timeout in the foreground is still an issue for that endpoint', () => {
    reportApiError(axiosErr(null, '/api/bounties', 'get', 'ECONNABORTED'), null);
    expect(captureMessage).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
    const opts = (captureException as jest.Mock).mock.calls[0][1];
    expect(opts.fingerprint).toEqual(['api-error', 'GET', '/api/bounties', 'network']);
  });

  it('does not report a 4xx that is the product answering a person', () => {
    // OPTIO-MOBILE-10: a parent adding a child who already has an account.
    // OPTIO-MOBILE-15: an adult mistyping the SMS code. The screen shows the
    // server's sentence; Sentry has nothing to add.
    reportApiError(axiosErr(409, '/api/dependents/create', 'post'), 409);
    reportApiError(axiosErr(400, '/api/phone-verification/verify', 'post'), 400);
    expect(captureMessage).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
    // The same status anywhere else is still a contract warning.
    reportApiError(axiosErr(409, '/api/quests/123/start', 'post'), 409);
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('ignores a rejection with no config — not a failed request (OPTIO-MOBILE-6)', () => {
    // The transient-retry interceptor re-issues via api(cfg), so when the
    // retried request 401s and the refresh interceptor throws "No refresh
    // token" (an ordinary expired session), that plain Error comes back out
    // through this reporter with no config and no response. Filing it as a
    // network exception turned every logout on a flaky connection into a
    // Sentry error.
    reportApiError(new Error('No refresh token') as never, null);
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
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
