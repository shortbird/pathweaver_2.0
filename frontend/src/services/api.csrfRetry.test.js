/**
 * CSRF auto-recovery in the response interceptor (July 2026).
 *
 * The backend rejects cookie-authenticated mutating requests whose CSRF token
 * is missing or expired with 400 + csrf_required. The in-memory token is
 * fetched once at app load and expires server-side after 1 hour, so a
 * long-lived tab — or a request racing the initial fetch, e.g. auto-verifying
 * a Stripe payment right after the redirect back (iCreate registration,
 * 2026-07-21) — used to surface "CSRF token missing or invalid" to the user.
 * The interceptor must fetch a fresh token and retry once, and report
 * unrecovered rejections to Sentry.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

vi.mock('../utils/browserDetection', () => ({
  shouldUseAuthHeaders: () => false
}))

vi.mock('./sentry', () => ({
  captureException: vi.fn()
}))

import axios from 'axios'
import api, { csrfTokenStore } from './api'
import { captureException } from './sentry'

const CSRF_REJECTION = {
  error: 'CSRF token missing or invalid',
  message: 'Refresh the page and try again.',
  csrf_required: true
}

const respond = (config, status, data) => ({
  status,
  statusText: String(status),
  headers: {},
  config,
  data
})

// A custom adapter bypasses axios's settle()/validateStatus, so non-2xx
// responses must be thrown the way axios would reject them.
const reject = (config, status, data) => {
  throw new axios.AxiosError(
    `Request failed with status code ${status}`,
    axios.AxiosError.ERR_BAD_REQUEST,
    config,
    null,
    respond(config, status, data)
  )
}

describe('CSRF auto-recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    csrfTokenStore.clear()
  })

  it('fetches a fresh token and retries once on 400 csrf_required', async () => {
    csrfTokenStore.set('stale-token')
    const calls = []
    api.defaults.adapter = vi.fn(async (config) => {
      calls.push(config)
      if (config.url === '/api/auth/csrf-token') {
        return respond(config, 200, { csrf_token: 'fresh-token' })
      }
      // First attempt rejected, retry succeeds.
      const attempts = calls.filter(c => c.url === '/api/things').length
      if (attempts === 1) reject(config, 400, CSRF_REJECTION)
      return respond(config, 200, { ok: true })
    })

    const result = await api.post('/api/things', {})

    expect(result.data).toEqual({ ok: true })
    const urls = calls.map(c => c.url)
    expect(urls).toEqual(['/api/things', '/api/auth/csrf-token', '/api/things'])
    // The retry must carry the fresh token, not the stale one.
    expect(calls[2].headers['X-CSRF-Token']).toBe('fresh-token')
    expect(csrfTokenStore.get()).toBe('fresh-token')
    expect(captureException).not.toHaveBeenCalled()
  })

  it('reports to Sentry and gives up when the fresh token is rejected too', async () => {
    api.defaults.adapter = vi.fn(async (config) => {
      if (config.url === '/api/auth/csrf-token') {
        return respond(config, 200, { csrf_token: 'fresh-token' })
      }
      reject(config, 400, CSRF_REJECTION)
    })

    await expect(api.post('/api/things', {})).rejects.toMatchObject({
      response: { status: 400 }
    })
    // One retry only — no infinite loop — and the failure is surfaced.
    expect(api.defaults.adapter.mock.calls
      .filter(([c]) => c.url === '/api/things')).toHaveLength(2)
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('does not intercept ordinary 400s', async () => {
    api.defaults.adapter = vi.fn(async (config) =>
      reject(config, 400, { error: 'validation failed' })
    )

    await expect(api.post('/api/things', {})).rejects.toMatchObject({
      response: { status: 400 }
    })
    expect(api.defaults.adapter).toHaveBeenCalledTimes(1)
    expect(captureException).not.toHaveBeenCalled()
  })
})
