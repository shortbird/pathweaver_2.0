import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { startMasquerade, exitMasquerade, clearMasqueradeData } from './masqueradeService'
import { tokenStore } from './api.js'
import { QueryClient, QueryObserver, onlineManager } from '@tanstack/react-query'
import {
  registerMasqueradeQueryClient,
  resetMasqueradeGate,
  isMasqueradeTransitioning,
  isMasqueradeActiveOrPending,
  handleMasqueradePageShow,
} from './masqueradeGate'

vi.mock('./api.js', () => ({
  tokenStore: {
    getAccessToken: vi.fn().mockReturnValue('admin-access-token'),
    getRefreshToken: vi.fn().mockReturnValue('admin-refresh-token'),
    setTokens: vi.fn().mockResolvedValue(undefined),
    clearTokens: vi.fn()
  }
}))

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

const FORBIDDEN_KEYS = ['original_admin_token', 'masquerade_token', 'access_token', 'refresh_token']

describe('masqueradeService — no tokens in localStorage (C1 regression)', () => {
  const originalLocation = window.location

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // startMasquerade calls window.location.href = ... — stub it out
    delete window.location
    window.location = { href: '' }
  })

  afterEach(() => {
    window.location = originalLocation
    resetMasqueradeGate()
  })

  const makeApi = (data) => ({
    post: vi.fn().mockResolvedValue({ data })
  })

  it('startMasquerade does not persist any auth token to localStorage', async () => {
    const api = makeApi({
      masquerade_token: 'mq-jwt',
      log_id: 'log-1',
      target_user: { id: 'u1', role: 'student', email: 'x@y.z' }
    })

    await startMasquerade('u1', 'debug', api)

    for (const key of FORBIDDEN_KEYS) {
      expect(localStorage.getItem(key)).toBeNull()
    }
    // Only non-sensitive UI state should exist
    expect(JSON.parse(localStorage.getItem('masquerade_state'))).toMatchObject({
      is_masquerading: true,
      log_id: 'log-1'
    })
    // Masquerade token must go through tokenStore, not localStorage
    expect(tokenStore.setTokens).toHaveBeenCalledWith('mq-jwt', 'admin-refresh-token')
  })

  it('exitMasquerade does not read or write token backups in localStorage', async () => {
    localStorage.setItem('masquerade_state', JSON.stringify({ is_masquerading: true }))

    const api = makeApi({
      access_token: 'new-admin-access',
      refresh_token: 'new-admin-refresh',
      user: { id: 'admin1', role: 'superadmin' }
    })

    const result = await exitMasquerade(api)

    expect(result.success).toBe(true)
    expect(tokenStore.setTokens).toHaveBeenCalledWith('new-admin-access', 'new-admin-refresh')
    expect(localStorage.getItem('masquerade_state')).toBeNull()
    for (const key of FORBIDDEN_KEYS) {
      expect(localStorage.getItem(key)).toBeNull()
    }
  })

  // SEC-03: a cookie-capable browser is sent no tokens in the body at all --
  // the masquerade rides the httpOnly cookie, and the admin's own cookies are
  // restored on exit. These two pin that the client copes with their absence
  // instead of writing `undefined` over its own session.
  it('startMasquerade leaves tokenStore alone when the body carries no token', async () => {
    const api = makeApi({
      log_id: 'log-1',
      target_user: { id: 'u1', role: 'student', email: 'x@y.z' }
    })

    const result = await startMasquerade('u1', 'debug', api)

    expect(result.success).toBe(true)
    expect(tokenStore.setTokens).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('masquerade_state'))).toMatchObject({
      is_masquerading: true,
      log_id: 'log-1'
    })
  })

  it('exitMasquerade clears in-memory tokens when the body carries none', async () => {
    localStorage.setItem('masquerade_state', JSON.stringify({ is_masquerading: true }))

    const api = makeApi({ user: { id: 'admin1', role: 'superadmin' } })

    const result = await exitMasquerade(api)

    expect(result.success).toBe(true)
    expect(tokenStore.setTokens).not.toHaveBeenCalled()
    // A leftover masquerade JWT would keep going out as a Bearer and outrank
    // the admin cookies the response just set.
    expect(tokenStore.clearTokens).toHaveBeenCalled()
    expect(localStorage.getItem('masquerade_state')).toBeNull()
  })

  it('clearMasqueradeData removes only masquerade_state (no token keys touched)', () => {
    localStorage.setItem('masquerade_state', '{}')
    localStorage.setItem('unrelated_key', 'keep-me')

    clearMasqueradeData()

    expect(localStorage.getItem('masquerade_state')).toBeNull()
    expect(localStorage.getItem('unrelated_key')).toBe('keep-me')
  })

  it('removed helpers are not exported (restoreMasqueradeToken, getMasqueradeToken)', async () => {
    const mod = await import('./masqueradeService')
    expect(mod.restoreMasqueradeToken).toBeUndefined()
    expect(mod.getMasqueradeToken).toBeUndefined()
  })
})

/**
 * Sentry 07b05221 (and 8eb5d44d, e85316a6, 66bcf347, 19e1c6b3, f69f317f):
 * "API 403: GET /api/sis/roster from /people after View as student".
 *
 * The masquerade POST succeeded and the session became the student's, but the
 * SIS People page stayed mounted until the navigation landed and its queries
 * kept refetching -- as the student, who is rightly refused the roster. Once
 * the switch is real, the page must stop asking.
 */
describe('startMasquerade stops the page it leaves from querying (07b05221)', () => {
  const originalLocation = window.location
  const target = { id: 's1', role: 'student', email: 's@y.z' }

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    resetMasqueradeGate()
    delete window.location
    window.location = { href: '', hostname: 'localhost', search: '', reload: vi.fn() }
  })

  afterEach(() => {
    window.location = originalLocation
    resetMasqueradeGate()
  })

  it('cancels in-flight queries and pauses new ones after a successful switch', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    registerMasqueradeQueryClient(client)
    const cancel = vi.spyOn(client, 'cancelQueries')

    await startMasquerade('s1', 'SIS admin view', {
      post: vi.fn().mockResolvedValue({ data: { log_id: 'l', target_user: target } })
    })

    expect(cancel).toHaveBeenCalled()
    expect(onlineManager.isOnline()).toBe(false)
    expect(isMasqueradeTransitioning()).toBe(true)

    // A roster refetch fired after the switch never reaches the network.
    const rosterFetch = vi.fn().mockResolvedValue({ roster: [] })
    const observer = new QueryObserver(client, { queryKey: ['sis', 'roster'], queryFn: rosterFetch })
    const unsubscribe = observer.subscribe(() => {})
    await Promise.resolve()
    expect(rosterFetch).not.toHaveBeenCalled()
    expect(observer.getCurrentResult().fetchStatus).toBe('paused')
    unsubscribe()
  })

  it('leaves queries running when the masquerade POST fails', async () => {
    const client = new QueryClient()
    registerMasqueradeQueryClient(client)
    const cancel = vi.spyOn(client, 'cancelQueries')

    const result = await startMasquerade('s1', '', {
      post: vi.fn().mockRejectedValue({ response: { status: 403, data: { error: 'no' } } })
    })

    expect(result.success).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
    expect(onlineManager.isOnline()).toBe(true)
    expect(isMasqueradeActiveOrPending()).toBe(false)
  })

  it('navigates once, to the landing a function resolves after success', async () => {
    const landing = vi.fn(() => 'https://app.optioeducation.com/dashboard')
    await startMasquerade('s1', '', {
      post: vi.fn().mockResolvedValue({ data: { log_id: 'l', target_user: target } })
    }, landing)
    expect(landing).toHaveBeenCalledWith(target)
    expect(window.location.href).toBe('https://app.optioeducation.com/dashboard')
  })

  it('does not resolve the landing when the switch fails', async () => {
    const landing = vi.fn(() => '/dashboard')
    await startMasquerade('s1', '', { post: vi.fn().mockRejectedValue(new Error('x')) }, landing)
    expect(landing).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
  })

  it('reloads an SIS page restored from the back/forward cache during a masquerade', () => {
    localStorage.setItem('masquerade_state', JSON.stringify({ is_masquerading: true }))
    localStorage.setItem('optio_surface', 'sis')
    expect(handleMasqueradePageShow({ persisted: true })).toBe(true)
    expect(window.location.reload).toHaveBeenCalled()
  })

  it('leaves a normal bfcache restore and a fresh load alone', () => {
    localStorage.setItem('optio_surface', 'sis')
    expect(handleMasqueradePageShow({ persisted: true })).toBe(false)
    localStorage.setItem('masquerade_state', JSON.stringify({ is_masquerading: true }))
    expect(handleMasqueradePageShow({ persisted: false })).toBe(false)
    expect(window.location.reload).not.toHaveBeenCalled()
  })
})
