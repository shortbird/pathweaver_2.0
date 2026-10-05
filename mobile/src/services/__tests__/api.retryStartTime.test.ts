/**
 * The transient retry keeps the request's FIRST start stamp.
 *
 * Sentry 8873a580 / 495c9e3f / e7ae674f: "AxiosError: timeout of 15000ms
 * exceeded" -- one iOS user, three endpoints. The GET retry re-issues the same
 * config through `api(cfg)`, which re-ran the request interceptor and
 * overwrote `_startTime`. The original attempt had sat suspended while the
 * phone was in the background, but the fresh stamp post-dated that, so
 * leftForegroundDuring() said "foreground" and the timeout was filed as a
 * per-endpoint exception instead of the one backgrounded warning.
 */

import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { AppState } from 'react-native';

import { api, noteAppStateChange } from '@/src/services/api';
import { captureException, captureMessage } from '@/src/services/sentry';

jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: {
    restore: jest.fn(),
    setTokens: jest.fn().mockResolvedValue(undefined),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn().mockReturnValue('t'),
    getRefreshToken: jest.fn().mockReturnValue('r'),
  },
}));
jest.mock('@/src/services/diagnostics', () => ({ recordApiCall: jest.fn() }));
jest.mock('@/src/services/sentry', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

// jest-expo's AppState.currentState is a mock function, not a status string.
const setAppState = (value: string) =>
  Object.defineProperty(AppState, 'currentState', { value, configurable: true });

type Stamped = InternalAxiosRequestConfig & { _startTime?: number };

const originalAdapter = api.defaults.adapter;
let now = 1_000_000;

beforeEach(() => {
  jest.clearAllMocks();
  setAppState('active');
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

function timeout(config: InternalAxiosRequestConfig) {
  return new AxiosError('timeout of 15000ms exceeded', 'ECONNABORTED', config);
}

describe('transient GET retry and _startTime (Sentry 8873a580, 495c9e3f, e7ae674f)', () => {
  it('keeps the first _startTime when the retry re-runs the request interceptor', async () => {
    const stamps: (number | undefined)[] = [];
    api.defaults.adapter = async (config) => {
      stamps.push((config as Stamped)._startTime);
      now += 16_000; // each attempt "takes" past the 15s timeout
      throw timeout(config);
    };

    await expect(api.get('/api/quests/abc')).rejects.toThrow('timeout of 15000ms exceeded');

    expect(stamps).toHaveLength(2);
    expect(stamps[0]).toBe(1_000_000);
    expect(stamps[1]).toBe(stamps[0]);
  });

  it('reports "timeout of 15000ms exceeded" as the backgrounded warning when the FIRST attempt was suspended', async () => {
    now = 2_000_000;
    let call = 0;
    api.defaults.adapter = async (config) => {
      call += 1;
      if (call === 1) {
        // The phone sleeps while the first attempt is in flight, then wakes.
        now += 1_000;
        noteAppStateChange('background');
        now += 60_000;
        noteAppStateChange('active');
      } else {
        // The retry starts well after the app came back to the foreground.
        now += 16_000;
      }
      throw timeout(config);
    };

    await expect(api.get('/api/feed')).rejects.toThrow('timeout of 15000ms exceeded');

    expect(call).toBe(2);
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledWith(
      'API timeout while backgrounded',
      expect.objectContaining({ fingerprint: ['api-timeout-backgrounded'] }),
    );
  });

  it('still files a foreground timeout per endpoint (timeouts are not blanket-filtered)', async () => {
    now = 3_000_000;
    noteAppStateChange('active');
    api.defaults.adapter = async (config) => {
      now += 16_000;
      throw timeout(config);
    };

    await expect(api.get('/api/quests/abc')).rejects.toThrow('timeout of 15000ms exceeded');

    expect(captureException).toHaveBeenCalledTimes(1);
    expect((captureException as jest.Mock).mock.calls[0][1].fingerprint[0]).toBe('api-error');
  });
});
