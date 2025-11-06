import React, { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api, { tokenStore } from '../services/api'
import { retryWithBackoff } from '../utils/retryHelper'
import { queryKeys } from '../utils/queryKeys'

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
    // ✅ INCOGNITO FIX: Restore tokens from localStorage before checking session
    const checkSession = async () => {
      try {
        // STEP 1: Restore tokens from localStorage (survives page refresh)
        const tokensRestored = tokenStore.restoreTokens()

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
            console.log('[AuthContext] Session restored successfully')
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
              console.log('[AuthContext] Session restored via cookies')
            }
          } catch {
            // No valid session - user needs to log in
            console.log('[AuthContext] No valid session found')
            setSession(null)
          }
        }
      } catch (error) {
        // Token invalid/expired - clear and require login
        console.log('[AuthContext] Session validation failed:', error.message)
        tokenStore.clearTokens()
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

      // ✅ INCOGNITO FIX: Store app tokens in memory for Authorization headers
      // This is the CRITICAL piece that was missing!
      if (app_access_token && app_refresh_token) {
        tokenStore.setTokens(app_access_token, app_refresh_token)
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

      navigate('/dashboard')

      return { success: true }
    } catch (error) {
      // Handle nested error structure from backend
      let message = 'Login failed. Please try again.'
      
      if (error.response?.data?.error) {
        if (typeof error.response.data.error === 'string') {
          message = error.response.data.error
        } else if (error.response.data.error.message) {
          message = error.response.data.error.message
        }
      } else if (error.response?.status === 429) {
        message = 'Too many login attempts. Please wait a moment and try again.'
      } else if (error.response?.status === 503) {
        message = 'Service temporarily unavailable. Please try again in a few moments.'
      } else if (error.response?.status === 500) {
        message = 'Server error. Please contact support if this continues.'
      } else if (!error.response) {
        message = 'Connection error. Please check your internet connection.'
      }
      
      // Don't show toast for expected errors - let the form handle display
      // Only show toast for unexpected errors
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
        // ✅ INCOGNITO FIX: Extract and store tokens from registration response
        const { app_access_token, app_refresh_token } = response.data
        if (app_access_token && app_refresh_token) {
          tokenStore.setTokens(app_access_token, app_refresh_token)
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
        navigate('/dashboard')
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
      await api.post('/api/auth/logout')
    } catch (error) {
    } finally {
      setSession(null)
      setLoginTimestamp(null) // Clear timestamp on logout

      // ✅ INCOGNITO FIX: Clear tokens from memory
      tokenStore.clearTokens()

      // Clear localStorage tokens (legacy)
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user')

      // Clear all React Query cache on logout
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