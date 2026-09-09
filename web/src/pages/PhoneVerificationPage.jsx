import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { getAppSurface } from '../utils/appSurface'
import { clearPhoneVerificationGate } from '../hooks/usePhoneVerificationGate'

/**
 * The one screen an adult sees while their school requires a verified phone
 * number (backend/middleware/phone_verification_gate.py).
 *
 * Deliberately standalone, like RequiredDocumentsPage — no sidebar, no
 * navigation, nothing to click except the two fields that lift the hold. It is
 * served on BOTH surfaces (App.jsx /verify-phone and SisRoutes verify-phone)
 * because teachers are held on the SIS host and parents on the learning host,
 * and the axios interceptor redirects within whichever host the 403 hit.
 *
 * Two steps: the phone (prefilled from the number the school already has,
 * when there is one) and the 6-digit code the backend texts to it.
 */

const RESEND_SECONDS = 60

const PhoneVerificationPage = () => {
  const navigate = useNavigate()
  const { user, logout, isAuthenticated, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState('phone')   // 'phone' | 'code'
  const [phone, setPhone] = useState('')
  const [maskedPhone, setMaskedPhone] = useState(null)
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef(null)

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
        if (r.data?.prefill) setPhone(r.data.prefill)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [authLoading, isAuthenticated, leave])

  useEffect(() => {
    if (!cooldown) return undefined
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const sendCode = async () => {
    setBusy(true)
    try {
      const r = await api.post('/api/phone-verification/send-code', { phone })
      setMaskedPhone(r.data?.phone || null)
      setDevCode(r.data?.dev_code || null)
      setCode('')
      setStep('code')
      setCooldown(RESEND_SECONDS)
      setTimeout(() => codeRef.current?.focus(), 50)
    } catch (err) {
      const data = err?.response?.data
      if (data?.retry_after) setCooldown(data.retry_after)
      toast.error(data?.error || 'Could not send the code')
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    setBusy(true)
    try {
      await api.post('/api/phone-verification/verify', { code })
      toast.success('Phone number verified')
      leave()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not verify the code')
    } finally {
      setBusy(false)
    }
  }

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
          {step === 'phone' ? (
            <form onSubmit={(e) => { e.preventDefault(); sendCode() }}>
              <label htmlFor="phone" className="block text-sm font-medium text-neutral-800">
                Mobile phone number
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="801-555-0123"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-optio-purple"
              />
              <p className="mt-2 text-sm text-neutral-500">
                We&rsquo;ll text a 6-digit code to this number.
              </p>
              <button
                type="submit"
                disabled={busy || !phone.trim() || cooldown > 0}
                className="mt-4 w-full rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold py-2.5 disabled:opacity-50"
              >
                {busy ? 'Sending…' : cooldown > 0 ? `Wait ${cooldown}s` : 'Text me a code'}
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); verify() }}>
              <label htmlFor="code" className="block text-sm font-medium text-neutral-800">
                Enter the code we sent{maskedPhone ? ` to ${maskedPhone}` : ''}
              </label>
              <input
                id="code"
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-2xl tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-optio-purple"
              />
              {devCode && (
                <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Local dev: the code is {devCode}
                </p>
              )}
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="mt-4 w-full rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold py-2.5 disabled:opacity-50"
              >
                {busy ? 'Checking…' : 'Verify'}
              </button>
              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => setStep('phone')}
                  className="text-neutral-500 hover:text-neutral-800 underline"
                >
                  Use a different number
                </button>
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={busy || cooldown > 0}
                  className="text-optio-purple hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}
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
