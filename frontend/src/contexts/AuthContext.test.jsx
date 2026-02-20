import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './AuthContext'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('../services/api', () => {
  const tokenStoreMock = {
    init: vi.fn().mockResolvedValue(undefined),
    restoreTokens: vi.fn().mockResolvedValue(false),
    getAccessToken: vi.fn().mockReturnValue(null),
    setTokens: vi.fn().mockResolvedValue(undefined),
    clearTokens: vi.fn().mockResolvedValue(undefined)
  }
  return {
    default: {
      get: vi.fn(),
      post: vi.fn()
    },
    tokenStore: tokenStoreMock
  }
})

vi.mock('../utils/retryHelper', () => ({
  retryWithBackoff: vi.fn((fn) => fn())
}))

vi.mock('../utils/queryKeys', () => ({
  queryKeys: {
    user: {
      profile: (key) => ['user', 'profile', key]
    }
  }
}))

vi.mock('../utils/browserDetection', () => ({
  isSafari: vi.fn().mockReturnValue(false),
  isIOS: vi.fn().mockReturnValue(false),
  shouldUseAuthHeaders: vi.fn().mockReturnValue(false),
  setAuthMethodPreference: vi.fn(),
  testCookieSupport: vi.fn(),
  logBrowserInfo: vi.fn()
}))

vi.mock('../services/masqueradeService', () => ({
  clearMasqueradeData: vi.fn()
}))

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

import api, { tokenStore } from '../services/api'
import toast from 'react-hot-toast'
import { clearMasqueradeData } from '../services/masqueradeService'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: 0 } }
  })
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    // Default: no session, /api/auth/me fails
    api.get.mockRejectedValue({ response: { status: 401 } })
  })

  // --- Initialization ---
  describe('initialization', () => {
    it('starts in loading state', () => {
      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })
      // loading should be true initially (before checkSession resolves)
      expect(result.current.loading).toBe(true)
    })

    it('finishes loading after session check', async () => {
      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
    })

    it('is not authenticated when no session', async () => {
      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('restores session from token store', async () => {
      tokenStore.getAccessToken.mockReturnValue('valid-token')
      tokenStore.restoreTokens.mockResolvedValue(true)
      api.get.mockResolvedValue({ data: { id: '1', role: 'student', email: 'test@test.com' } })

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user).toEqual(expect.objectContaining({ id: '1', role: 'student' }))
    })

    it('clears invalid tokens on failed session restore', async () => {
      tokenStore.getAccessToken.mockReturnValue('expired-token')
      tokenStore.restoreTokens.mockResolvedValue(true)
      api.get.mockRejectedValue({ response: { status: 401 } })

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
      expect(tokenStore.clearTokens).toHaveBeenCalled()
      expect(result.current.isAuthenticated).toBe(false)
    })
  })

  // --- Login ---
  describe('login', () => {
    it('sets user and navigates on successful login', async () => {
      const loginUser = {
        id: '1',
        role: 'student',
        first_name: 'Test',
        email: 'test@test.com',
        created_at: new Date(Date.now() - 86400000).toISOString() // not new user
      }
      api.post.mockResolvedValue({
        data: {
          user: loginUser,
          session: { authenticated: true },
          app_access_token: 'at',
          app_refresh_token: 'rt'
        }
      })

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(result.current.loading).toBe(false))

      let loginResult
      await act(async () => {
        loginResult = await result.current.login('test@test.com', 'password')
      })

      expect(loginResult.success).toBe(true)
      expect(tokenStore.setTokens).toHaveBeenCalledWith('at', 'rt')
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })

    it('navigates parent to /parent/dashboard', async () => {
      api.post.mockResolvedValue({
        data: {
          user: { id: '1', role: 'parent', first_name: 'P', created_at: new Date(Date.now() - 86400000).toISOString() },
          session: { authenticated: true },
          app_access_token: 'at',
          app_refresh_token: 'rt'
        }
      })

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.login('p@test.com', 'pass')
      })

      expect(mockNavigate).toHaveBeenCalledWith('/parent/dashboard')
    })

    it('navigates observer to /observer/feed', async () => {
      api.post.mockResolvedValue({
        data: {
          user: { id: '1', role: 'observer', first_name: 'O', created_at: new Date(Date.now() - 86400000).toISOString() },
          session: { authenticated: true },
          app_access_token: 'at',
          app_refresh_token: 'rt'
        }
      })

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.login('o@test.com', 'pass')
      })

      expect(mockNavigate).toHaveBeenCalledWith('/observer/feed')
    })

    it('shows welcome toast for new users', async () => {
      api.post.mockResolvedValue({
        data: {
          user: { id: '1', role: 'student', first_name: 'NewUser', created_at: new Date().toISOString() },
          session: { authenticated: true },
          app_access_token: 'at',
          app_refresh_token: 'rt'
        }
      })

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.login('new@test.com', 'pass')
      })

      expect(toast.success).toHaveBeenCalledWith('Welcome to Optio, NewUser!')
    })

    it('shows welcome back toast for existing users', async () => {
      api.post.mockResolvedValue({
        data: {
          user: { id: '1', role: 'student', first_name: 'Old', created_at: '2024-01-01T00:00:00Z' },
          session: { authenticated: true },
          app_access_token: 'at',
          app_refresh_token: 'rt'
        }
      })

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.login('old@test.com', 'pass')
      })

      expect(toast.success).toHaveBeenCalledWith('Welcome back!')
    })

    it('returns error on 401', async () => {
      api.post.mockRejectedValue({
        response: { status: 401, data: {} }
      })

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      let loginResult
      await act(async () => {
        loginResult = await result.current.login('bad@test.com', 'wrong')
      })

      expect(loginResult.success).toBe(false)
      expect(loginResult.error).toContain('Incorrect email or password')
    })

    it('returns error on 429 rate limit', async () => {
      api.post.mockRejectedValue({
        response: { status: 429, data: {} }
      })

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      let loginResult
      await act(async () => {
        loginResult = await result.current.login('test@test.com', 'pass')
      })

      expect(loginResult.success).toBe(false)
      expect(loginResult.error).toContain('Too many login attempts')
    })

    it('returns error on 500 server error', async () => {
      api.post.mockRejectedValue({
        response: { status: 500, data: {} }
      })

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      let loginResult
      await act(async () => {
        loginResult = await result.current.login('test@test.com', 'pass')
      })

      expect(loginResult.success).toBe(false)
      expect(loginResult.error).toContain('Server error')
    })

    it('returns connection error when no response', async () => {
      api.post.mockRejectedValue(new Error('Network Error'))

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      let loginResult
      await act(async () => {
        loginResult = await result.current.login('test@test.com', 'pass')
      })

      expect(loginResult.success).toBe(false)
      expect(loginResult.error).toContain('Connection error')
    })
  })

  // --- Register ---
  describe('register', () => {
    it('navigates to email verification when required', async () => {
      const { retryWithBackoff } = await import('../utils/retryHelper')
      retryWithBackoff.mockImplementation((fn) => fn())

      api.post.mockResolvedValue({
        data: {
          email_verification_required: true,
          message: 'Check your email'
        }
      })

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.register({ email: 'new@test.com', password: 'pass' })
      })

      expect(mockNavigate).toHaveBeenCalledWith('/email-verification', { state: { email: 'new@test.com' } })
    })

    it('sets user and navigates on direct registration', async () => {
      const { retryWithBackoff } = await import('../utils/retryHelper')
      retryWithBackoff.mockImplementation((fn) => fn())

      api.post.mockResolvedValue({
        data: {
          user: { id: '1', role: 'student' },
          session: { authenticated: true },
          app_access_token: 'at',
          app_refresh_token: 'rt'
        }
      })

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.register({ email: 'new@test.com', password: 'pass' })
      })

      expect(tokenStore.setTokens).toHaveBeenCalledWith('at', 'rt')
      expect(toast.success).toHaveBeenCalledWith('Account created successfully!')
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })

  // --- Logout ---
  describe('logout', () => {
    it('clears tokens and navigates to /', async () => {
      // Start authenticated
      tokenStore.getAccessToken.mockReturnValue('valid-token')
      tokenStore.restoreTokens.mockResolvedValue(true)
      api.get.mockResolvedValue({ data: { id: '1', role: 'student' } })
      api.post.mockResolvedValue({})

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.logout()
      })

      expect(clearMasqueradeData).toHaveBeenCalled()
      expect(tokenStore.clearTokens).toHaveBeenCalled()
      expect(toast.success).toHaveBeenCalledWith('Logged out successfully')
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })

    it('clears localStorage tokens', async () => {
      localStorage.setItem('access_token', 'old')
      localStorage.setItem('refresh_token', 'old')
      localStorage.setItem('user', 'old')
      api.post.mockResolvedValue({})

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.logout()
      })

      expect(localStorage.getItem('access_token')).toBeNull()
      expect(localStorage.getItem('refresh_token')).toBeNull()
      expect(localStorage.getItem('user')).toBeNull()
    })

    it('completes logout even if backend call fails', async () => {
      api.post.mockRejectedValue(new Error('Network error'))

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.logout()
      })

      expect(mockNavigate).toHaveBeenCalledWith('/')
      expect(toast.success).toHaveBeenCalledWith('Logged out successfully')
    })
  })

  // --- Role resolution ---
  describe('getEffectiveRole / computed properties', () => {
    async function renderWithUser(userData) {
      tokenStore.getAccessToken.mockReturnValue('valid-token')
      tokenStore.restoreTokens.mockResolvedValue(true)
      api.get.mockResolvedValue({ data: userData })

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))
      return result
    }

    it('returns superadmin for superadmin role', async () => {
      const result = await renderWithUser({ id: '1', role: 'superadmin' })
      expect(result.current.effectiveRole).toBe('superadmin')
      expect(result.current.isSuperadmin).toBe(true)
    })

    it('returns student for platform student', async () => {
      const result = await renderWithUser({ id: '1', role: 'student' })
      expect(result.current.effectiveRole).toBe('student')
    })

    it('returns org_role for org_managed user', async () => {
      const result = await renderWithUser({ id: '1', role: 'org_managed', org_role: 'advisor' })
      expect(result.current.effectiveRole).toBe('advisor')
    })

    it('returns first org_roles entry for multi-role org user', async () => {
      const result = await renderWithUser({ id: '1', role: 'org_managed', org_roles: ['org_admin', 'advisor'] })
      expect(result.current.effectiveRole).toBe('org_admin')
    })

    it('isAdmin true for org_admin', async () => {
      const result = await renderWithUser({ id: '1', role: 'org_managed', org_role: 'org_admin' })
      expect(result.current.isAdmin).toBe(true)
    })

    it('isAdmin true for superadmin', async () => {
      const result = await renderWithUser({ id: '1', role: 'superadmin' })
      expect(result.current.isAdmin).toBe(true)
    })

    it('isAuthenticated is true when user exists', async () => {
      const result = await renderWithUser({ id: '1', role: 'student' })
      expect(result.current.isAuthenticated).toBe(true)
    })

    it('hasRole returns true for matching role', async () => {
      const result = await renderWithUser({ id: '1', role: 'student' })
      expect(result.current.hasRole('student')).toBe(true)
    })

    it('hasRole returns false for non-matching role', async () => {
      const result = await renderWithUser({ id: '1', role: 'student' })
      expect(result.current.hasRole('parent')).toBe(false)
    })

    it('hasAnyRole returns true when any role matches', async () => {
      const result = await renderWithUser({ id: '1', role: 'student' })
      expect(result.current.hasAnyRole(['student', 'parent'])).toBe(true)
    })

    it('hasAnyRole returns false when no roles match', async () => {
      const result = await renderWithUser({ id: '1', role: 'student' })
      expect(result.current.hasAnyRole(['parent', 'advisor'])).toBe(false)
    })
  })
})
