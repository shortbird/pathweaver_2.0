import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

vi.mock('../utils/browserDetection', () => ({
  shouldUseAuthHeaders: () => false
}))

import { tokenStore } from './api'

const FORBIDDEN_KEYS = [
  'access_token',
  'refresh_token',
  'app_access_token',
  'app_refresh_token',
  'user',
  'session_encryption_key',
  'original_admin_token',
  'masquerade_token'
]

describe('tokenStore — C2 in-memory-only invariant', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    tokenStore.clearTokens()
  })

  it('setTokens stores access + refresh in memory only, never localStorage', () => {
    tokenStore.setTokens('access-jwt-abc', 'refresh-jwt-xyz')

    expect(tokenStore.getAccessToken()).toBe('access-jwt-abc')
    expect(tokenStore.getRefreshToken()).toBe('refresh-jwt-xyz')

    for (const key of FORBIDDEN_KEYS) {
      expect(localStorage.getItem(key)).toBeNull()
      expect(sessionStorage.getItem(key)).toBeNull()
    }
  })

  it('init() purges any pre-existing legacy token/user/encryption-key from localStorage', () => {
    localStorage.setItem('access_token', 'leftover')
    localStorage.setItem('refresh_token', 'leftover')
    localStorage.setItem('user', '{"id":"x"}')
    localStorage.setItem('session_encryption_key', '{"k":"y"}')
    sessionStorage.setItem('session_encryption_key', '{"k":"y"}')

    tokenStore.init()

    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(localStorage.getItem('session_encryption_key')).toBeNull()
    expect(sessionStorage.getItem('session_encryption_key')).toBeNull()
  })

  it('clearTokens wipes memory and re-purges legacy keys', () => {
    tokenStore.setTokens('a', 'b')
    localStorage.setItem('access_token', 'sneaky')

    tokenStore.clearTokens()

    expect(tokenStore.getAccessToken()).toBeNull()
    expect(tokenStore.getRefreshToken()).toBeNull()
    expect(localStorage.getItem('access_token')).toBeNull()
  })

  it('exposes no restoreTokens method (legacy IndexedDB hydration is gone)', () => {
    expect(tokenStore.restoreTokens).toBeUndefined()
  })
})
