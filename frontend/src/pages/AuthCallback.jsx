import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { tokenStore } from '../services/api'
import api from '../services/api'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../utils/queryKeys'

/**
 * OAuth Authorization Code Callback Page
 *
 * Handles the auth code exchange for Spark SSO login.
 * Implements OAuth 2.0 authorization code flow for security:
 * 1. Receives one-time auth code from SSO redirect
 * 2. Exchanges code for access/refresh tokens via POST
 * 3. Stores tokens in memory (not localStorage - XSS protection)
 * 4. Updates AuthContext with user session
 * 5. Redirects to dashboard
 *
 * SECURITY: Tokens never appear in URL, only the one-time code does.
 */
export default function AuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('processing')
  const [error, setError] = useState(null)

  useEffect(() => {
    const exchangeCode = async () => {
      const code = searchParams.get('code')

      if (!code) {
        setError('Missing authorization code')
        setStatus('error')
        return
      }

      try {
        // Exchange code for tokens (OAuth 2.0 token endpoint)
        // Note: Spark endpoints are at root level, not under /api
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
        const response = await fetch(`${apiUrl}/spark/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Token exchange failed')
        }

        const data = await response.json()
        const { access_token, refresh_token, user_id } = data

        // Store tokens in memory + localStorage (survives page refresh)
        tokenStore.setTokens(access_token, refresh_token)

        // ✅ CRITICAL FIX: Fetch user data immediately and update React Query cache
        // This ensures AuthContext sees the authenticated state before navigation
        try {
          const userResponse = await api.get('/api/auth/me')
          if (userResponse.data) {
            // Update React Query cache with user data
            queryClient.setQueryData(queryKeys.user.profile('current'), userResponse.data)
            console.log('[AuthCallback] User data cached, authentication complete')
          }
        } catch (err) {
          console.error('[AuthCallback] Failed to fetch user data:', err)
          // Continue anyway - AuthContext will fetch on next mount
        }

        setStatus('success')

        // Use React Router navigate to preserve in-memory state
        // Small delay allows React Query cache update to propagate
        setTimeout(() => {
          navigate('/dashboard', { replace: true })
        }, 300)
      } catch (err) {
        console.error('Token exchange failed:', err)
        setError(err.response?.data?.error || 'Authentication failed')
        setStatus('error')

        // Redirect to login after error display
        setTimeout(() => {
          navigate('/login', { replace: true })
        }, 3000)
      }
    }

    exchangeCode()
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        {status === 'processing' && (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-bold text-gray-800" style={{ fontFamily: 'Poppins' }}>
              Completing Sign In...
            </h2>
            <p className="text-gray-600 mt-2" style={{ fontFamily: 'Poppins' }}>
              Please wait while we log you in
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
  )
}
