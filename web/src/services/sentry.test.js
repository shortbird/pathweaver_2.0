import { describe, it, expect } from 'vitest'
import { initSentry, captureException, setSentryUser, toCaptureContext } from './sentry'

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

// What reaches the SDK. Plain facts go to `extra` as they always did; the keys
// the SDK reads (fingerprint, tags, level) pass through as themselves, so a
// caller can steer grouping. Passing those at the top level of `extra` would
// have made them data, not instructions.
describe('toCaptureContext', () => {
  it('is undefined for no context', () => {
    expect(toCaptureContext(undefined)).toBeUndefined()
    expect(toCaptureContext(null)).toBeUndefined()
    expect(toCaptureContext({})).toBeUndefined()
  })

  it('files plain facts under extra', () => {
    expect(toCaptureContext({ status: 403, endpoint: '/x' }))
      .toEqual({ extra: { status: 403, endpoint: '/x' } })
  })

  it('lets fingerprint, tags and level through and keeps the rest as extra', () => {
    expect(toCaptureContext({
      fingerprint: ['api-failure', '403'], tags: { page: '/inbox' }, level: 'warning', status: 403,
    })).toEqual({
      fingerprint: ['api-failure', '403'], tags: { page: '/inbox' }, level: 'warning',
      extra: { status: 403 },
    })
  })

  it('merges an explicit extra with the loose facts', () => {
    expect(toCaptureContext({ extra: { a: 1 }, b: 2 })).toEqual({ extra: { a: 1, b: 2 } })
  })
})
