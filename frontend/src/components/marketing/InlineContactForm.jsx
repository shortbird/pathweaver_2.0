import React, { useState } from 'react'
import api from '../../services/api'
import { captureEvent } from '../../services/posthog'

const InlineContactForm = ({ source = 'general', heading = 'Get More Info', subheading = 'Drop your info and we\'ll reach out with everything you need.', placeholder = 'Tell us about your situation...' }) => {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await api.post('/api/contact', {
        name: form.name,
        email: form.email,
        message: form.message || undefined,
        type: source,
      })
      setSubmitted(true)
      captureEvent('marketing_form_submitted', { source, has_message: !!form.message })
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="get-info" className="py-16 sm:py-20 px-4 bg-gradient-to-br from-gray-900 to-gray-800 text-white scroll-mt-16">
      <div className="max-w-lg mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
          {heading}
        </h2>
        <p className="text-gray-300 mb-8 text-lg" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
          {subheading}
        </p>

        {submitted ? (
          <div className="bg-white/10 rounded-2xl p-8 backdrop-blur-sm">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>You're in!</h3>
            <p className="text-gray-300" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>We'll be in touch soon with next steps.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div>
              <label htmlFor={`${source}-name`} className="block text-sm font-medium text-gray-300 mb-1" style={{ fontFamily: 'Poppins' }}>
                Your Name
              </label>
              <input
                id={`${source}-name`}
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-optio-pink focus:border-transparent"
                style={{ fontFamily: 'Poppins' }}
                placeholder="First and last name"
              />
            </div>
            <div>
              <label htmlFor={`${source}-email`} className="block text-sm font-medium text-gray-300 mb-1" style={{ fontFamily: 'Poppins' }}>
                Email
              </label>
              <input
                id={`${source}-email`}
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-optio-pink focus:border-transparent"
                style={{ fontFamily: 'Poppins' }}
                placeholder="you@email.com"
              />
            </div>
            <div>
              <label htmlFor={`${source}-message`} className="block text-sm font-medium text-gray-300 mb-1" style={{ fontFamily: 'Poppins' }}>
                Message <span className="text-gray-500">(optional)</span>
              </label>
              <textarea
                id={`${source}-message`}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={3}
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-optio-pink focus:border-transparent resize-none"
                style={{ fontFamily: 'Poppins' }}
                placeholder={placeholder}
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm" style={{ fontFamily: 'Poppins' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold py-3 rounded-lg text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              {loading ? 'Sending...' : 'Get Started'}
            </button>
            <p className="text-center text-gray-500 text-xs mt-2" style={{ fontFamily: 'Poppins' }}>
              We'll email you back personally. No automated spam.
            </p>
          </form>
        )}
      </div>
    </section>
  )
}

export default InlineContactForm
