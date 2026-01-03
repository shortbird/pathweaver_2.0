import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { tokenStore } from '../services/api'
import authService from '../services/authService'
import { useQueryClient } from '@tanstack/react-query'
import TosConsentModal from '../components/auth/TosConsentModal'

/**
 * OAuth Authorization Callback Page
 *
 * Handles OAuth callbacks from multiple providers:
 * 1. Spark SSO - Uses query param 'code' for token exchange
 * 2. Google OAuth - Uses Supabase auth with URL hash fragments
 *
 * For Spark SSO (query param 'code'):
 * - Receives one-time auth code from SSO redirect
 * - Exchanges code for tokens via POST to /spark/token
 *
 * For Google OAuth (URL hash with access_token):
 * - Supabase handles the OAuth flow
 * - We exchange Supabase token for app session
 */
export default function AuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('processing')
  const [error, setError] = useState(null)

  // TOS modal state
  const [showTosModal, setShowTosModal] = useState(false)
  const [tosAcceptanceToken, setTosAcceptanceToken] = useState(null)
  const [tosUserName, setTosUserName] = useState('')
  const [tosLoading, setTosLoading] = useState(false)

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code')

      // Check if this is a Supabase OAuth callback (Google, etc.)
      // Supabase uses URL hash fragments, not query params
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const isSupabaseOAuth = accessToken || window.location.hash.includes('access_token')

      if (isSupabaseOAuth) {
        // Handle Google OAuth via Supabase
        await handleGoogleOAuth()
      } else if (code) {
        // Handle Spark SSO
        await handleSparkSSO(code)
      } else {
        setError('Missing authorization data')
        setStatus('error')
      }
    }

    handleCallback()
  }, [searchParams, navigate])

  /**
   * Handle Google OAuth callback via Supabase
   */
  const handleGoogleOAuth = async () => {
    try {
      const result = await authService.handleGoogleCallback()

      if (result.success) {
        // Check if TOS acceptance is required (new users)
        if (result.requiresTosAcceptance) {
          setTosAcceptanceToken(result.tosAcceptanceToken)
          setTosUserName(result.user?.first_name || '')
          setShowTosModal(true)
          setStatus('tos_required')
          return
        }

        setStatus('success')

        // Determine redirect path based on user role
        const user = result.user
        const redirectPath = user?.role === 'parent' ? '/parent/dashboard' : '/dashboard'

        // Force full page reload to ensure AuthContext is updated
        window.location.href = redirectPath
      } else {
        setError(result.error || 'Google authentication failed')
        setStatus('error')

        setTimeout(() => {
          navigate('/login', { replace: true })
        }, 3000)
      }
    } catch (err) {
      console.error('Google OAuth failed:', err)
      setError('Google authentication failed')
      setStatus('error')

      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 3000)
    }
  }

  /**
   * Handle TOS acceptance from modal
   */
  const handleTosAccept = async () => {
    setTosLoading(true)
    try {
      const result = await authService.acceptTos(tosAcceptanceToken)

      if (result.success) {
        setShowTosModal(false)
        setStatus('success')

        // Determine redirect path based on user role
        const user = result.user
        const redirectPath = user?.role === 'parent' ? '/parent/dashboard' : '/dashboard'

        // Force full page reload to ensure AuthContext is updated
        window.location.href = redirectPath
      } else {
        setError(result.error || 'Failed to accept Terms of Service')
        setShowTosModal(false)
        setStatus('error')

        setTimeout(() => {
          navigate('/login', { replace: true })
        }, 3000)
      }
    } catch (err) {
      console.error('TOS acceptance failed:', err)
      setError('Failed to accept Terms of Service')
      setShowTosModal(false)
      setStatus('error')

      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 3000)
    } finally {
      setTosLoading(false)
    }
  }

  /**
   * Handle TOS modal close (cancel)
   */
  const handleTosClose = () => {
    setShowTosModal(false)
    setStatus('error')
    setError('You must accept the Terms of Service to continue')

    setTimeout(() => {
      navigate('/login', { replace: true })
    }, 3000)
  }

  /**
   * Handle Spark SSO callback
   */
  const handleSparkSSO = async (code) => {
    try {
      // Exchange code for tokens (OAuth 2.0 token endpoint)
      // Note: Spark endpoints are at root level, not under /api
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'

      const response = await fetch(`${apiUrl}/spark/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ code }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Token exchange failed')
      }

      const data = await response.json()
      const { app_access_token, app_refresh_token } = data

      // Store tokens for cross-origin support
      if (app_access_token && app_refresh_token) {
        tokenStore.setTokens(app_access_token, app_refresh_token)
      }

      setStatus('success')

      // Force full page reload to /dashboard
      window.location.href = '/dashboard'
    } catch (err) {
      console.error('Spark SSO failed:', err)
      setError(err.message || 'Authentication failed')
      setStatus('error')

      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 3000)
    }
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          {status === 'processing' && (
            <>
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-optio-purple mx-auto mb-4"></div>
              <h2 className="text-xl font-bold text-gray-800" style={{ fontFamily: 'Poppins' }}>
                Completing Sign In...
              </h2>
              <p className="text-gray-600 mt-2" style={{ fontFamily: 'Poppins' }}>
                Please wait while we log you in
              </p>
            </>
          )}

          {status === 'tos_required' && (
            <>
              <div className="text-optio-purple text-5xl mb-4">📋</div>
              <h2 className="text-xl font-bold text-gray-800" style={{ fontFamily: 'Poppins' }}>
                Almost There!
              </h2>
              <p className="text-gray-600 mt-2" style={{ fontFamily: 'Poppins' }}>
                Please accept our Terms of Service to continue
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-green-500 text-5xl mb-4">✓</div>
              <h2 className="text-xl font-bold text-gray-800" style={{ fontFamily: 'Poppins' }}>
                Success!
              </h2>
              <p className="text-gray-600 mt-2" style={{ fontFamily: 'Poppins' }}>
                Redirecting to dashboard...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-red-500 text-5xl mb-4">✕</div>
              <h2 className="text-xl font-bold text-gray-800" style={{ fontFamily: 'Poppins' }}>
                Authentication Failed
              </h2>
              <p className="text-red-600 mt-2" style={{ fontFamily: 'Poppins' }}>
                {error}
              </p>
              <p className="text-gray-500 mt-4 text-sm" style={{ fontFamily: 'Poppins' }}>
                Redirecting to login page...
              </p>
            </>
          )}
        </div>
      </div>

      {/* TOS Consent Modal */}
      <TosConsentModal
        isOpen={showTosModal}
        onClose={handleTosClose}
        onAccept={handleTosAccept}
        loading={tosLoading}
        userName={tosUserName}
      />
    </>
  )
}
