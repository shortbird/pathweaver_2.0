import React, { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api, { tokenStore } from '../services/api'
import { retryWithBackoff } from '../utils/retryHelper'
import { queryKeys } from '../utils/queryKeys'
import { isSafari, isIOS, shouldUseAuthHeaders, setAuthMethodPreference, testCookieSupport, logBrowserInfo } from '../utils/browserDetection'
import { clearMasqueradeData } from '../services/masqueradeService'
import logger from '../utils/logger'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [loginTimestamp, setLoginTimestamp] = useState(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Use React Query to manage user data instead of localStorage
  const { data: user, isLoading: userLoading, refetch: refetchUser } = useQuery({
    queryKey: queryKeys.user.profile('current'),
    queryFn: async () => {
      const response = await api.get('/api/auth/me')
      return response.data
    },
    enabled: false, // ✅ SPARK SSO FIX: Disable auto-fetching - we manually update cache in checkSession()
    staleTime: 5 * 60 * 1000, // Consider user data fresh for 5 minutes
    cacheTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    retry: 1, // Only retry once for auth checks
  })

  useEffect(() => {
    // ✅ SAFARI FIX + P0 SECURITY FIX: Detect browser and initialize secure token storage
    const checkSession = async () => {
      try {
        // Initialize secure token store (migrates from localStorage if needed)
        await tokenStore.init()

        // Log browser detection info (development only)
        logBrowserInfo()

        // STEP 1: Restore tokens from encrypted IndexedDB (survives page refresh)
        const tokensRestored = await tokenStore.restoreTokens()

        // STEP 2: Check if we have tokens (either restored or in memory)
        const hasTokens = !!tokenStore.getAccessToken()

        if (hasTokens) {
          // We have tokens, verify with backend
          const response = await api.get('/api/auth/me')
          if (response.data) {
            // ✅ SPARK SSO FIX: Update React Query cache IMMEDIATELY with user data
            // This prevents PrivateRoute from redirecting to /login before user data loads
            queryClient.setQueryData(queryKeys.user.profile('current'), response.data)

            setSession({ authenticated: true })
            setLoginTimestamp(Date.now())

            // ✅ SAFARI FIX: Mark that we're using auth headers successfully
            setAuthMethodPreference('headers')
          }
        } else {
          // No tokens available - try cookie-based auth (localhost fallback)
          try {
            const response = await api.get('/api/auth/me')
            if (response.data) {
              // ✅ SPARK SSO FIX: Update React Query cache for cookie-based auth too
              queryClient.setQueryData(queryKeys.user.profile('current'), response.data)

              setSession({ authenticated: true })
              setLoginTimestamp(Date.now())

              // ✅ SAFARI FIX: Mark that cookies are working
              setAuthMethodPreference('cookies')
            }
          } catch (cookieError) {
            // ✅ SAFARI FIX: Cookie auth failed - this is expected on Safari
            // User needs to log in, and we'll use auth headers automatically
            if (isSafari() || isIOS()) {
              logger.debug('[AuthContext] Safari/iOS detected - will use Authorization headers on next login')
            }
            // ✅ FIX: Explicitly set user to null so components know auth check is complete
            queryClient.setQueryData(queryKeys.user.profile('current'), null)
            setSession(null)
          }
        }
      } catch (error) {
        // Token invalid/expired - clear and require login
        await tokenStore.clearTokens()
        // ✅ FIX: Explicitly set user to null so components know auth check is complete
        queryClient.setQueryData(queryKeys.user.profile('current'), null)
        setSession(null)
      } finally {
        setLoading(false)
      }
    }

    checkSession()
  }, [])

  const login = async (email, password) => {
    try {
      const response = await api.post('/api/auth/login', { email, password })
      const { user: loginUser, session: loginSession, app_access_token, app_refresh_token } = response.data

      // ✅ P0 SECURITY FIX: Store app tokens in encrypted IndexedDB for Authorization headers
      // This is the CRITICAL piece that was missing!
      if (app_access_token && app_refresh_token) {
        await tokenStore.setTokens(app_access_token, app_refresh_token)
      }

      setSession({ authenticated: true })
      setLoginTimestamp(Date.now()) // Force refresh of data

      // Update React Query cache with fresh user data
      queryClient.setQueryData(queryKeys.user.profile('current'), loginUser)

      // Check if user is new (created within the last 5 minutes)
      const createdAt = new Date(loginUser.created_at)
      const now = new Date()
      const timeDiff = now - createdAt
      const isNewUser = timeDiff < 5 * 60 * 1000 // 5 minutes in milliseconds

      if (isNewUser) {
        toast.success(`Welcome to Optio, ${loginUser.first_name}!`)
      } else {
        toast.success('Welcome back!')
      }

      // Redirect based on user role
      const redirectPath = loginUser.role === 'parent' ? '/parent/dashboard' : '/dashboard'
      navigate(redirectPath)

      return { success: true }
    } catch (error) {
      // Handle nested error structure from backend
      let message = 'Login failed. Please check your email and password and try again.'

      // First priority: Use the exact error message from backend
      if (error.response?.data?.error) {
        if (typeof error.response.data.error === 'string') {
          message = error.response.data.error
        } else if (error.response.data.error.message) {
          message = error.response.data.error.message
        }
      }
      // Fallback messages for specific status codes without detailed error
      else if (error.response?.status === 429) {
        message = 'Too many login attempts. Please wait a moment before trying again.'
      } else if (error.response?.status === 401) {
        message = 'Incorrect email or password. Please check your credentials and try again.'
      } else if (error.response?.status === 503) {
        message = 'Service temporarily unavailable. Please try again in a few moments.'
      } else if (error.response?.status === 500) {
        message = 'Server error. Please contact support if this continues.'
      } else if (!error.response) {
        message = 'Connection error. Please check your internet connection and try again.'
      }

      // Log the error for debugging
      console.error('Login error:', {
        status: error.response?.status,
        message: message,
        originalError: error.response?.data
      })

      // Don't show toast for expected errors (4xx) - let the form handle display
      // Only show toast for unexpected server errors (5xx)
      if (error.response?.status >= 500) {
        toast.error(message)
      }

      return { success: false, error: message }
    }
  }

  const register = async (userData) => {
    try {
      
      // Use retry logic for registration to handle temporary service issues
      const response = await retryWithBackoff(
        () => api.post('/api/auth/register', userData),
        5, // more retries for cold starts
        3000, // 3 second initial delay for cold starts
        true // show progress in console
      )
      const { user, session, message, email_verification_required } = response.data

      // Handle email verification required case (rate limit or email confirmation)
      if (email_verification_required || message) {
        // Navigate to email verification page with user's email
        navigate('/email-verification', { state: { email: userData.email } })
        return { success: true }
      }

      if (session) {
        // ✅ P0 SECURITY FIX: Extract and store tokens from registration response
        const { app_access_token, app_refresh_token } = response.data
        if (app_access_token && app_refresh_token) {
          await tokenStore.setTokens(app_access_token, app_refresh_token)
        }

        setSession({ authenticated: true })
        setLoginTimestamp(Date.now()) // Force refresh of data

        // Update React Query cache with fresh user data
        queryClient.setQueryData(queryKeys.user.profile('current'), user)
        
        // Track registration completion for Meta Pixel
        try {
          if (typeof fbq !== 'undefined') {
            fbq('track', 'CompleteRegistration', {
              content_name: 'User Registration',
              value: 0.00,
              currency: 'USD'
            });
          }
        } catch (error) {
          console.error('Meta Pixel tracking error:', error);
        }

        toast.success('Account created successfully!')

        // Redirect based on user role
        const redirectPath = user.role === 'parent' ? '/parent/dashboard' : '/dashboard'
        navigate(redirectPath)
      } else {
        // Email verification required - redirect to verification page
        navigate('/email-verification', { state: { email: userData.email } })
      }
      
      return { success: true }
    } catch (error) {
      
      // Handle nested error structure from backend
      let message = 'Registration failed'
      
      // Handle specific error codes
      if (error.response?.status === 503) {
        message = 'Service temporarily unavailable. Please try again in a few moments.'
      } else if (error.response?.status === 500) {
        message = 'Server error. Please try again later or contact support if this continues.'
      } else if (error.response?.status === 429) {
        message = 'Too many registration attempts. Please wait a few minutes and try again.'
      } else if (error.response?.status === 400) {
        // Handle 400 Bad Request - validation errors
        if (error.response?.data?.error) {
          if (typeof error.response.data.error === 'string') {
            message = error.response.data.error
          } else if (error.response.data.error.message) {
            message = error.response.data.error.message
          }
        } else if (error.response?.data?.message) {
          message = error.response.data.message
        } else {
          message = 'Invalid registration data. Please check all fields and try again.'
        }
      } else if (error.response?.data?.error) {
        if (typeof error.response.data.error === 'string') {
          message = error.response.data.error
        } else if (error.response.data.error.message) {
          message = error.response.data.error.message
        }
      } else if (!error.response) {
        message = 'Connection error. Please check your internet connection and try again.'
      }
      
      toast.error(message)
      return { success: false, error: message }
    }
  }

  const logout = async () => {
    try {
      // CRITICAL: Clear tokens FIRST before API call
      // This prevents race conditions where page refresh happens before clearing

      // Step 1: Clear masquerade data (includes tokens)
      clearMasqueradeData()

      // Step 2: Clear encrypted IndexedDB tokenStore
      await tokenStore.clearTokens()

      // Step 3: Clear localStorage (migration cleanup)
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user')

      // Step 4: Now call backend logout (this clears cookies)
      await api.post('/api/auth/logout', {})

    } catch (error) {
      // Continue with logout even if backend call fails
      console.warn('[AuthContext] Backend logout failed, but local cleanup completed:', error)
    } finally {
      // Step 6: Clear React state
      setSession(null)
      setLoginTimestamp(null)

      // Step 7: Clear React Query cache
      queryClient.clear()

      toast.success('Logged out successfully')
      navigate('/')
    }
  }

  const refreshToken = async () => {
    try {
      const response = await api.post('/api/auth/refresh', {}, {
        headers: {
          'Content-Type': undefined // Remove default content-type
        }
      })

      if (response.status === 200) {
        setSession({ authenticated: true })
        return true
      }
    } catch (error) {
      await logout()
      return false
    }
  }

  const updateUser = (userData) => {
    // Update React Query cache instead of localStorage
    queryClient.setQueryData(queryKeys.user.profile('current'), userData)
  }

  const refreshUser = async () => {
    if (!user?.id || !session?.authenticated) {
      return false
    }

    try {
      // Refetch user data using React Query
      await refetchUser()
      return true
    } catch (error) {
      console.error('Failed to refresh user data:', error)
      return false
    }
  }

  const value = {
    user,
    session,
    loading: loading || userLoading,
    login,
    register,
    logout,
    refreshToken,
    updateUser,
    refreshUser,
    loginTimestamp, // Expose timestamp to trigger data refresh
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin' || user?.role === 'educator',
    isCreator: user?.subscription_tier === 'creator' || user?.subscription_tier === 'enterprise',
    isAcademy: user?.subscription_tier === 'enterprise', // Academy tier uses 'enterprise' in database
    isFree: user?.subscription_tier === 'free' || user?.subscription_tier === 'explorer' || !user?.subscription_tier
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}