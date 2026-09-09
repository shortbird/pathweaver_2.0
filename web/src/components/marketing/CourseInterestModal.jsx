import React, { useEffect, useRef, useState } from 'react'
import api from '../../services/api'
import ModalOverlay from '../ui/ModalOverlay'
import { captureEvent } from '../../services/posthog'
import { gaTrackEvent } from '../../services/googleAnalytics'
import { trackEvent } from '../../utils/metaPixel'

// Interest-capture for course purchases. Checkout isn't built yet, so this
// collects the lead (tagged course_purchase in contact_submissions) and we
// enroll them manually. Course title rides along in the message field.
const CourseInterestModal = ({ open, onClose, course = null, source = 'courses_catalog' }) => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  // Focus the name field on open. Escape/scroll-lock handled by ModalOverlay.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open])

  // Reset state whenever the modal is reopened so a returning visitor sees the form again.
  useEffect(() => {
    if (open) {
      setName('')
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
        name: name.trim(),
        email: email.trim(),
        type: 'course_purchase',
        message: course
          ? `Course purchase interest: ${course.title} ($149)`
          : 'Course purchase interest: no specific course selected ($149)',
      })
      setSubmitted(true)
      captureEvent('marketing_form_submitted', { source, lead_type: 'course_purchase', course: course?.slug })
      gaTrackEvent('generate_lead', { source, lead_type: 'course_purchase' }) // GA4 conversion (no PII)
      // Meta Pixel conversion. No PII is sent to the pixel — K-12 audience;
      // the helper no-ops off prod / for logged-in users.
      trackEvent('Lead', { content_name: 'Course Purchase' })
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose} className="backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-interest-modal-title"
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
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
                id="course-interest-modal-title"
                className="text-2xl font-bold text-gray-900 mb-2"
              >
                You're on the list
              </h3>
              <p className="text-gray-600 text-base">
                We'll email you personally to get you enrolled, usually within a day. No automated spam.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 text-sm font-semibold text-optio-purple hover:text-optio-pink transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h3
                  id="course-interest-modal-title"
                  className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2"
                >
                  {course ? `Get ${course.title}` : 'Get an Optio course'}
                </h3>
                <p className="text-gray-600 text-base">
                  $149 per course. Open to any age, with high school credit available. Drop your info and we'll reach out to get you enrolled.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="course-interest-name" className="sr-only">Your name</label>
                  <input
                    id="course-interest-name"
                    ref={inputRef}
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    className="w-full px-4 py-3.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-optio-pink focus:border-transparent text-base"
                  />
                </div>
                <div>
                  <label htmlFor="course-interest-email" className="sr-only">Email address</label>
                  <input
                    id="course-interest-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    autoComplete="email"
                    className="w-full px-4 py-3.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-optio-pink focus:border-transparent text-base"
                  />
                </div>

                {error && (
                  <p className="text-red-600 text-sm">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !name.trim() || !email.trim()}
                  className="btn-primary btn-lg w-full"
                >
                  {loading ? 'Sending...' : 'Request this course'}
                </button>

                <p className="text-center text-gray-500 text-xs">
                  We'll email you personally. No spam, no sharing your address.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}

export default CourseInterestModal
