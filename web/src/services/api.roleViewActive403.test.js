/**
 * A 403 with code 'role_view_active' (backend utils/auth/decorators.py).
 *
 * Apogee Central Florida's org admin, five Sentry 403s on
 * sis.optioeducation.com (/api/sis/dashboard, /api/sis/resources,
 * /api/sis/staff, partner-offerings, setup-status): a console tab held the
 * admin /me while the cookie, set from another tab by "Parent (my own
 * family)", said parent. The dashboard said only "Failed to load dashboard".
 * Same view as tickets 0f573318 (Arete: "the school admin button keeps going
 * back to family") and 43fee34b (Treehouse: "Can't toggle back to my admin
 * account after I switch to parent mode").
 *
 * On the SIS surface the client ends the view and reloads, once. On the
 * learning app the view is the admin's choice and stays. Never reported.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { AxiosError } from 'axios'
import api from './api'
import { captureException } from './sentry'
import { resetRoleViewExitGuard } from '../utils/roleViewExitGuard'

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))
vi.mock('../utils/browserDetection', () => ({ shouldUseAuthHeaders: () => false }))
vi.mock('./sentry', () => ({ captureException: vi.fn() }))

const surface = vi.hoisted(() => ({ current: 'sis' }))
vi.mock('../utils/appSurface', () => ({ getAppSurface: () => surface.current }))

const fail = (config, status, data) => {
  throw new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_REQUEST,
    config,
    null,
    { status, statusText: String(status), headers: {}, config, data }
  )
}
const ok = (config, data) => ({ data, status: 200, statusText: 'OK', headers: {}, config })

const ROLE_VIEW_403 = {
  error: { message: 'Required role: org_admin, campus_coordinator, superadmin', code: 'role_view_active' }
}
const PLAIN_403 = {
  error: { message: 'Required role: org_admin, campus_coordinator, superadmin', code: 'AUTHORIZATION_ERROR' }
}

let calls
let reload
const originalLocation = window.location

function adapterWith(body403) {
  return vi.fn(async (config) => {
    calls.push(`${config.method.toUpperCase()} ${config.url}`)
    if (config.url === '/api/auth/csrf-token') return ok(config, { csrf_token: 't' })
    if (config.url === '/api/role-view/exit') return ok(config, { success: true })
    return fail(config, 403, body403)
  })
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('role_view_active 403', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    calls = []
    surface.current = 'sis'
    resetRoleViewExitGuard()
    reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, pathname: '/', reload, assign: vi.fn() },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    resetRoleViewExitGuard()
  })

  it('on the SIS surface ends the view and reloads, once, and does not report it', async () => {
    api.defaults.adapter = adapterWith(ROLE_VIEW_403)
    await expect(api.get('/api/sis/dashboard')).rejects.toMatchObject({ response: { status: 403 } })
    await expect(api.get('/api/sis/resources')).rejects.toMatchObject({ response: { status: 403 } })
    await expect(api.get('/api/sis/staff')).rejects.toMatchObject({ response: { status: 403 } })
    await flush()
    await flush()
    expect(calls.filter((c) => c === 'POST /api/role-view/exit')).toHaveLength(1)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('on the learning app keeps the view and does not report it', async () => {
    surface.current = 'learning'
    api.defaults.adapter = adapterWith(ROLE_VIEW_403)
    await expect(api.get('/api/sis/dashboard')).rejects.toMatchObject({ response: { status: 403 } })
    await flush()
    expect(calls).not.toContain('POST /api/role-view/exit')
    expect(reload).not.toHaveBeenCalled()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('leaves a plain 403 alone: no exit, still reported', async () => {
    api.defaults.adapter = adapterWith(PLAIN_403)
    await expect(api.get('/api/sis/dashboard-plain')).rejects.toMatchObject({ response: { status: 403 } })
    await flush()
    expect(calls).not.toContain('POST /api/role-view/exit')
    expect(reload).not.toHaveBeenCalled()
    expect(captureException).toHaveBeenCalledTimes(1)
  })
})
