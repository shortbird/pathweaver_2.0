import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./api.js', () => ({
  tokenStore: {
    getAccessToken: vi.fn().mockReturnValue('admin-access-token'),
    getRefreshToken: vi.fn().mockReturnValue('admin-refresh-token'),
    setTokens: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

import { startMasquerade, exitMasquerade, clearMasqueradeData } from './masqueradeService'
import { tokenStore } from './api.js'

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
