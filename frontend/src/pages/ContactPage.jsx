import React, { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircleIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import api from '../services/api'

const ContactPage = () => {
  const [searchParams] = useSearchParams()
  const type = searchParams.get('type') || 'general'

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    organization: '',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState(null)

  const getPageTitle = () => {
    switch (type) {
      case 'demo':
        return 'Learn More About Optio'
      case 'sales':
        return 'Contact Sales'
      default:
        return 'Contact Us'
    }
  }

  const getPageSubtitle = () => {
    switch (type) {
      case 'demo':
        return "Tell us a bit about yourself and we'll send you more information about how Optio can work for your microschool or family."
      case 'sales':
        return "Interested in Optio for your organization? Let's discuss how we can support your learning community."
      default:
        return "Have questions? We'd love to hear from you."
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      await api.post('/api/contact', {
        ...formData,
        type,
      })
      setIsSubmitted(true)
    } catch (err) {
      console.error('Contact form error:', err)
      setError('Something went wrong. Please try again or email us directly at support@optioeducation.com')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircleIcon className="w-10 h-10 text-green-600" />
          </div>
          <h1
            className="text-3xl font-bold text-gray-900 mb-4"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Thank You!
          </h1>
          <p
            className="text-gray-600 mb-8"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            {type === 'demo'
              ? "Thanks for your interest! We'll send you more information about Optio soon."
              : "We've received your message and will get back to you soon."
            }
          </p>
          <Link
            to="/"
            className="inline-flex items-center text-optio-purple hover:text-optio-pink transition-colors"
            style={{ fontFamily: 'Poppins', fontWeight: 600 }}
          >
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] py-12 px-4">
      <div className="max-w-xl mx-auto">
        {/* Back Link */}
        <Link
          to="/"
          className="inline-flex items-center text-gray-600 hover:text-optio-purple transition-colors mb-8"
          style={{ fontFamily: 'Poppins', fontWeight: 500 }}
        >
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          Back to Home
        </Link>

        {/* Header */}
        <div className="text-center mb-10">
          <h1
            className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            {getPageTitle()}
          </h1>
          <p
            className="text-gray-600 text-lg"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            {getPageSubtitle()}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-2"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple transition-colors"
              style={{ fontFamily: 'Poppins' }}
              placeholder="Your name"
            />
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-2"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple transition-colors"
              style={{ fontFamily: 'Poppins' }}
              placeholder="you@example.com"
            />
          </div>

          {/* Organization (optional for demo/sales) */}
          {(type === 'demo' || type === 'sales') && (
            <div>
              <label
                htmlFor="organization"
                className="block text-sm font-medium text-gray-700 mb-2"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                Organization Name <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                id="organization"
                name="organization"
                value={formData.organization}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple transition-colors"
                style={{ fontFamily: 'Poppins' }}
                placeholder="Your school or organization"
              />
            </div>
          )}

          {/* Message */}
          <div>
            <label
              htmlFor="message"
              className="block text-sm font-medium text-gray-700 mb-2"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              {type === 'demo' ? 'Tell us about your situation' : 'Message'}{' '}
              <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              id="message"
              name="message"
              rows={4}
              value={formData.message}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple transition-colors resize-none"
              style={{ fontFamily: 'Poppins' }}
              placeholder={
                type === 'demo'
                  ? "How many students? What are you hoping to achieve? Any specific features you're interested in?"
                  : "How can we help you?"
              }
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg" style={{ fontFamily: 'Poppins' }}>
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-optio-purple to-optio-pink text-white py-4 px-6 rounded-lg font-semibold hover:shadow-lg transform hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            {isSubmitting ? 'Sending...' : type === 'demo' ? 'Get Info' : 'Send Message'}
          </button>

          {/* Privacy Note */}
          <p
            className="text-sm text-gray-500 text-center"
            style={{ fontFamily: 'Poppins', fontWeight: 400 }}
          >
            By submitting this form, you agree to our{' '}
            <Link to="/privacy" className="text-optio-purple hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </div>
    </div>
  )
}

export default ContactPage
