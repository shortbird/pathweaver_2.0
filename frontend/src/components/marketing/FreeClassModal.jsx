import React, { useEffect, useRef, useState } from 'react'
import api from '../../services/api'
import { captureEvent } from '../../services/posthog'
import { trackEvent } from '../../utils/metaPixel'

const FreeClassModal = ({ open, onClose, source = 'classes_lp' }) => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const dialogRef = useRef(null)

  // Focus the email field on open; close on Escape.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  // Reset state whenever the modal is reopened so a returning visitor sees the form again.
  useEffect(() => {
    if (open) {
      setEmail('')
      setError('')
      setSubmitted(false)
      setLoading(false)
    }
  }, [open])

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/api/contact', {
        // Backend requires a name; the modal is intentionally email-only for
        // friction. Tag the placeholder name so leads of this type are easy
        // to filter in contact_submissions.
        name: 'Free Class Lead',
        email: email.trim(),
        type: 'claim_free_class',
      })
      setSubmitted(true)
      captureEvent('marketing_form_submitted', { source, lead_type: 'claim_free_class' })
      // Meta Pixel conversion. No PII (no email/name) is sent to the pixel —
      // K-12 audience; the helper no-ops off prod / for logged-in users.
      trackEvent('Lead', { content_name: 'Free Class' })
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) onClose?.()
  }

  return (
    <div
      ref={dialogRef}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="free-class-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8 overflow-y-auto"
    >
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-8 sm:p-10">
          {submitted ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3
                id="free-class-modal-title"
                className="text-2xl font-bold text-gray-900 mb-2"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Check your inbox
              </h3>
              <p className="text-gray-600 text-base" style={{ fontFamily: 'Poppins' }}>
                Your free class details are on the way. We'll email you back personally — no automated spam.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 text-sm font-semibold text-optio-purple hover:text-optio-pink transition-colors"
                style={{ fontFamily: 'Poppins' }}
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h3
                  id="free-class-modal-title"
                  className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2"
                  style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                >
                  Get your first class on us!
                </h3>
                <p className="text-gray-600 text-base" style={{ fontFamily: 'Poppins' }}>
                  Drop your email and we'll send you everything you need to get your first class free.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="free-class-email" className="sr-only">Email address</label>
                  <input
                    id="free-class-email"
                    ref={inputRef}
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    autoComplete="email"
                    className="w-full px-4 py-3.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-optio-pink focus:border-transparent text-base"
                    style={{ fontFamily: 'Poppins' }}
                  />
                </div>

                {error && (
                  <p className="text-red-600 text-sm" style={{ fontFamily: 'Poppins' }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold py-3.5 rounded-lg text-lg shadow-md hover:shadow-lg hover:opacity-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                >
                  {loading ? 'Sending...' : 'Get my free class'}
                </button>

                <p className="text-center text-gray-500 text-xs" style={{ fontFamily: 'Poppins' }}>
                  We'll email you personally. No spam, no sharing your address.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default FreeClassModal
