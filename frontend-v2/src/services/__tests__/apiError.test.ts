/**
 * Tests for extractApiError — the shared helper that maps thrown values
 * into sanitized, displayable API errors.
 */

import { extractApiError, isAxiosError } from '@/src/services/apiError';

type FakeAxiosError = {
  __isAxios: true;
  message: string;
  response?: { status: number; data: unknown };
};

function makeAxiosError(status: number | undefined, data: unknown, noResponse = false): FakeAxiosError {
  const err: FakeAxiosError = { __isAxios: true, message: 'boom' };
  if (!noResponse) err.response = { status: status ?? 500, data };
  return err;
}

describe('extractApiError', () => {
  it('unwraps string error bodies', () => {
    const parsed = extractApiError(makeAxiosError(400, { error: 'Bad input' }));
    expect(parsed.message).toBe('Bad input');
    expect(parsed.status).toBe(400);
    expect(parsed.isAuthError).toBe(false);
    expect(parsed.isNetworkError).toBe(false);
  });

  it('unwraps nested {error: {message, code}} bodies', () => {
    const parsed = extractApiError(
      makeAxiosError(422, { error: { message: 'Invalid email', code: 'INVALID_EMAIL' } }),
    );
    expect(parsed.message).toBe('Invalid email');
    expect(parsed.code).toBe('INVALID_EMAIL');
  });

  it('flags 401 as auth error', () => {
    expect(extractApiError(makeAxiosError(401, { error: 'Unauthorized' })).isAuthError).toBe(true);
  });

  it('flags no-response axios errors as network errors', () => {
    const parsed = extractApiError(makeAxiosError(undefined, undefined, true));
    expect(parsed.isNetworkError).toBe(true);
    expect(parsed.isAuthError).toBe(false);
    expect(parsed.message).toBe('Something went wrong. Please try again.');
  });

  it('strips stack traces and SQL from messages', () => {
    expect(extractApiError(makeAxiosError(500, { error: 'Traceback (most recent call last): ...' })).message)
      .toBe('Something went wrong. Please try again.');
    expect(extractApiError(makeAxiosError(500, { error: 'SELECT * FROM users where id=1' })).message)
      .toBe('Something went wrong. Please try again.');
  });

  it('falls back to custom message when body is empty', () => {
    expect(extractApiError(makeAxiosError(500, {}), 'Login failed').message).toBe('Login failed');
  });

  it('handles native Error objects', () => {
    expect(extractApiError(new Error('no network')).message).toBe('no network');
  });

  it('handles unknown non-error values', () => {
    expect(extractApiError('weird').message).toBe('Something went wrong. Please try again.');
    expect(extractApiError(null).message).toBe('Something went wrong. Please try again.');
  });

  it('rejects absurdly long messages', () => {
    const long = 'x'.repeat(500);
    expect(extractApiError(makeAxiosError(500, { error: long })).message)
      .toBe('Something went wrong. Please try again.');
  });
});

describe('isAxiosError', () => {
  it('recognizes axios errors', () => {
    expect(isAxiosError(makeAxiosError(500, {}))).toBe(true);
  });
  it('rejects plain errors', () => {
    expect(isAxiosError(new Error('x'))).toBe(false);
  });
});
