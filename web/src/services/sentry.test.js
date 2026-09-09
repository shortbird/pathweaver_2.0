import { describe, it, expect } from 'vitest'
import { initSentry, captureException, setSentryUser } from './sentry'

// Without VITE_SENTRY_DSN (the default in tests), every export is a safe no-op.
describe('sentry service (no DSN)', () => {
  it('initSentry is idempotent and does not throw', () => {
    expect(() => initSentry()).not.toThrow()
    expect(() => initSentry()).not.toThrow()
  })

  it('captureException is a no-op without a DSN', () => {
    expect(() => captureException(new Error('boom'))).not.toThrow()
    expect(() => captureException(new Error('boom'), { extra: 1 })).not.toThrow()
  })

  it('setSentryUser accepts null and a user object', () => {
    expect(() => setSentryUser(null)).not.toThrow()
    expect(() => setSentryUser({ id: 'user-1' })).not.toThrow()
  })
})
