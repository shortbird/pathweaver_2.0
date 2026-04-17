/**
 * Tests for the Sentry wrapper shim. Without a DSN configured (the default
 * in tests) initSentry falls back to no-ops, and the public API must remain
 * safe to call anyway.
 */

import { initSentry, captureException, captureMessage, setSentryUser } from '@/src/services/sentry';

describe('sentry shim', () => {
  const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  afterEach(() => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
  });

  it('initSentry is idempotent and safe without DSN', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    expect(() => initSentry()).not.toThrow();
    expect(() => initSentry()).not.toThrow();
  });

  it('captureException is a no-op without init', () => {
    expect(() => captureException(new Error('boom'))).not.toThrow();
    expect(() => captureException(new Error('boom'), { where: 'test' })).not.toThrow();
  });

  it('captureMessage is a no-op without init', () => {
    expect(() => captureMessage('hi')).not.toThrow();
  });

  it('setSentryUser accepts null and object', () => {
    expect(() => setSentryUser(null)).not.toThrow();
    expect(() => setSentryUser({ id: 'abc', email: 'a@b.co' })).not.toThrow();
  });
});
