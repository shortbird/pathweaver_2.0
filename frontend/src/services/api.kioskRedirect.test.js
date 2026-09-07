/**
 * The kiosk pages must survive a dead session without bouncing to /login.
 *
 * Every page load runs /api/auth/me (AuthContext). On a shared classroom
 * device that is the normal state: a fresh iPad has no cookies at all, and a
 * student who just tapped "I'm done" has none either. The 401-refresh path
 * then fails for real, and the interceptor's "session over" branch sends the
 * browser to /login unless the current page is on its public-page list.
 *
 * /treehouse-kiosk was on that list; the org-generic /kiosk was not, so the
 * kiosk could never be set up: opening it on a new device went straight to
 * /login before the admin could paste the device code (found 2026-09-07,
 * the first time a non-Treehouse school asked for it).
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
  status, statusText: String(status), headers: {}, config, data
})

const reject = (config, status, data) => {
  throw new axios.AxiosError(
    `Request failed with status code ${status}`,
    axios.AxiosError.ERR_BAD_REQUEST,
    config,
    null,
    respond(config, status, data)
  )
}

// The session is gone: /me 401s and the refresh is rejected outright.
const deadSession = () => vi.fn(async (config) => {
  if (config.url === '/api/auth/refresh') reject(config, 401, { error: 'SESSION_EXPIRED' })
  reject(config, 401, { error: 'expired' })
})

let originalLocation

beforeEach(() => {
  vi.clearAllMocks()
  tokenStore.setTokens('stale-access', 'stale-refresh')
  originalLocation = window.location
  delete window.location
})

afterEach(() => {
  window.location = originalLocation
})

describe('401 refresh on the kiosk pages', () => {
  it.each(['/kiosk', '/kiosk/', '/treehouse-kiosk'])(
    '%s stays on the kiosk when the session is gone',
    async (path) => {
      window.location = { pathname: path, href: path }
      api.defaults.adapter = deadSession()

      await expect(api.get('/api/auth/me')).rejects.toMatchObject({ response: { status: 401 } })

      // The dead tokens are still discarded; only the navigation is skipped.
      expect(tokenStore.getAccessToken()).toBeNull()
      expect(window.location.href).toBe(path)
    }
  )

  it('a protected page still bounces to /login (control)', async () => {
    window.location = { pathname: '/dashboard', href: '/dashboard' }
    api.defaults.adapter = deadSession()

    await expect(api.get('/api/auth/me')).rejects.toMatchObject({ response: { status: 401 } })

    expect(window.location.href).toBe('/login')
  })

  it('a page that merely starts with "kiosk" is not exempt', async () => {
    window.location = { pathname: '/kioskadmin', href: '/kioskadmin' }
    api.defaults.adapter = deadSession()

    await expect(api.get('/api/auth/me')).rejects.toMatchObject({ response: { status: 401 } })

    expect(window.location.href).toBe('/login')
  })
})
