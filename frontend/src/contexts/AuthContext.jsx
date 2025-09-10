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
  const [loginTimestamp, setLoginTimestamp] = useState(null)
  const navigate = useNavigate()


  useEffect(() => {
    const token = localStorage.getItem('access_token')
    const userData = localStorage.getItem('user')
    
    if (token && userData) {
      setSession({ access_token: token })
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      setLoginTimestamp(Date.now()) // Set timestamp when restoring session
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      
    }
    
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    try {
      const response = await api.post('/api/auth/login', { email, password })
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
      const response = await api.post('/api/auth/refresh', { refresh_token })
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

  const refreshUser = async () => {
    if (!user?.id || !session?.access_token) {
      return false
    }

    try {
      // Call the dashboard endpoint to get fresh user data
      const response = await api.get('/api/users/dashboard')
      if (response.data?.user) {
        const freshUserData = response.data.user
        setUser(freshUserData)
        localStorage.setItem('user', JSON.stringify(freshUserData))
        console.log('User data refreshed successfully', freshUserData)
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to refresh user data:', error)
      return false
    }
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