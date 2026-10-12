/**
 * Translation-extension DOM errors are dropped before they reach Sentry.
 *
 * Sentry 90aa8c18: "NotFoundError: Failed to execute 'insertBefore' on 'Node':
 * The node before which the new node is to be inserted is not a child of this
 * node." at /auth/callback, an anonymous user in Vietnam, React commit phase.
 * Page translation had rewritten the DOM React owned. The owner chose to keep
 * translation working, so the error is filtered rather than prevented.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const init = vi.fn()
vi.mock('@sentry/react', () => ({
  init: (...args) => init(...args),
  browserTracingIntegration: () => ({}),
  replayIntegration: () => ({}),
  captureException: vi.fn(),
  setUser: vi.fn(),
}))

const matches = (patterns, message) => patterns.some((p) => p.test(message))

describe('IGNORE_ERRORS', () => {
  beforeEach(() => {
    vi.resetModules()
    init.mockClear()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('matches the translation insertBefore and removeChild errors', async () => {
    const { IGNORE_ERRORS } = await import('./sentry')
    expect(matches(IGNORE_ERRORS,
      "NotFoundError: Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.",
    )).toBe(true)
    expect(matches(IGNORE_ERRORS,
      "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
    )).toBe(true)
  })

  it('does not swallow other errors', async () => {
    const { IGNORE_ERRORS } = await import('./sentry')
    expect(matches(IGNORE_ERRORS, "Failed to execute 'appendChild' on 'Node'")).toBe(false)
    expect(matches(IGNORE_ERRORS, 'API 500: POST /api/x from /')).toBe(false)
    expect(matches(IGNORE_ERRORS, "Cannot read properties of undefined (reading 'insertBefore')")).toBe(false)
  })

  it('is passed to Sentry.init', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o0.ingest.us.sentry.io/0')
    const { initSentry, IGNORE_ERRORS } = await import('./sentry')
    initSentry()
    expect(init).toHaveBeenCalledTimes(1)
    expect(init.mock.calls[0][0].ignoreErrors).toBe(IGNORE_ERRORS)
  })
})
