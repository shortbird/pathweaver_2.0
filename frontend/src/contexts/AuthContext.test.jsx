import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './AuthContext'
import api, { tokenStore } from '../services/api'
import toast from 'react-hot-toast'

// Mock dependencies
vi.mock('../services/api')
vi.mock('react-hot-toast')
vi.mock('../utils/browserDetection', () => ({
  isSafari: vi.fn(() => false),
  isIOS: vi.fn(() => false),
  shouldUseAuthHeaders: vi.fn(() => false),
  setAuthMethodPreference: vi.fn(),
  testCookieSupport: vi.fn(() => true),
  logBrowserInfo: vi.fn(),
}))
vi.mock('../services/masqueradeService', () => ({
  clearMasqueradeData: vi.fn(),
}))
vi.mock('../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Helper to create a wrapper with all required providers
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
      },
    },
  })

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>{children}</AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock tokenStore
    tokenStore.init = vi.fn().mockResolvedValue(undefined)
    tokenStore.restoreTokens = vi.fn().mockResolvedValue(false)
    tokenStore.getAccessToken = vi.fn().mockReturnValue(null)
    tokenStore.setTokens = vi.fn().mockResolvedValue(undefined)
    tokenStore.clearTokens = vi.fn().mockResolvedValue(undefined)

    // Mock localStorage
    global.localStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Initialization', () => {
    it('initializes with loading state', () => {
      // Mock failed auth check
      api.get = vi.fn().mockRejectedValue(new Error('Not authenticated'))

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      expect(result.current.loading).toBe(true)
    })

    it('initializes tokenStore on mount', async () => {
      api.get = vi.fn().mockRejectedValue(new Error('Not authenticated'))

      renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(tokenStore.init).toHaveBeenCalled()
      })
    })

    it('restores user session if tokens exist', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        display_name: 'Test User',
        role: 'student',
      }

      tokenStore.getAccessToken = vi.fn().mockReturnValue('mock-token')
      api.get = vi.fn().mockResolvedValue({ data: mockUser })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
        expect(result.current.user).toEqual(mockUser)
        expect(result.current.isAuthenticated).toBe(true)
      })
    })

    it('clears tokens if session is invalid', async () => {
      tokenStore.getAccessToken = vi.fn().mockReturnValue('invalid-token')
      api.get = vi.fn().mockRejectedValue(new Error('Unauthorized'))

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(tokenStore.clearTokens).toHaveBeenCalled()
        expect(result.current.user).toBeNull()
        expect(result.current.loading).toBe(false)
      })
    })
  })

  describe('Login', () => {
    it('successfully logs in a user', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        display_name: 'Test User',
        role: 'student',
        created_at: new Date(Date.now() - 1000000).toISOString(), // Old user
      }

      const mockResponse = {
        data: {
          user: mockUser,
          session: { authenticated: true },
          app_access_token: 'access-token',
          app_refresh_token: 'refresh-token',
        },
      }

      api.get = vi.fn().mockRejectedValue(new Error('Not authenticated'))
      api.post = vi.fn().mockResolvedValue(mockResponse)
      toast.success = vi.fn()

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let loginResult
      await act(async () => {
        loginResult = await result.current.login('test@example.com', 'password123')
      })

      expect(loginResult.success).toBe(true)
      expect(tokenStore.setTokens).toHaveBeenCalledWith('access-token', 'refresh-token')
      expect(toast.success).toHaveBeenCalledWith('Welcome back!')
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })

    it('redirects to parent dashboard for parent role', async () => {
      const mockParent = {
        id: 'parent-123',
        email: 'parent@example.com',
        display_name: 'Parent User',
        role: 'parent',
        created_at: new Date(Date.now() - 1000000).toISOString(),
      }

      api.get = vi.fn().mockRejectedValue(new Error('Not authenticated'))
      api.post = vi.fn().mockResolvedValue({
        data: {
          user: mockParent,
          session: { authenticated: true },
          app_access_token: 'token',
          app_refresh_token: 'refresh',
        },
      })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.login('parent@example.com', 'password123')
      })

      expect(mockNavigate).toHaveBeenCalledWith('/parent/dashboard')
    })

    it('shows welcome message for new users', async () => {
      const mockNewUser = {
        id: 'user-123',
        email: 'new@example.com',
        display_name: 'New User',
        first_name: 'New',
        role: 'student',
        created_at: new Date().toISOString(), // Created just now
      }

      api.get = vi.fn().mockRejectedValue(new Error('Not authenticated'))
      api.post = vi.fn().mockResolvedValue({
        data: {
          user: mockNewUser,
          session: { authenticated: true },
          app_access_token: 'token',
          app_refresh_token: 'refresh',
        },
      })
      toast.success = vi.fn()

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.login('new@example.com', 'password123')
      })

      expect(toast.success).toHaveBeenCalledWith('Welcome to Optio, New!')
    })

    it('handles login failure with error message', async () => {
      api.get = vi.fn().mockRejectedValue(new Error('Not authenticated'))
      api.post = vi.fn().mockRejectedValue({
        response: {
          status: 401,
          data: { error: 'Invalid credentials' },
        },
      })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let loginResult
      await act(async () => {
        loginResult = await result.current.login('wrong@example.com', 'wrongpass')
      })

      expect(loginResult.success).toBe(false)
      expect(loginResult.error).toBe('Invalid credentials')
    })

    it('handles rate limiting errors', async () => {
      api.get = vi.fn().mockRejectedValue(new Error('Not authenticated'))
      api.post = vi.fn().mockRejectedValue({
        response: {
          status: 429,
          data: {},
        },
      })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let loginResult
      await act(async () => {
        loginResult = await result.current.login('test@example.com', 'password')
      })

      expect(loginResult.success).toBe(false)
      expect(loginResult.error).toContain('Too many login attempts')
    })

    it('handles server errors with toast notification', async () => {
      api.get = vi.fn().mockRejectedValue(new Error('Not authenticated'))
      api.post = vi.fn().mockRejectedValue({
        response: {
          status: 500,
          data: { error: 'Internal server error' },
        },
      })
      toast.error = vi.fn()

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.login('test@example.com', 'password')
      })

      expect(toast.error).toHaveBeenCalledWith('Internal server error')
    })
  })

  describe('Logout', () => {
    it('clears all authentication data on logout', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        display_name: 'Test User',
        role: 'student',
      }

      // Setup authenticated state
      tokenStore.getAccessToken = vi.fn().mockReturnValue('token')
      api.get = vi.fn().mockResolvedValue({ data: mockUser })
      api.post = vi.fn().mockResolvedValue({ data: { success: true } })
      toast.success = vi.fn()

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toBeTruthy()
      })

      // Logout
      await act(async () => {
        await result.current.logout()
      })

      expect(tokenStore.clearTokens).toHaveBeenCalled()
      expect(api.post).toHaveBeenCalledWith('/api/auth/logout', {})
      expect(toast.success).toHaveBeenCalledWith('Logged out successfully')
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })

    it('clears tokens even if backend logout fails', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'student',
      }

      tokenStore.getAccessToken = vi.fn().mockReturnValue('token')
      api.get = vi.fn().mockResolvedValue({ data: mockUser })
      api.post = vi.fn().mockRejectedValue(new Error('Network error'))
      toast.success = vi.fn()

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toBeTruthy()
      })

      await act(async () => {
        await result.current.logout()
      })

      // Should still clear tokens and navigate even on error
      expect(tokenStore.clearTokens).toHaveBeenCalled()
      expect(toast.success).toHaveBeenCalledWith('Logged out successfully')
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })

    it('clears localStorage tokens on logout', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'student',
      }

      tokenStore.getAccessToken = vi.fn().mockReturnValue('token')
      api.get = vi.fn().mockResolvedValue({ data: mockUser })
      api.post = vi.fn().mockResolvedValue({ data: { success: true } })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toBeTruthy()
      })

      await act(async () => {
        await result.current.logout()
      })

      expect(localStorage.removeItem).toHaveBeenCalledWith('access_token')
      expect(localStorage.removeItem).toHaveBeenCalledWith('refresh_token')
      expect(localStorage.removeItem).toHaveBeenCalledWith('user')
    })
  })

  describe('Register', () => {
    it('successfully registers a new user', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'new@example.com',
        display_name: 'New User',
        role: 'student',
      }

      api.get = vi.fn().mockRejectedValue(new Error('Not authenticated'))
      api.post = vi.fn().mockResolvedValue({
        data: {
          user: mockUser,
          session: { authenticated: true },
          app_access_token: 'token',
          app_refresh_token: 'refresh',
        },
      })
      toast.success = vi.fn()

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const userData = {
        email: 'new@example.com',
        password: 'SecurePass123!',
        display_name: 'New User',
      }

      let registerResult
      await act(async () => {
        registerResult = await result.current.register(userData)
      })

      expect(registerResult.success).toBe(true)
      expect(tokenStore.setTokens).toHaveBeenCalledWith('token', 'refresh')
      expect(toast.success).toHaveBeenCalledWith('Account created successfully!')
    })

    it('handles email verification required', async () => {
      api.get = vi.fn().mockRejectedValue(new Error('Not authenticated'))
      api.post = vi.fn().mockResolvedValue({
        data: {
          email_verification_required: true,
          message: 'Please verify your email',
        },
      })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.register({ email: 'test@example.com', password: 'pass' })
      })

      expect(mockNavigate).toHaveBeenCalledWith('/email-verification', {
        state: { email: 'test@example.com' },
      })
    })

    it('handles registration errors', async () => {
      api.get = vi.fn().mockRejectedValue(new Error('Not authenticated'))
      api.post = vi.fn().mockRejectedValue({
        response: {
          status: 400,
          data: { error: 'Email already exists' },
        },
      })
      toast.error = vi.fn()

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let registerResult
      await act(async () => {
        registerResult = await result.current.register({ email: 'test@example.com' })
      })

      expect(registerResult.success).toBe(false)
      expect(toast.error).toHaveBeenCalledWith('Email already exists')
    })
  })

  describe('Token Refresh', () => {
    it('successfully refreshes token', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'student',
      }

      tokenStore.getAccessToken = vi.fn().mockReturnValue('token')
      api.get = vi.fn().mockResolvedValue({ data: mockUser })
      api.post = vi.fn().mockResolvedValue({ status: 200 })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toBeTruthy()
      })

      let refreshResult
      await act(async () => {
        refreshResult = await result.current.refreshToken()
      })

      expect(refreshResult).toBe(true)
    })

    it('logs out user if token refresh fails', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'student',
      }

      tokenStore.getAccessToken = vi.fn().mockReturnValue('token')
      api.get = vi.fn().mockResolvedValueOnce({ data: mockUser })
      api.post = vi.fn()
        .mockRejectedValueOnce(new Error('Token expired')) // Refresh fails
        .mockResolvedValueOnce({ data: { success: true } }) // Logout succeeds

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toBeTruthy()
      })

      let refreshResult
      await act(async () => {
        refreshResult = await result.current.refreshToken()
      })

      expect(refreshResult).toBe(false)
      // Should trigger logout
      await waitFor(() => {
        expect(tokenStore.clearTokens).toHaveBeenCalled()
      })
    })
  })

  describe('User Management', () => {
    it('updates user data in cache', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        display_name: 'Test User',
      }

      tokenStore.getAccessToken = vi.fn().mockReturnValue('token')
      api.get = vi.fn().mockResolvedValue({ data: mockUser })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toBeTruthy()
      })

      const updatedUser = { ...mockUser, display_name: 'Updated Name' }

      act(() => {
        result.current.updateUser(updatedUser)
      })

      await waitFor(() => {
        expect(result.current.user.display_name).toBe('Updated Name')
      })
    })

    it('refreshes user data from server', async () => {
      const initialUser = {
        id: 'user-123',
        email: 'test@example.com',
        display_name: 'Original Name',
      }

      const updatedUser = {
        ...initialUser,
        display_name: 'Server Updated Name',
      }

      tokenStore.getAccessToken = vi.fn().mockReturnValue('token')
      api.get = vi.fn()
        .mockResolvedValueOnce({ data: initialUser })
        .mockResolvedValueOnce({ data: updatedUser })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user.display_name).toBe('Original Name')
      })

      await act(async () => {
        await result.current.refreshUser()
      })

      await waitFor(() => {
        expect(result.current.user.display_name).toBe('Server Updated Name')
      })
    })
  })

  describe('Computed Properties', () => {
    it('correctly identifies admin users', async () => {
      const adminUser = {
        id: 'admin-123',
        email: 'admin@example.com',
        role: 'admin',
      }

      tokenStore.getAccessToken = vi.fn().mockReturnValue('token')
      api.get = vi.fn().mockResolvedValue({ data: adminUser })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isAdmin).toBe(true)
      })
    })

    it('correctly identifies non-admin users', async () => {
      const studentUser = {
        id: 'user-123',
        email: 'student@example.com',
        role: 'student',
      }

      tokenStore.getAccessToken = vi.fn().mockReturnValue('token')
      api.get = vi.fn().mockResolvedValue({ data: studentUser })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isAdmin).toBe(false)
      })
    })

    it('provides isAuthenticated status', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'student',
      }

      tokenStore.getAccessToken = vi.fn().mockReturnValue('token')
      api.get = vi.fn().mockResolvedValue({ data: mockUser })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true)
      })
    })
  })
})
