import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./api', () => {
  const tokenStoreMock = {
    init: vi.fn(),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null),
    getRefreshToken: vi.fn().mockReturnValue(null)
  }
  const csrfStoreMock = {
    get: vi.fn(),
    ensure: vi.fn().mockResolvedValue('csrf-1'),
    set: vi.fn(),
    clear: vi.fn()
  }
  return {
    default: { get: vi.fn(), post: vi.fn() },
    tokenStore: tokenStoreMock,
    csrfTokenStore: csrfStoreMock
  }
})

vi.mock('../utils/browserDetection', () => ({
  shouldUseAuthHeaders: vi.fn().mockReturnValue(false)
}))

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      setSession: vi.fn(),
      signInWithOAuth: vi.fn()
    }
  }
}))

import { AuthService } from './authService'
import api from './api'
import { supabase } from './supabaseClient'

describe('authService — C2: never persist user or tokens to localStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { csrf_token: 'csrf-1' } })
  })

  it('login does not write user data to localStorage', async () => {
    const svc = new AuthService()
    api.post.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.c', role: 'student' } }
    })

    const result = await svc.login('a@b.c', 'pw')

    expect(result.success).toBe(true)
    expect(localStorage.getItem('user')).toBeNull()
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()
  })

  it('register does not write user data to localStorage', async () => {
    const svc = new AuthService()
    api.post.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.c', role: 'student' } }
    })

    await svc.register({ email: 'a@b.c', password: 'pw' })

    expect(localStorage.getItem('user')).toBeNull()
  })

  it('getCurrentUser reads from memory only, never localStorage', () => {
    const svc = new AuthService()
    localStorage.setItem('user', JSON.stringify({ id: 'stale-from-old-build' }))

    expect(svc.getCurrentUser()).toBeNull()
  })
})

/**
 * Which backend endpoint an OAuth callback is exchanged at.
 *
 * The redirect query string carries the provider, but it is not guaranteed to
 * survive: a Supabase redirect allow-list can match the callback path and drop
 * everything after it. When it does, sending an Apple identity to the Google
 * endpoint is the failure we're protecting against, so the session's own
 * metadata is the backstop.
 */
describe('authService — OAuth callback provider resolution', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { csrf_token: 'csrf-1' } })
    api.post.mockResolvedValue({
      data: {
        user: { id: 'u1', email: 'a@b.c', role: 'student' },
        app_access_token: 'at',
        app_refresh_token: 'rt'
      }
    })
    supabase.auth.setSession.mockResolvedValue({ error: null })
  })

  const mockSession = (provider) => {
    supabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'supa-at',
          refresh_token: 'supa-rt',
          user: { app_metadata: { provider } }
        }
      },
      error: null
    })
  }

  it('exchanges at the Apple endpoint when the hint says apple', async () => {
    mockSession('apple')
    const svc = new AuthService()

    const result = await svc.handleOAuthCallback('apple', { accessToken: 'at', refreshToken: 'rt' })

    expect(result.success).toBe(true)
    expect(api.post).toHaveBeenCalledWith('/api/auth/apple/callback', expect.any(Object))
  })

  it('falls back to the session provider when the hint was lost', async () => {
    mockSession('apple')
    const svc = new AuthService()

    await svc.handleOAuthCallback(null, { accessToken: 'at', refreshToken: 'rt' })

    expect(api.post).toHaveBeenCalledWith('/api/auth/apple/callback', expect.any(Object))
  })

  it('defaults to Google when neither hint nor session names a provider', async () => {
    mockSession(undefined)
    const svc = new AuthService()

    await svc.handleOAuthCallback(null, { accessToken: 'at', refreshToken: 'rt' })

    expect(api.post).toHaveBeenCalledWith('/api/auth/google/callback', expect.any(Object))
  })

  it('keeps an explicit google hint even if the session says otherwise', async () => {
    // A user who signed up with Google and later linked Apple keeps
    // app_metadata.provider === 'google'; the button they pressed decides.
    mockSession('google')
    const svc = new AuthService()

    await svc.handleOAuthCallback('apple', { accessToken: 'at', refreshToken: 'rt' })

    expect(api.post).toHaveBeenCalledWith('/api/auth/apple/callback', expect.any(Object))
  })

  it('handleAppleCallback / handleGoogleCallback pin their own provider', async () => {
    mockSession('apple')
    const svc = new AuthService()

    await svc.handleGoogleCallback({ accessToken: 'at', refreshToken: 'rt' })
    expect(api.post).toHaveBeenCalledWith('/api/auth/google/callback', expect.any(Object))

    api.post.mockClear()
    await svc.handleAppleCallback({ accessToken: 'at', refreshToken: 'rt' })
    expect(api.post).toHaveBeenCalledWith('/api/auth/apple/callback', expect.any(Object))
  })
})
