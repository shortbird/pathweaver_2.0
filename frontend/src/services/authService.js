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
import { shouldUseAuthHeaders } from '../utils/browserDetection'
import logger from '../utils/logger'
import { supabase } from './supabaseClient'

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
      logger.debug('[AuthService] CSRF token initialized (stored in memory)')
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

      // ✅ HYBRID AUTH (January 2025): httpOnly cookies + Authorization headers
      // For browsers that block cross-site cookies (Safari/iOS/Firefox), store tokens
      // for Authorization header usage. Otherwise, use httpOnly cookies only.
      if (shouldUseAuthHeaders()) {
        const appAccessToken = response.data.app_access_token
        const appRefreshToken = response.data.app_refresh_token

        if (appAccessToken && appRefreshToken) {
          await this.setTokens(appAccessToken, appRefreshToken)
          logger.debug('[AuthService] Tokens stored for Authorization header usage (Safari/iOS/Firefox)')
        }
      }

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

      // ✅ HYBRID AUTH (January 2025): httpOnly cookies + Authorization headers
      // For browsers that block cross-site cookies (Safari/iOS/Firefox), store tokens
      // for Authorization header usage. Otherwise, use httpOnly cookies only.
      if (shouldUseAuthHeaders()) {
        const appAccessToken = response.data.app_access_token
        const appRefreshToken = response.data.app_refresh_token

        if (appAccessToken && appRefreshToken) {
          await this.setTokens(appAccessToken, appRefreshToken)
          logger.debug('[AuthService] Tokens stored for Authorization header usage (Safari/iOS/Firefox)')
        }
      }

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
   * Sign in with Google OAuth
   *
   * Initiates the Google OAuth flow via Supabase.
   * User will be redirected to Google, then back to /auth/callback
   */
  async signInWithGoogle() {
    try {
      logger.debug('[AuthService] Initiating Google OAuth flow')

      // Get the callback URL based on current environment
      const redirectTo = `${window.location.origin}/auth/callback`

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      })

      if (error) {
        logger.error('[AuthService] Google OAuth error:', error)
        return { success: false, error: error.message }
      }

      // The user will be redirected to Google
      // After authentication, they'll be redirected to /auth/callback
      return { success: true, redirecting: true }

    } catch (error) {
      logger.error('[AuthService] Google OAuth unexpected error:', error)
      return { success: false, error: 'Failed to initiate Google sign-in' }
    }
  }

  /**
   * Handle Google OAuth callback
   *
   * Called from the /auth/callback page after Google redirects back.
   * Exchanges Supabase token for our app session.
   *
   * @param {Object|null} capturedTokens - Pre-captured tokens (workaround for clock skew)
   * @param {string} capturedTokens.accessToken - Pre-captured access token
   * @param {string} capturedTokens.refreshToken - Pre-captured refresh token
   */
  async handleGoogleCallback(capturedTokens = null) {
    try {
      logger.debug('[AuthService] Processing Google OAuth callback')

      // First, try to use pre-captured tokens (fixes clock skew issues where Supabase rejects tokens)
      let accessToken = capturedTokens?.accessToken
      let refreshToken = capturedTokens?.refreshToken

      // If not captured, try to get tokens from URL hash (Supabase puts them there after OAuth redirect)
      if (!accessToken) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        accessToken = hashParams.get('access_token')
        refreshToken = hashParams.get('refresh_token')
      }

      // Log token source for debugging
      const tokenSource = capturedTokens?.accessToken ? 'pre-captured' : 'URL hash'
      logger.debug(`[AuthService] Using tokens from: ${tokenSource}`)

      // If tokens are available, set the session first
      if (accessToken) {
        logger.debug('[AuthService] Found tokens, setting session')
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })
        if (setSessionError) {
          logger.error('[AuthService] Failed to set session from hash:', setSessionError)
        }
      }

      // Now get the session (should be set now)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) {
        logger.error('[AuthService] Failed to get Supabase session:', sessionError)
        return { success: false, error: 'Failed to complete Google sign-in' }
      }

      // Use tokens from session, or fallback to hash params
      if (!session && !accessToken) {
        logger.error('[AuthService] No session found after OAuth callback')
        return { success: false, error: 'No authentication session found' }
      }

      const finalAccessToken = session?.access_token || accessToken
      const finalRefreshToken = session?.refresh_token || refreshToken

      console.log('[AuthService] Token sources - hash:', !!accessToken, 'session:', !!session?.access_token)
      console.log('[AuthService] Final token present:', !!finalAccessToken)

      // Exchange Supabase token for our app session
      const response = await api.post('/api/auth/google/callback', {
        access_token: finalAccessToken,
        refresh_token: finalRefreshToken
      })

      // Check if TOS acceptance is required (new users)
      if (response.data.requires_tos_acceptance) {
        logger.debug('[AuthService] TOS acceptance required for new Google user')
        return {
          success: true,
          requiresTosAcceptance: true,
          tosAcceptanceToken: response.data.tos_acceptance_token,
          user: response.data.user,
          isNewUser: true
        }
      }

      this.user = response.data.user
      this.isAuthenticated = true

      // Store tokens for Safari/iOS/Firefox if needed
      if (shouldUseAuthHeaders()) {
        const appAccessToken = response.data.app_access_token
        const appRefreshToken = response.data.app_refresh_token

        if (appAccessToken && appRefreshToken) {
          await this.setTokens(appAccessToken, appRefreshToken)
          logger.debug('[AuthService] Google OAuth tokens stored for Authorization header usage')
        }
      }

      // Store user data for quick access
      if (this.user) {
        localStorage.setItem('user', JSON.stringify(this.user))
      }

      // Start token health monitoring
      this.startTokenHealthMonitoring()

      this.notifyListeners()

      return {
        success: true,
        user: this.user,
        isNewUser: response.data.is_new_user
      }

    } catch (error) {
      logger.error('[AuthService] Google callback error:', error)
      console.error('[AuthService] Full error response:', error.response?.data)
      const errorMessage = error.response?.data?.message || 'Failed to complete Google sign-in'
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Accept Terms of Service for Google OAuth users
   *
   * Called after user explicitly accepts TOS in the modal.
   * Completes the registration process and establishes session.
   *
   * @param {string} tosAcceptanceToken - Token from OAuth callback
   * @returns {Object} - { success, user, error }
   */
  async acceptTos(tosAcceptanceToken) {
    try {
      logger.debug('[AuthService] Accepting TOS for Google OAuth user')

      const response = await api.post('/api/auth/google/accept-tos', {
        tos_acceptance_token: tosAcceptanceToken,
        accepted_tos: true,
        accepted_privacy: true
      })

      this.user = response.data.user
      this.isAuthenticated = true

      // Store tokens for Safari/iOS/Firefox if needed
      if (shouldUseAuthHeaders()) {
        const appAccessToken = response.data.app_access_token
        const appRefreshToken = response.data.app_refresh_token

        if (appAccessToken && appRefreshToken) {
          await this.setTokens(appAccessToken, appRefreshToken)
          logger.debug('[AuthService] TOS acceptance tokens stored')
        }
      }

      // Store user data for quick access
      if (this.user) {
        localStorage.setItem('user', JSON.stringify(this.user))
      }

      // Start token health monitoring
      this.startTokenHealthMonitoring()

      this.notifyListeners()

      return {
        success: true,
        user: this.user
      }

    } catch (error) {
      logger.error('[AuthService] TOS acceptance error:', error)
      const errorMessage = error.response?.data?.message || 'Failed to accept Terms of Service'
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
      // IMPORTANT: Must include empty body {} for CSRF validation
      await api.post('/api/auth/logout', {})

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
      // ✅ HYBRID AUTH (January 2025): httpOnly cookies + Authorization headers
      // For browsers that use Authorization headers (Safari/iOS/Firefox), send refresh_token in body
      // Otherwise, refresh token sent automatically via httpOnly cookie
      const requestBody = {}
      if (shouldUseAuthHeaders()) {
        const refreshToken = this.getRefreshToken()
        if (refreshToken) {
          requestBody.refresh_token = refreshToken
        }
      }

      const response = await api.post('/api/auth/refresh', requestBody)

      if (response.status === 200) {
        // For browsers using Authorization headers, store new tokens
        if (shouldUseAuthHeaders() && response.data.access_token && response.data.refresh_token) {
          await this.setTokens(response.data.access_token, response.data.refresh_token)
          logger.debug('[AuthService] Tokens refreshed and stored for Authorization header usage (Safari/iOS/Firefox)')
        }

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
    return ['org_admin', 'superadmin'].includes(this.getUserRole())
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
    // Initialize token store for encrypted IndexedDB
    await tokenStore.init()

    // For browsers using Authorization headers (Safari/iOS/Firefox), restore tokens from IndexedDB
    if (shouldUseAuthHeaders()) {
      await tokenStore.restoreTokens()
      logger.debug('[AuthService] Tokens restored from IndexedDB for Authorization header usage')
    }

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