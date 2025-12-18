/**
 * Secure Authentication Service
 *
 * Handles authentication using secure httpOnly cookies instead of localStorage.
 * Provides methods for login, logout, registration, and session management.
 *
 * ✅ SECURITY FIX (P1-SEC-3): httpOnly CSRF token pattern
 * - CSRF tokens stored in memory via csrfTokenStore
 * - No non-httpOnly cookies (prevents XSS token theft)
 * - Flask-WTF validates headers against httpOnly session
 */
import api, { tokenStore, csrfTokenStore } from './api'

class AuthService {
  constructor() {
    this.user = null
    this.isAuthenticated = false
    this.listeners = new Set()

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
   * Store tokens in encrypted IndexedDB (survives page refresh but cleared on logout)
   */
  async setTokens(accessToken, refreshToken) {
    await tokenStore.setTokens(accessToken, refreshToken)
  }

  /**
   * Clear tokens from memory and encrypted IndexedDB
   */
  async clearTokens() {
    await tokenStore.clearTokens()
  }

  /**
   * Initialize CSRF token for secure requests
   *
   * ✅ SECURITY FIX (P1-SEC-3): Store CSRF token in memory (not cookies)
   * - Fetches token from API endpoint
   * - Stores in memory via csrfTokenStore
   * - Token sent in X-CSRF-Token header by request interceptor
   * - Flask-WTF validates against httpOnly session cookie
   */
  async initializeCSRF() {
    try {
      const response = await api.get('/api/auth/csrf-token')
      const token = response.data.csrf_token
      csrfTokenStore.set(token)
      console.log('[AuthService] CSRF token initialized (stored in memory)')
    } catch (error) {
      console.warn('[AuthService] Failed to initialize CSRF token:', error)
    }
  }

  /**
   * Get current CSRF token, refresh if needed
   */
  async getCSRFToken() {
    let token = csrfTokenStore.get()
    if (!token) {
      await this.initializeCSRF()
      token = csrfTokenStore.get()
    }
    return token
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
      await this.clearTokens()
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
      // CRITICAL: Clear tokens FIRST (synchronously) before API call
      // This prevents race conditions where page refresh happens before clearing

      // Step 1: Clear masquerade data (includes tokens)
      try {
        const { clearMasqueradeData } = await import('./masqueradeService.js')
        clearMasqueradeData()
      } catch (e) {
        console.warn('Failed to clear masquerade data:', e)
      }

      // Step 2: Clear encrypted IndexedDB tokens
      await this.clearTokens()

      // Step 3: Clear localStorage tokens explicitly (migration cleanup)
      localStorage.removeItem('user')
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')

      // Step 4: Verify tokens are cleared
      const accessStillExists = localStorage.getItem('access_token')
      const refreshStillExists = localStorage.getItem('refresh_token')
      if (accessStillExists || refreshStillExists) {
        console.error('[AuthService] CRITICAL: Tokens still exist after logout clearing!')
        // Force clear again
        localStorage.clear()
      }

      // Step 5: Now call backend logout (this clears cookies)
      await api.post('/api/auth/logout')

    } catch (error) {
      console.warn('[AuthService] Logout API call failed, but local cleanup completed:', error)
    } finally {
      // Stop token health monitoring
      this.stopTokenHealthMonitoring()

      // Always clear local state regardless of API success
      this.user = null
      this.isAuthenticated = false
      csrfTokenStore.clear()  // ✅ SECURITY FIX (P1-SEC-3): Clear CSRF token from memory

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
      await this.clearTokens()
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