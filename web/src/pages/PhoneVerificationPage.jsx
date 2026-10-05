import React, { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { getAppSurface } from '../utils/appSurface'
import { clearPhoneVerificationGate } from '../hooks/usePhoneVerificationGate'
import PhoneCodeVerifier from '../components/auth/PhoneCodeVerifier'

/**
 * The one screen an adult sees while their school requires a verified phone
 * number (backend/middleware/api_hold_gate.py).
 *
 * Deliberately standalone, like RequiredDocumentsPage — no sidebar, no
 * navigation, nothing to click except the two fields that lift the hold. It is
 * served on BOTH surfaces (App.jsx /verify-phone and SisRoutes verify-phone)
 * because teachers are held on the SIS host and parents on the learning host,
 * and the axios interceptor redirects within whichever host the 403 hit.
 *
 * Two steps: the phone (prefilled from the number the school already has,
 * when there is one) and the 6-digit code the backend texts to it. The steps
 * live in components/auth/PhoneCodeVerifier.jsx, shared with the school setup
 * form.
 */

const PhoneVerificationPage = () => {
  const navigate = useNavigate()
  const { user, logout, isAuthenticated, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [prefill, setPrefill] = useState('')

  const leave = useCallback(() => {
    clearPhoneVerificationGate()
    navigate(getAppSurface() === 'sis' ? '/' : '/dashboard', { replace: true })
  }, [navigate])

  useEffect(() => {
    // Standalone route (like /family/required-documents): not behind
    // PrivateRoute or SisLayout, so it does its own auth check.
    if (authLoading || !isAuthenticated) return
    api.get('/api/phone-verification/status')
      .then((r) => {
        if (r.data?.verified) {
          // Nothing left to do here.
          leave()
          return
        }
        // Not verified: render, whether or not they are held. A user the hold
        // doesn't apply to may still verify voluntarily (and superadmin tests
        // the flow this way) — the gate decides who is FORCED here, not who
        // may use it.
        if (r.data?.prefill) setPrefill(r.data.prefill)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [authLoading, isAuthenticated, leave])

  if (!authLoading && !isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (authLoading || loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-10 px-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-neutral-900">
            Verify your phone number
          </h1>
          <p className="mt-2 text-neutral-600">
            Your school requires a verified phone number for every staff and
            parent account, so they can reach you when it matters.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <PhoneCodeVerifier initialPhone={prefill} onVerified={leave} />
        </div>

        {/* The way out for somebody who genuinely cannot receive a text — the
            office can verify or excuse them; nobody should be stuck on a screen
            whose only escape is the one action they can't take. */}
        <p className="mt-8 text-center text-sm text-neutral-500">
          No mobile phone, or not receiving the text? Contact your
          school&rsquo;s office for help.
        </p>
        <p className="mt-3 text-center">
          <button onClick={logout} className="text-sm text-neutral-500 hover:text-neutral-800 underline">
            Sign out{user?.email ? ` (${user.email})` : ''}
          </button>
        </p>
      </div>
    </div>
  )
}

export default PhoneVerificationPage
