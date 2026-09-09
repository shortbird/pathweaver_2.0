/**
 * The 401-refresh path must not log the user out on a recoverable failure.
 *
 * Reported symptom: "users are logged out when they close the app."
 *
 * Mechanism: the access cookie lives 15 minutes, the refresh cookie 30 days.
 * Any return visit after a short break therefore begins with a 401 on the very
 * first request, and the whole session rides on one refresh POST. The old
 * interceptor treated *every* failure of that POST as "session over" — it
 * cleared the in-memory tokens and set window.location to /login. So a cold
 * Render worker (502), a timeout, or the per-IP refresh throttle (429 — a
 * school computer lab is one NAT, i.e. one IP) discarded a refresh cookie the
 * backend would still have accepted for weeks.
 *
 * These tests pin the two halves of the fix: retry the transient case, and only
 * end the session on a 401/403 from /api/auth/refresh.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

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
import api, { tokenStore } from './api'

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

// A network error / timeout: axios rejects with no `response` at all.
const rejectNetwork = (config) => {
  throw new axios.AxiosError(
    'Network Error',
    axios.AxiosError.ERR_NETWORK,
    config,
    null,
    undefined
  )
}

let originalLocation

beforeEach(() => {
  vi.clearAllMocks()
  tokenStore.setTokens('stale-access', 'stale-refresh')
  originalLocation = window.location
  // jsdom's location is not writable; swap in a plain object so we can observe
  // whether the interceptor tried to navigate to /login.
  delete window.location
  window.location = { pathname: '/dashboard', href: '/dashboard' }
})

afterEach(() => {
  window.location = originalLocation
})

describe('401 refresh — recoverable failures keep the session', () => {
  it('retries a 502 on refresh and completes the original request', async () => {
    const calls = []
    api.defaults.adapter = vi.fn(async (config) => {
      calls.push(config.url)
      if (config.url === '/api/auth/refresh') {
        // Cold Render worker on the first attempt, healthy on the retry.
        const attempts = calls.filter((u) => u === '/api/auth/refresh').length
        if (attempts === 1) reject(config, 502, { error: 'Bad Gateway' })
        return respond(config, 200, { access_token: 'new-a', refresh_token: 'new-r' })
      }
      // The protected request 401s once, then succeeds with the new token.
      const attempts = calls.filter((u) => u === '/api/me').length
      if (attempts === 1) reject(config, 401, { error: 'expired' })
      return respond(config, 200, { ok: true })
    })

    const result = await api.get('/api/me')

    expect(result.data).toEqual({ ok: true })
    expect(calls).toEqual(['/api/me', '/api/auth/refresh', '/api/auth/refresh', '/api/me'])
    expect(tokenStore.getAccessToken()).toBe('new-a')
    expect(window.location.href).toBe('/dashboard') // never bounced to login
  })

  it('keeps tokens and stays on the page when refresh fails with a 5xx twice', async () => {
    api.defaults.adapter = vi.fn(async (config) => {
      if (config.url === '/api/auth/refresh') reject(config, 503, { error: 'unavailable' })
      reject(config, 401, { error: 'expired' })
    })

    await expect(api.get('/api/me')).rejects.toMatchObject({ response: { status: 503 } })

    // The refresh cookie is still good — nothing may be thrown away over a 503.
    expect(tokenStore.getAccessToken()).toBe('stale-access')
    expect(tokenStore.getRefreshToken()).toBe('stale-refresh')
    expect(window.location.href).toBe('/dashboard')
  })

  it('keeps tokens on a 429 from the per-IP refresh throttle', async () => {
    // One school NAT is one IP; the throttle can fire on wholly legitimate
    // traffic and must never log a classroom out.
    api.defaults.adapter = vi.fn(async (config) => {
      if (config.url === '/api/auth/refresh') reject(config, 429, { error: 'rate limited' })
      reject(config, 401, { error: 'expired' })
    })

    await expect(api.get('/api/me')).rejects.toMatchObject({ response: { status: 429 } })

    expect(tokenStore.getRefreshToken()).toBe('stale-refresh')
    expect(window.location.href).toBe('/dashboard')
  })

  it('keeps tokens on a network error / timeout during refresh', async () => {
    api.defaults.adapter = vi.fn(async (config) => {
      if (config.url === '/api/auth/refresh') rejectNetwork(config)
      reject(config, 401, { error: 'expired' })
    })

    await expect(api.get('/api/me')).rejects.toMatchObject({ code: axios.AxiosError.ERR_NETWORK })

    expect(tokenStore.getRefreshToken()).toBe('stale-refresh')
    expect(window.location.href).toBe('/dashboard')
  })

  it('does not retry a 429 — only 5xx and network errors are retriable', async () => {
    const calls = []
    api.defaults.adapter = vi.fn(async (config) => {
      calls.push(config.url)
      if (config.url === '/api/auth/refresh') reject(config, 429, { error: 'rate limited' })
      reject(config, 401, { error: 'expired' })
    })

    await expect(api.get('/api/me')).rejects.toMatchObject({ response: { status: 429 } })
    expect(calls.filter((u) => u === '/api/auth/refresh')).toHaveLength(1)
  })
})

describe('401 refresh — a rejected refresh token still ends the session', () => {
  it('clears tokens and redirects to /login on a 401 from refresh', async () => {
    api.defaults.adapter = vi.fn(async (config) => {
      if (config.url === '/api/auth/refresh') reject(config, 401, { error: 'SESSION_EXPIRED' })
      reject(config, 401, { error: 'expired' })
    })

    await expect(api.get('/api/me')).rejects.toMatchObject({ response: { status: 401 } })

    expect(tokenStore.getAccessToken()).toBeNull()
    expect(tokenStore.getRefreshToken()).toBeNull()
    expect(window.location.href).toBe('/login')
  })

  it('clears tokens and redirects on a 403 from refresh', async () => {
    api.defaults.adapter = vi.fn(async (config) => {
      if (config.url === '/api/auth/refresh') reject(config, 403, { error: 'SESSION_INVALIDATED' })
      reject(config, 401, { error: 'expired' })
    })

    await expect(api.get('/api/me')).rejects.toMatchObject({ response: { status: 403 } })

    expect(tokenStore.getAccessToken()).toBeNull()
    expect(window.location.href).toBe('/login')
  })

  it('does not redirect away from a public page even when the session is over', async () => {
    window.location = { pathname: '/portfolio/abc', href: '/portfolio/abc' }
    api.defaults.adapter = vi.fn(async (config) => {
      if (config.url === '/api/auth/refresh') reject(config, 401, { error: 'SESSION_EXPIRED' })
      reject(config, 401, { error: 'expired' })
    })

    await expect(api.get('/api/me')).rejects.toMatchObject({ response: { status: 401 } })
    expect(window.location.href).toBe('/portfolio/abc')
  })

  // The public-page list matched '/poe' exactly, so every deeper POE page
  // bounced anonymous visitors to /login on the app-load session check — the
  // key-gated showcase link looked broken to the POE leadership it was sent to.
  it.each(['/poe', '/poe/showcase'])('stays put on the public POE page %s', async (pathname) => {
    window.location = { pathname, href: pathname }
    api.defaults.adapter = vi.fn(async (config) => {
      if (config.url === '/api/auth/refresh') reject(config, 401, { error: 'SESSION_EXPIRED' })
      reject(config, 401, { error: 'expired' })
    })

    await expect(api.get('/api/me')).rejects.toMatchObject({ response: { status: 401 } })
    expect(window.location.href).toBe(pathname)
  })
})
