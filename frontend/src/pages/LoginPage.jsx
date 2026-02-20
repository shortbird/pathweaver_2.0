import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import logger from '../utils/logger'
import GoogleButton from '../components/auth/GoogleButton'
import { observerAPI } from '../services/api'

const LoginPage = () => {
  const { register, handleSubmit, formState: { errors } } = useForm()
  const { login, isAuthenticated, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const invitationCode = searchParams.get('invitation')
  const [loading, setLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [wantsToSwitch, setWantsToSwitch] = useState(false)

  // Store invitation code in localStorage so we can accept it after login
  useEffect(() => {
    if (invitationCode) {
      localStorage.setItem('pendingObserverInvitation', invitationCode)
      logger.debug('[LoginPage] Stored pending observer invitation:', invitationCode)
    }
  }, [invitationCode])

  // Handle pending observer invitation after login
  // Returns true if invitation was accepted, false otherwise
  const handlePendingObserverInvitation = async () => {
    const pendingInvitation = localStorage.getItem('pendingObserverInvitation')
    if (pendingInvitation) {
      try {
        logger.debug('[LoginPage] Accepting pending observer invitation:', pendingInvitation)
        const response = await observerAPI.acceptInvitation(pendingInvitation, {})
        localStorage.removeItem('pendingObserverInvitation')
        logger.debug('[LoginPage] Observer invitation accepted:', response.data)
        return response.data // Returns { status, has_existing_role, user_role, etc. }
      } catch (err) {
        logger.error('[LoginPage] Failed to accept observer invitation:', err)
        localStorage.removeItem('pendingObserverInvitation')
        // Don't block login if invitation acceptance fails
        return null
      }
    }
    return null
  }

  // Auto-redirect only for pending observer invitations (special deep-link case)
  // Normal authenticated users see the account selection screen instead
  useEffect(() => {
    const handlePendingInvitationRedirect = async () => {
      if (isAuthenticated && user && !authLoading && !wantsToSwitch) {
        const pendingInvitation = localStorage.getItem('pendingObserverInvitation')
        if (pendingInvitation) {
          logger.debug('[LoginPage] User already authenticated with pending invitation, handling redirect')
          const acceptResult = await handlePendingObserverInvitation()
          if (acceptResult && acceptResult.status === 'success') {
            logger.debug('[LoginPage] Observer invitation accepted, redirecting to observer feed')
            navigate('/observer/feed', { replace: true, state: { freshInvitation: true } })
            return
          }
        }
        // No pending invitation - account selection screen will handle navigation
      }
    }

    handlePendingInvitationRedirect()
  }, [isAuthenticated, user, authLoading, navigate, wantsToSwitch])

  const onSubmit = async (data) => {
    setLoading(true)
    setLoginError('') // Clear any previous errors

    const result = await login(data.email, data.password)

    if (!result.success) {
      setLoginError(result.error || 'Login failed. Please try again.')
    }

    setLoading(false)
  }

  // Show account selection screen if already authenticated and not switching
  if (isAuthenticated && user && !authLoading && !wantsToSwitch) {
    const displayName = user.first_name || user.display_name || user.email || 'User'
    const redirectPath = user.role === 'parent' ? '/parent/dashboard'
      : user.role === 'observer' ? '/observer/feed'
      : '/dashboard'

    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl font-bold text-white">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">
              You are logged in as <span className="text-optio-purple">{displayName}</span>
            </h2>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => navigate(redirectPath)}
              className="w-full py-3 px-4 text-sm font-medium rounded-lg text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-optio-purple transition-all"
            >
              Continue as {displayName}
            </button>
            <button
              onClick={() => setWantsToSwitch(true)}
              className="w-full py-3 px-4 text-sm font-medium rounded-lg text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-optio-purple transition-all"
            >
              Sign in with a different account
            </button>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              Signing in as a different account will end your current session in all open tabs.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            Welcome back
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link to="/register" className="font-medium text-primary hover:text-purple-500">
              create a new account
            </Link>
          </p>
        </div>

        {wantsToSwitch && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              Signing in below will end your current session in all open tabs.
            </p>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {loginError && (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-md p-4 shadow-sm">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-red-800">{loginError}</p>
                </div>
              </div>
            </div>
          )}
          
          <div className="rounded-md shadow-sm space-y-2">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address'
                  }
                })}
                type="email"
                autoComplete="email"
                className="input-field rounded-t-lg"
                placeholder="Email address"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
              />
              {errors.email && (
                <p id="email-error" role="alert" className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>
            
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  {...register('password', {
                    required: 'Password is required'
                  })}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="input-field rounded-b-lg pr-10"
                  placeholder="Password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "password-error" : undefined}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" role="alert" className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-background text-gray-500">Or continue with</span>
            </div>
          </div>

          {/* Google Sign-in */}
          <GoogleButton
            mode="signin"
            onError={(error) => setLoginError(error)}
            disabled={loading}
          />

          <div className="text-sm text-center">
            <Link to="/forgot-password" className="font-medium text-primary hover:text-purple-500">
              Forgot your password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default LoginPage