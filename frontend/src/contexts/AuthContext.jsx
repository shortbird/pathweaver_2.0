import React, { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../services/api'

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
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    const userData = localStorage.getItem('user')
    
    if (token && userData) {
      setSession({ access_token: token })
      setUser(JSON.parse(userData))
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }
    
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password })
      const { user, session } = response.data
      
      setUser(user)
      setSession(session)
      
      localStorage.setItem('access_token', session.access_token)
      localStorage.setItem('refresh_token', session.refresh_token)
      localStorage.setItem('user', JSON.stringify(user))
      
      api.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`
      
      toast.success('Welcome back!')
      navigate('/dashboard')
      
      return { success: true }
    } catch (error) {
      // Handle nested error structure from backend
      let message = 'Login failed'
      if (error.response?.data?.error) {
        if (typeof error.response.data.error === 'string') {
          message = error.response.data.error
        } else if (error.response.data.error.message) {
          message = error.response.data.error.message
        }
      }
      toast.error(message)
      return { success: false, error: message }
    }
  }

  const register = async (userData) => {
    try {
      const response = await api.post('/auth/register', userData)
      const { user, session } = response.data
      
      if (session) {
        setUser(user)
        setSession(session)
        
        localStorage.setItem('access_token', session.access_token)
        localStorage.setItem('refresh_token', session.refresh_token)
        localStorage.setItem('user', JSON.stringify(user))
        
        api.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`
        
        toast.success('Account created successfully!')
        navigate('/dashboard')
      } else {
        toast.success('Please check your email to verify your account')
        navigate('/login')
      }
      
      return { success: true }
    } catch (error) {
      // Handle nested error structure from backend
      let message = 'Registration failed'
      if (error.response?.data?.error) {
        if (typeof error.response.data.error === 'string') {
          message = error.response.data.error
        } else if (error.response.data.error.message) {
          message = error.response.data.error.message
        }
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
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin' || user?.role === 'educator',
    isCreator: user?.subscription_tier === 'creator' || user?.subscription_tier === 'visionary',
    isVisionary: user?.subscription_tier === 'visionary'
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}