/**
 * Secure Authentication Service
 *
 * Handles authentication using secure httpOnly cookies instead of localStorage.
 * Provides methods for login, logout, registration, and session management.
 */
import api from './api'

class AuthService {
  constructor() {
    this.user = null
    this.isAuthenticated = false
    this.listeners = new Set()
    this.csrfToken = null

    // Initialize CSRF token on service creation
    this.initializeCSRF()
  }

  /**
   * Initialize CSRF token for secure requests
   */
  async initializeCSRF() {
    try {
      const response = await api.get('/csrf-token')
      this.csrfToken = response.data.csrf_token
    } catch (error) {
      console.warn('Failed to initialize CSRF token:', error)
    }
  }

  /**
   * Get current CSRF token, refresh if needed
   */
  async getCSRFToken() {
    if (!this.csrfToken) {
      await this.initializeCSRF()
    }
    return this.csrfToken
  }

  /**
   * Add listener for authentication state changes
   */
  addAuthListener(callback) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * Notify all listeners of auth state change
   */
  notifyListeners() {
    this.listeners.forEach(callback => callback({
      isAuthenticated: this.isAuthenticated,
      user: this.user
    }))
  }

  /**
   * Check if user is currently authenticated
   */
  async checkAuthStatus() {
    try {
      const response = await api.get('/api/auth/me')
      this.user = response.data
      this.isAuthenticated = true
      this.notifyListeners()
      return true
    } catch (error) {
      this.user = null
      this.isAuthenticated = false
      this.notifyListeners()
      return false
    }
  }

  /**
   * Login with email and password
   */
  async login(email, password) {
    try {
      const response = await api.post('/api/auth/login', {
        email,
        password
      })

      this.user = response.data.user
      this.isAuthenticated = true

      // Store tokens in localStorage as fallback for incognito mode
      // Incognito browsers block SameSite=None cookies on cross-site requests
      // Tokens can be at top level or nested in session object
      const accessToken = response.data.access_token || response.data.session?.access_token
      const refreshToken = response.data.refresh_token || response.data.session?.refresh_token

        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        accessTokenLength: accessToken?.length,
        responseKeys: Object.keys(response.data)
      })

      if (accessToken && refreshToken) {
        localStorage.setItem('access_token', accessToken)
        localStorage.setItem('refresh_token', refreshToken)
      } else {
        console.warn('[AuthService] No tokens to store!', { accessToken, refreshToken })
      }

      // Store user data for quick access (not sensitive data)
      if (this.user) {
        localStorage.setItem('user', JSON.stringify(this.user))
      }

      this.notifyListeners()
      return { success: true, user: this.user }

    } catch (error) {
      this.user = null
      this.isAuthenticated = false
      this.notifyListeners()

      const errorMessage = error.response?.data?.error || 'Login failed'
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Register new user account
   */
  async register(userData) {
    try {
      const response = await api.post('/api/auth/register', userData)

      if (response.data.email_verification_required) {
        return {
          success: true,
          emailVerificationRequired: true,
          message: response.data.message
        }
      }

      this.user = response.data.user
      this.isAuthenticated = true

      // Store tokens for incognito mode fallback
      if (response.data.session) {
        if (response.data.session.access_token) {
          localStorage.setItem('access_token', response.data.session.access_token)
        }
        if (response.data.session.refresh_token) {
          localStorage.setItem('refresh_token', response.data.session.refresh_token)
        }
      }

      // Store user data for quick access
      if (this.user) {
        localStorage.setItem('user', JSON.stringify(this.user))
      }

      this.notifyListeners()
      return { success: true, user: this.user }

    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Registration failed'
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Logout current user
   */
  async logout() {
    try {
      await api.post('/api/auth/logout')
    } catch (error) {
      console.warn('Logout API call failed:', error)
    } finally {
      // Always clear local state regardless of API success
      this.user = null
      this.isAuthenticated = false
      this.csrfToken = null

      // Clear user data from localStorage
      localStorage.removeItem('user')

      // Clear any legacy tokens
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')

      this.notifyListeners()
    }
  }

  /**
   * Refresh authentication session
   */
  async refreshSession() {
    try {
      const response = await api.post('/api/auth/refresh')

      if (response.status === 200) {
        // Session refreshed successfully, check current user
        await this.checkAuthStatus()
        return true
      }

      return false
    } catch (error) {
      this.user = null
      this.isAuthenticated = false
      this.notifyListeners()
      return false
    }
  }

  /**
   * Resend email verification
   */
  async resendVerification(email) {
    try {
      const response = await api.post('/api/auth/resend-verification', { email })
      return { success: true, message: response.data.message }
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to resend verification'
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Get current user (from memory or localStorage cache)
   */
  getCurrentUser() {
    if (this.user) {
      return this.user
    }

    // Try to get from localStorage cache
    try {
      const userData = localStorage.getItem('user')
      if (userData) {
        this.user = JSON.parse(userData)
        this.isAuthenticated = true
        return this.user
      }
    } catch (error) {
      console.warn('Failed to parse user data from localStorage:', error)
      localStorage.removeItem('user')
    }

    return null
  }

  /**
   * Check if user is authenticated (synchronous)
   */
  isUserAuthenticated() {
    return this.isAuthenticated
  }

  /**
   * Get user role
   */
  getUserRole() {
    return this.user?.role || 'student'
  }

  /**
   * Check if user has specific role
   */
  hasRole(role) {
    return this.getUserRole() === role
  }

  /**
   * Check if user is admin
   */
  isAdmin() {
    return ['admin', 'educator'].includes(this.getUserRole())
  }

  /**
   * Get user subscription tier
   */
  getSubscriptionTier() {
    return this.user?.subscription_tier || 'free'
  }

  /**
   * Check if user has paid tier
   */
  hasPaidTier() {
    const tier = this.getSubscriptionTier()
    return ['creator', 'visionary', 'enterprise', 'premium', 'supported', 'academy'].includes(tier)
  }

  /**
   * Initialize auth service and check current session
   */
  async initialize() {
    // First check if we have cached user data
    this.getCurrentUser()

    // Then verify with server
    await this.checkAuthStatus()

    return this.isAuthenticated
  }
}

// Create and export singleton instance
const authService = new AuthService()

export default authService

// Also export the class for testing
export { AuthService }