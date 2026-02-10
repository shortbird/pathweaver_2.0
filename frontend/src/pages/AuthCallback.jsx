import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { tokenStore, observerAPI } from '../services/api'
import authService from '../services/authService'
import { supabase } from '../services/supabaseClient'
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

  // CRITICAL: Capture tokens IMMEDIATELY on first render (before Supabase can process/clear them)
  // This fixes clock skew issues where Supabase rejects tokens "issued in the future"
  const [capturedTokens] = useState(() => {
    const hash = window.location.hash.substring(1)
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash)
      console.log('[AuthCallback] Captured tokens from hash before Supabase processing')
      return {
        accessToken: params.get('access_token'),
        refreshToken: params.get('refresh_token')
      }
    }
    return null
  })

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
      // Also check capturedTokens (for clock skew workaround)
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const hasHashTokens = accessToken || window.location.hash.includes('access_token') || capturedTokens?.accessToken

      // Also check if Supabase already processed the OAuth callback and has a session
      // This handles cases where the URL hash was cleared before our code runs
      let hasSupabaseSession = false
      if (!hasHashTokens && !code) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          hasSupabaseSession = !!session
        } catch (e) {
          // Ignore errors, will fall through to error handling
        }
      }

      const isSupabaseOAuth = hasHashTokens || hasSupabaseSession

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
   * Handle pending observer invitation after authentication
   * Returns true if invitation was accepted, false otherwise
   */
  const handlePendingObserverInvitation = async () => {
    const pendingInvitation = localStorage.getItem('pendingObserverInvitation')
    if (pendingInvitation) {
      try {
        console.log('[AuthCallback] Accepting pending observer invitation:', pendingInvitation)
        await observerAPI.acceptInvitation(pendingInvitation, {})
        localStorage.removeItem('pendingObserverInvitation')
        console.log('[AuthCallback] Observer invitation accepted')
        return true
      } catch (err) {
        console.error('[AuthCallback] Failed to accept observer invitation:', err)
        localStorage.removeItem('pendingObserverInvitation')
        // Don't block auth if invitation acceptance fails
      }
    }
    return false
  }

  /**
   * Handle pending org invitation - accept it directly
   * Returns object with accepted status
   */
  const handlePendingOrgInvitation = async (userEmail) => {
    const pendingInvitation = localStorage.getItem('pendingOrgInvitation')
    if (pendingInvitation && userEmail) {
      try {
        console.log('[AuthCallback] Accepting pending org invitation:', pendingInvitation, 'for user:', userEmail)
        const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/admin/organizations/invitations/accept/${pendingInvitation}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            email: userEmail,
            skip_password_check: true
          })
        })
        const data = await response.json()
        if (response.ok && data.success) {
          console.log('[AuthCallback] Org invitation accepted successfully')
          localStorage.removeItem('pendingOrgInvitation')
          return { accepted: true, orgName: data.organization_name }
        } else {
          console.error('[AuthCallback] Failed to accept org invitation:', data.error)
          localStorage.removeItem('pendingOrgInvitation')
          return { accepted: false, error: data.error }
        }
      } catch (err) {
        console.error('[AuthCallback] Error accepting org invitation:', err)
        localStorage.removeItem('pendingOrgInvitation')
        return { accepted: false, error: err.message }
      }
    }
    return { accepted: false }
  }

  /**
   * Handle Google OAuth callback via Supabase
   */
  const handleGoogleOAuth = async () => {
    try {
      // Pass pre-captured tokens to handle clock skew issues
      const result = await authService.handleGoogleCallback(capturedTokens)

      if (result.success) {
        // Check if TOS acceptance is required (new users)
        if (result.requiresTosAcceptance) {
          setTosAcceptanceToken(result.tosAcceptanceToken)
          setTosUserName(result.user?.first_name || '')
          setShowTosModal(true)
          setStatus('tos_required')
          return
        }

        // Handle any pending org invitation (accept directly)
        const orgInvitationResult = await handlePendingOrgInvitation(result.user?.email)

        // Handle any pending observer invitation
        const invitationAccepted = await handlePendingObserverInvitation()

        setStatus('success')

        // Determine redirect path based on user role
        // If invitation was just accepted, user is now an observer regardless of what the response said
        let redirectPath
        if (invitationAccepted) {
          // First-time observer - send to welcome page
          redirectPath = '/observer/welcome'
        } else {
          const user = result.user
          // Check if observer has seen welcome page
          const hasSeenWelcome = localStorage.getItem('observerWelcomeSeen')
          if (user?.role === 'observer' && !hasSeenWelcome) {
            redirectPath = '/observer/welcome'
          } else {
            redirectPath = user?.role === 'parent' ? '/parent/dashboard'
              : user?.role === 'observer' ? '/observer/feed'
              : '/dashboard'
          }
        }

        // Signal to PrivateRoute that auth just completed (prevents flash to login)
        sessionStorage.setItem('authJustCompleted', Date.now().toString())

        // Small delay to ensure IndexedDB token writes are persisted before navigation
        await new Promise(resolve => setTimeout(resolve, 100))

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
      // Check for pending promo code
      const pendingPromoCode = localStorage.getItem('pendingPromoCode')

      const result = await authService.acceptTos(tosAcceptanceToken, pendingPromoCode)

      // Clear promo code after use (regardless of success)
      localStorage.removeItem('pendingPromoCode')

      if (result.success) {
        setShowTosModal(false)
        // Set status to success immediately to avoid showing "Almost There" during invitation acceptance
        setStatus('success')

        // Handle any pending org invitation (accept directly)
        const orgInvitationResult = await handlePendingOrgInvitation(result.user?.email)

        // Handle any pending observer invitation
        const invitationAccepted = await handlePendingObserverInvitation()

        // Determine redirect path based on user role
        // If invitation was just accepted, user is now an observer regardless of what TOS response said
        let redirectPath
        if (invitationAccepted) {
          // First-time observer - send to welcome page
          redirectPath = '/observer/welcome'
        } else {
          const user = result.user
          // Check if observer has seen welcome page
          const hasSeenWelcome = localStorage.getItem('observerWelcomeSeen')
          if (user?.role === 'observer' && !hasSeenWelcome) {
            redirectPath = '/observer/welcome'
          } else {
            redirectPath = user?.role === 'parent' ? '/parent/dashboard'
              : user?.role === 'observer' ? '/observer/feed'
              : '/dashboard'
          }
        }

        // Signal to PrivateRoute that auth just completed (prevents flash to login)
        sessionStorage.setItem('authJustCompleted', Date.now().toString())

        // Small delay to ensure IndexedDB token writes are persisted before navigation
        await new Promise(resolve => setTimeout(resolve, 100))

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
    // Clear pending promo code since registration was cancelled
    localStorage.removeItem('pendingPromoCode')

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
        isObserverSignup={!!localStorage.getItem('pendingObserverInvitation')}
      />
    </>
  )
}
