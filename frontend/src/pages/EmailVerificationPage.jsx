import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'

/**
 * Email confirmation — the user types the 6-digit code we email after signup,
 * which verifies their account and logs them straight in. (Replaced the old
 * "check your email / click the link" flow; Optio now confirms via a code on
 * both web and mobile.)
 */
const EmailVerificationPage = () => {
  const location = useLocation()
  const { verifyEmailOtp } = useAuth()
  const email = location.state?.email || ''

  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  const handleVerify = async (e) => {
    e?.preventDefault?.()
    const trimmed = code.trim()
    if (trimmed.length < 6 || !email) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    setError('')
    setSubmitting(true)
    const result = await verifyEmailOtp(email, trimmed)
    setSubmitting(false)
    if (!result.success) {
      setError(result.error || 'That code is incorrect or expired. Please try again.')
    }
    // On success, verifyEmailOtp redirects to the role dashboard.
  }

  const handleResend = async () => {
    if (!email) {
      toast.error('No email address found. Please register again.')
      return
    }
    setResending(true)
    try {
      const response = await api.post('/api/auth/resend-verification', { email })
      setResent(true)
      toast.success(response.data?.message || 'A new code is on its way.')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to resend the code.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-purple-100 mb-4">
            <svg className="h-12 w-12 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <h2 className="text-3xl font-bold text-gray-900 mb-2">Enter Your Code</h2>
          <p className="text-lg text-gray-600">
            We emailed a 6-digit code to
            {email ? <> <span className="font-semibold text-gray-900">{email}</span></> : ' your email address'}.
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-5">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => { setError(''); setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6)) }}
            placeholder="000000"
            className="w-full text-center text-3xl font-bold tracking-[0.5em] px-4 py-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-20 focus:border-primary transition-all"
            aria-label="6-digit verification code"
          />

          {error && <p className="text-sm text-red-600 text-center" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={submitting || code.length < 6}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Verifying…' : 'Verify & Continue'}
          </button>
        </form>

        <div className="text-center space-y-3">
          <p className="text-sm text-gray-500">
            Didn't get it? Check your spam folder, or{' '}
            <button
              onClick={handleResend}
              disabled={resending || resent}
              className="font-medium text-optio-purple hover:text-purple-500 disabled:opacity-50"
            >
              {resending ? 'sending…' : resent ? 'code sent' : 'resend the code'}
            </button>
          </p>
          <div className="pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              <Link to="/login" className="font-medium text-optio-purple hover:text-purple-500">Back to Login</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EmailVerificationPage
