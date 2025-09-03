import React, { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../services/api'
import { retryWithBackoff } from '../utils/retryHelper'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [needsTosAcceptance, setNeedsTosAcceptance] = useState(false)
  const [tosCheckLoading, setTosCheckLoading] = useState(false)
  const [loginTimestamp, setLoginTimestamp] = useState(null)
  const navigate = useNavigate()

  // Check if user needs to accept ToS
  const checkTosAcceptance = async () => {
    if (!user || user.role === 'admin') {
      setNeedsTosAcceptance(false)
      return false
    }
    
    setTosCheckLoading(true)
    try {
      const response = await api.get('/auth/check-tos-acceptance')
      const needsAcceptance = response.data.needs_acceptance
      setNeedsTosAcceptance(needsAcceptance)
      return needsAcceptance
    } catch (error) {
      console.error('Error checking ToS acceptance:', error)
      setNeedsTosAcceptance(false)
      return false
    } finally {
      setTosCheckLoading(false)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    const userData = localStorage.getItem('user')
    
    if (token && userData) {
      setSession({ access_token: token })
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      setLoginTimestamp(Date.now()) // Set timestamp when restoring session
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      
      // Check ToS acceptance for non-admin users
      if (parsedUser && parsedUser.role !== 'admin') {
        checkTosAcceptance()
      }
    }
    
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password })
      const { user, session } = response.data
      
      setUser(user)
      setSession(session)
      setLoginTimestamp(Date.now()) // Force refresh of data
      
      localStorage.setItem('access_token', session.access_token)
      localStorage.setItem('refresh_token', session.refresh_token)
      localStorage.setItem('user', JSON.stringify(user))
      
      api.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`
      
      // Check if user is new (created within the last 5 minutes)
      const createdAt = new Date(user.created_at)
      const now = new Date()
      const timeDiff = now - createdAt
      const isNewUser = timeDiff < 5 * 60 * 1000 // 5 minutes in milliseconds
      
      if (isNewUser) {
        toast.success(`Welcome to Optio, ${user.first_name}!`)
      } else {
        toast.success('Welcome back!')
      }
      
      // Check if user needs to accept ToS (for existing users)
      if (user.role !== 'admin') {
        const needsAcceptance = await checkTosAcceptance()
        if (needsAcceptance) {
          navigate('/accept-terms')
          return { success: true }
        }
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
      // Log registration attempt for debugging
      console.log('Registration attempt with data:', {
        ...userData,
        password: '[REDACTED]',
        confirmPassword: '[REDACTED]'
      })
      
      // Use retry logic for registration to handle temporary service issues
      const response = await retryWithBackoff(
        () => api.post('/auth/register', userData),
        3, // max retries
        2000 // initial delay of 2 seconds
      )
      const { user, session, message, email_verification_required } = response.data
      
      // Handle email verification required case (rate limit or email confirmation)
      if (email_verification_required || message) {
        // Navigate to email verification page with user's email
        navigate('/email-verification', { state: { email: userData.email } })
        return { success: true }
      }
      
      if (session) {
        setUser(user)
        setSession(session)
        setLoginTimestamp(Date.now()) // Force refresh of data
        
        localStorage.setItem('access_token', session.access_token)
        localStorage.setItem('refresh_token', session.refresh_token)
        localStorage.setItem('user', JSON.stringify(user))
        
        api.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`
        
        toast.success('Account created successfully!')
        navigate('/dashboard')
      } else {
        // Email verification required - redirect to verification page
        navigate('/email-verification', { state: { email: userData.email } })
      }
      
      return { success: true }
    } catch (error) {
      // Log the full error for debugging
      console.error('Registration error:', error.response || error)
      
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
      await api.post('/auth/logout')
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setUser(null)
      setSession(null)
      setLoginTimestamp(null) // Clear timestamp on logout
      
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user')
      
      delete api.defaults.headers.common['Authorization']
      
      toast.success('Logged out successfully')
      navigate('/')
    }
  }

  const refreshToken = async () => {
    const refresh_token = localStorage.getItem('refresh_token')
    
    if (!refresh_token) {
      await logout()
      return false
    }
    
    try {
      const response = await api.post('/auth/refresh', { refresh_token })
      const { session } = response.data
      
      setSession(session)
      
      localStorage.setItem('access_token', session.access_token)
      localStorage.setItem('refresh_token', session.refresh_token)
      
      api.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`
      
      return true
    } catch (error) {
      await logout()
      return false
    }
  }

  const updateUser = (userData) => {
    setUser(userData)
    localStorage.setItem('user', JSON.stringify(userData))
  }

  const value = {
    user,
    session,
    loading,
    login,
    register,
    logout,
    refreshToken,
    updateUser,
    checkTosAcceptance,
    needsTosAcceptance,
    tosCheckLoading,
    loginTimestamp, // Expose timestamp to trigger data refresh
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin' || user?.role === 'educator',
    isCreator: user?.subscription_tier === 'creator' || user?.subscription_tier === 'visionary',
    isVisionary: user?.subscription_tier === 'visionary',
    isFree: user?.subscription_tier === 'free' || user?.subscription_tier === 'explorer' || !user?.subscription_tier
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}