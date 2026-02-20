import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import logger from '../../utils/logger'

/**
 * Organization-specific login page for username-based authentication.
 * Used by students who don't have email addresses.
 *
 * Route: /login/:slug
 */
const OrgLoginPage = () => {
  const { slug } = useParams()
  const { register, handleSubmit, formState: { errors } } = useForm()
  const { loginWithUsername, isAuthenticated, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [wantsToSwitch, setWantsToSwitch] = useState(false)
  const [organization, setOrganization] = useState(null)
  const [orgLoading, setOrgLoading] = useState(true)
  const [orgError, setOrgError] = useState('')

  // Fetch organization details on mount
  useEffect(() => {
    const fetchOrganization = async () => {
      try {
        setOrgLoading(true)
        setOrgError('')
        const response = await api.get(`/api/organizations/join/${slug}`)
        setOrganization(response.data)
      } catch (err) {
        logger.error('[OrgLoginPage] Failed to fetch organization:', err)
        if (err.response?.status === 404) {
          setOrgError('Organization not found. Please check the URL.')
        } else {
          setOrgError('Unable to load organization. Please try again.')
        }
      } finally {
        setOrgLoading(false)
      }
    }

    if (slug) {
      fetchOrganization()
    }
  }, [slug])

  // Redirect if already authenticated (unless user wants to switch accounts)
  useEffect(() => {
    if (isAuthenticated && user && !authLoading && !wantsToSwitch) {
      logger.debug('[OrgLoginPage] User already authenticated, redirecting')
      const redirectPath = user.role === 'parent' ? '/parent/dashboard'
        : user.role === 'observer' ? '/observer/feed'
        : '/dashboard'
      navigate(redirectPath, { replace: true })
    }
  }, [isAuthenticated, user, authLoading, navigate, wantsToSwitch])

  const onSubmit = async (data) => {
    setLoading(true)
    setLoginError('')

    const result = await loginWithUsername(slug, data.username, data.password)

    if (!result.success) {
      setLoginError(result.error || 'Login failed. Please try again.')
    }

    setLoading(false)
  }

  // Show loading state while fetching org
  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  // Show error if org not found
  if (orgError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <svg className="mx-auto h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="mt-4 text-xl font-semibold text-red-800">{orgError}</h2>
            <p className="mt-2 text-sm text-red-600">
              If you have an email account, you can{' '}
              <Link to="/login" className="font-medium underline hover:text-red-800">
                log in here
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Show account selection screen if already authenticated and not switching
  if (isAuthenticated && user && !authLoading && !wantsToSwitch) {
    const displayName = user.first_name || user.display_name || user.email
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
        {/* Organization branding */}
        <div className="text-center">
          {organization?.branding_config?.logo_url ? (
            <img
              src={organization.branding_config.logo_url}
              alt={organization.name}
              className="mx-auto h-16 w-auto"
            />
          ) : (
            <div className="mx-auto h-16 w-16 bg-gradient-to-br from-optio-purple to-optio-pink rounded-xl flex items-center justify-center">
              <span className="text-2xl font-bold text-white">
                {organization?.name?.charAt(0) || 'O'}
              </span>
            </div>
          )}
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            Sign in to {organization?.name || 'your organization'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your username and password
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

          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                id="username"
                {...register('username', {
                  required: 'Username is required',
                  minLength: {
                    value: 1,
                    message: 'Username must be at least 1 character'
                  }
                })}
                type="text"
                autoComplete="username"
                className="input-field"
                placeholder="Enter your username"
                aria-invalid={!!errors.username}
                aria-describedby={errors.username ? "username-error" : undefined}
              />
              {errors.username && (
                <p id="username-error" role="alert" className="mt-1 text-sm text-red-600">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  {...register('password', {
                    required: 'Password is required'
                  })}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="input-field pr-10"
                  placeholder="Enter your password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "password-error" : undefined}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-optio-purple disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </div>
        </form>

        {/* Link to email login */}
        <div className="text-center">
          <p className="text-sm text-gray-600">
            Have an email account?{' '}
            <Link to="/login" className="font-medium text-optio-purple hover:text-optio-pink">
              Sign in with email
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default OrgLoginPage
