import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api, { tokenStore, observerAPI } from '../services/api'
import authService from '../services/authService'
import { getPostLoginPath } from '../utils/postLoginPath'
import { supabase } from '../services/supabaseClient'
import { useQueryClient } from '@tanstack/react-query'
import TosConsentModal from '../components/auth/TosConsentModal'
import { resumePendingRegistrationFunnel } from '../components/auth/registrationFunnelResume'
import logger from '../utils/logger'

/**
 * OAuth Authorization Callback Page
 *
 * Handles OAuth callbacks from multiple providers:
 * 1. Spark SSO - Uses query param 'code' for token exchange
 * 2. Google / Apple OAuth - Uses Supabase auth with URL hash fragments
 *
 * For Spark SSO (query param 'code'):
 * - Receives one-time auth code from SSO redirect
 * - Exchanges code for tokens via POST to /spark/token
 *
 * For Supabase OAuth (URL hash with access_token):
 * - Supabase handles the OAuth flow
 * - We exchange Supabase token for app session
 *
 * The hash Supabase hands back is identical for both providers, so the sign-in
 * button names the provider in the redirect query string (`?provider=apple`).
 * When that param is missing — Google's redirect predates it, and a redirect
 * allow-list can match on path alone — authService reads the provider off the
 * Supabase session instead.
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
      logger.debug('[AuthCallback] Captured tokens from hash before Supabase processing')
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
        // Handle Google / Apple OAuth via Supabase
        await handleSupabaseOAuth()
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
        logger.debug('[AuthCallback] Accepting pending observer invitation:', pendingInvitation)
        await observerAPI.acceptInvitation(pendingInvitation, {})
        localStorage.removeItem('pendingObserverInvitation')
        logger.debug('[AuthCallback] Observer invitation accepted')
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
    if (!pendingInvitation || !userEmail) return { accepted: false }
    // Must go through the api client: by now the OAuth exchange has set auth
    // cookies, so the backend enforces CSRF — a raw fetch without the
    // X-CSRF-Token header gets a 400 and the join silently fails.
    localStorage.removeItem('pendingOrgInvitation')
    try {
      logger.debug('[AuthCallback] Accepting pending org invitation:', pendingInvitation, 'for user:', userEmail)
      const response = await api.post(
        `/api/admin/organizations/invitations/accept/${pendingInvitation}`,
        { email: userEmail, skip_password_check: true }
      )
      if (response.data.success) {
        logger.debug('[AuthCallback] Org invitation accepted successfully')
        return { accepted: true, orgName: response.data.organization_name }
      }
      console.error('[AuthCallback] Failed to accept org invitation:', response.data.error)
      return { accepted: false, code: pendingInvitation, error: response.data.error }
    } catch (err) {
      console.error('[AuthCallback] Error accepting org invitation:', err)
      // Hand the code back so the caller can return the user to the invitation
      // page (which offers a logged-in Join button) instead of losing the invite.
      return { accepted: false, code: pendingInvitation, error: err.response?.data?.error || err.message }
    }
  }

  /**
   * Where to land after OAuth. When an org invitation was just accepted the
   * role/org on the OAuth response is stale, so re-fetch /me and use the
   * canonical post-login map (org parent -> /parent/dashboard, etc.).
   */
  const resolveRedirectPath = async (user, orgInvitationAccepted) => {
    if (orgInvitationAccepted) {
      try {
        const me = await api.get('/api/auth/me')
        return getPostLoginPath(me.data)
      } catch (err) {
        console.error('[AuthCallback] Failed to refresh user after org join:', err)
      }
    }
    return getPostLoginPath(user)
  }

  /**
   * Handle Google / Apple OAuth callback via Supabase
   */
  const handleSupabaseOAuth = async () => {
    // Null rather than 'google' when the param is absent: that lets the service
    // read the provider off the Supabase session instead of assuming.
    const providerHint = searchParams.get('provider') === 'apple' ? 'apple' : null
    try {
      // Pass pre-captured tokens to handle clock skew issues
      const result = await authService.handleOAuthCallback(providerHint, capturedTokens)

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
        // A pending registration funnel owns the destination outright: this
        // parent is mid-enrollment, not arriving at a dashboard.
        const funnelPath = await resumePendingRegistrationFunnel()
        if (funnelPath) {
          redirectPath = funnelPath
        } else if (invitationAccepted) {
          const hasSeenWelcome = localStorage.getItem('observerWelcomeSeen')
          redirectPath = hasSeenWelcome ? '/observer/feed' : '/observer/welcome'
        } else if (orgInvitationResult.code) {
          // The org join failed — return to the invitation page, which shows a
          // logged-in Join button, rather than stranding the account outside the org.
          redirectPath = `/invitation/${orgInvitationResult.code}`
        } else {
          redirectPath = await resolveRedirectPath(result.user, orgInvitationResult.accepted)
        }

        // Signal to PrivateRoute that auth just completed (prevents flash to login)
        sessionStorage.setItem('authJustCompleted', Date.now().toString())

        // Small delay to ensure IndexedDB token writes are persisted before navigation
        await new Promise(resolve => setTimeout(resolve, 100))

        // Force full page reload to ensure AuthContext is updated
        window.location.href = redirectPath
      } else {
        // result.error already names the provider it tried.
        setError(result.error || 'Authentication failed')
        setStatus('error')

        setTimeout(() => {
          navigate('/login', { replace: true })
        }, 3000)
      }
    } catch (err) {
      console.error('OAuth callback failed:', err)
      setError('Authentication failed')
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
        // A pending registration funnel owns the destination outright: this
        // parent is mid-enrollment, not arriving at a dashboard.
        const funnelPath = await resumePendingRegistrationFunnel()
        if (funnelPath) {
          redirectPath = funnelPath
        } else if (invitationAccepted) {
          const hasSeenWelcome = localStorage.getItem('observerWelcomeSeen')
          redirectPath = hasSeenWelcome ? '/observer/feed' : '/observer/welcome'
        } else if (orgInvitationResult.code) {
          // The org join failed — return to the invitation page, which shows a
          // logged-in Join button, rather than stranding the account outside the org.
          redirectPath = `/invitation/${orgInvitationResult.code}`
        } else {
          redirectPath = await resolveRedirectPath(result.user, orgInvitationResult.accepted)
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
      <div className="min-h-screen bg-gradient-to-br from-optio-purple/5 to-optio-pink/5 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          {status === 'processing' && (
            <>
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-optio-purple mx-auto mb-4"></div>
              <h2 className="text-xl font-bold text-gray-800">
                Completing Sign In...
              </h2>
              <p className="text-gray-600 mt-2">
                Please wait while we log you in
              </p>
            </>
          )}

          {status === 'tos_required' && (
            <>
              <div className="text-optio-purple text-5xl mb-4">📋</div>
              <h2 className="text-xl font-bold text-gray-800">
                Almost There!
              </h2>
              <p className="text-gray-600 mt-2">
                Please accept our Terms of Service to continue
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-green-500 text-5xl mb-4">✓</div>
              <h2 className="text-xl font-bold text-gray-800">
                Success!
              </h2>
              <p className="text-gray-600 mt-2">
                Redirecting to dashboard...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-red-500 text-5xl mb-4">✕</div>
              <h2 className="text-xl font-bold text-gray-800">
                Authentication Failed
              </h2>
              <p className="text-red-600 mt-2">
                {error}
              </p>
              <a
                href="/login"
                className="btn-primary mt-4"
              >
                Go to Login
              </a>
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
