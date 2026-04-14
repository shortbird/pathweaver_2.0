import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./api', () => {
  const tokenStoreMock = {
    init: vi.fn(),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null),
    getRefreshToken: vi.fn().mockReturnValue(null)
  }
  const csrfStoreMock = { get: vi.fn(), set: vi.fn(), clear: vi.fn() }
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

vi.mock('./supabaseClient', () => ({ supabase: { auth: {} } }))

import { AuthService } from './authService'
import api from './api'

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
