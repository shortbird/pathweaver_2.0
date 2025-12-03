/**
 * Secure Authentication Service
 *
 * Handles authentication using secure httpOnly cookies instead of localStorage.
 * Provides methods for login, logout, registration, and session management.
 */
import api, { tokenStore } from './api'

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
   * Get current access token for Authorization header
   */
  getAccessToken() {
    return tokenStore.getAccessToken()
  }

  /**
   * Get current refresh token
   */
  getRefreshToken() {
    return tokenStore.getRefreshToken()
  }

  /**
   * Store tokens in memory (cleared on tab close for security)
   */
  setTokens(accessToken, refreshToken) {
    tokenStore.setTokens(accessToken, refreshToken)
  }

  /**
   * Clear tokens from memory
   */
  clearTokens() {
    tokenStore.clearTokens()
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

      // ✅ SECURITY FIX (January 2025): httpOnly cookies ONLY
      // Tokens are set by backend in httpOnly cookies - NO token storage in frontend
      // This prevents XSS token theft

      // Store user data for quick access (non-sensitive only - no tokens!)
      if (this.user) {
        localStorage.setItem('user', JSON.stringify(this.user))
      }

      // Start token health monitoring
      this.startTokenHealthMonitoring()

      this.notifyListeners()
      return { success: true, user: this.user }

    } catch (error) {
      this.user = null
      this.isAuthenticated = false
      this.clearTokens()
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

      // ✅ SECURITY FIX (January 2025): httpOnly cookies ONLY
      // Tokens are set by backend in httpOnly cookies - NO token storage in frontend
      // This prevents XSS token theft

      // Store user data for quick access (non-sensitive only - no tokens!)
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
      // Stop token health monitoring
      this.stopTokenHealthMonitoring()

      // Always clear local state regardless of API success
      this.user = null
      this.isAuthenticated = false
      this.csrfToken = null
      this.clearTokens() // Clear memory tokens

      // Clear localStorage data
      localStorage.removeItem('user')
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
      // ✅ SECURITY FIX (January 2025): httpOnly cookies ONLY
      // Refresh token sent automatically via httpOnly cookie
      const response = await api.post('/api/auth/refresh', {})

      if (response.status === 200) {
        // Backend automatically rotates tokens in httpOnly cookies
        // No token handling needed in frontend

        // Session refreshed successfully, check current user
        await this.checkAuthStatus()
        return true
      }

      return false
    } catch (error) {
      this.user = null
      this.isAuthenticated = false
      this.clearTokens()
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
   * Check token health (compatibility with server secret)
   */
  async checkTokenHealth() {
    try {
      const response = await api.get('/api/auth/token-health')
      return response.data
    } catch (error) {
      console.error('Token health check failed:', error)
      return { compatible: false, reason: 'Network error', authenticated: false }
    }
  }

  /**
   * Start token health monitoring (polls every 5 minutes)
   */
  startTokenHealthMonitoring() {
    // Only monitor if user is authenticated
    if (!this.isAuthenticated) {
      return
    }

    // Check immediately on start
    this.checkTokenHealth().then(health => {
      if (!health.compatible && health.authenticated === false && this.isAuthenticated) {
        console.warn('Token incompatibility detected - logging out user')
        this.logout()
        window.location.href = '/login?session_expired=true'
      }
    })

    // Set up interval (5 minutes)
    this.healthCheckInterval = setInterval(async () => {
      if (!this.isAuthenticated) {
        this.stopTokenHealthMonitoring()
        return
      }

      const health = await this.checkTokenHealth()

      if (!health.compatible && health.authenticated === false) {
        // Token is incompatible with server - force re-login
        console.warn('Token incompatibility detected during health check - logging out user')
        this.stopTokenHealthMonitoring()
        this.logout()
        window.location.href = '/login?session_expired=true'
      }
    }, 5 * 60 * 1000) // 5 minutes
  }

  /**
   * Stop token health monitoring
   */
  stopTokenHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  /**
   * Initialize auth service and check current session
   */
  async initialize() {
    // First check if we have cached user data
    this.getCurrentUser()

    // Then verify with server
    await this.checkAuthStatus()

    // Start token health monitoring if authenticated
    if (this.isAuthenticated) {
      this.startTokenHealthMonitoring()
    }

    return this.isAuthenticated
  }
}

// Create and export singleton instance
const authService = new AuthService()

export default authService

// Also export the class for testing
export { AuthService }