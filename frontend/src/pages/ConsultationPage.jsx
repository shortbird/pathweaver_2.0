import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { UsersIcon, CheckCircleIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'

const ConsultationPage = () => {
  const [formData, setFormData] = useState({
    parentName: '',
    email: '',
    phone: '',
    notes: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
      const response = await fetch(`${apiUrl}/api/promo/consultation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (response.ok) {
        // Track consultation booking
        try {
          if (typeof fbq !== 'undefined') {
            fbq('track', 'Schedule', {
              content_name: 'Consultation Booking',
              value: 0.00,
              currency: 'USD'
            });
          }
        } catch (fbqError) {
          console.error('Meta Pixel tracking error:', fbqError);
        }

        setIsSubmitting(false)
        setSubmitted(true)
      } else {
        throw new Error(result.error || 'Failed to submit consultation request')
      }
    } catch (err) {
      console.error('Consultation booking error:', err)
      setError('There was an error submitting your request. Please try again or email us directly.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF]">
      {/* Back to Home Link */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <Link
          to="/"
          className="inline-flex items-center text-optio-purple hover:text-optio-pink font-semibold transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          Back to Home
        </Link>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {!submitted ? (
          <>
            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
                Schedule Your FREE Consultation
              </h1>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Connect with a licensed Optio teacher to discuss your family's learning journey. No pressure, no sales pitch—just a genuine conversation about how we can support you.
              </p>
            </div>

            {/* What to Expect */}
            <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 sm:p-8 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">What to Expect:</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-start">
                  <CheckCircleIcon className="w-5 h-5 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">30-minute video or phone call with a licensed teacher</span>
                </div>
                <div className="flex items-start">
                  <CheckCircleIcon className="w-5 h-5 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Discussion of your child's interests and your ideas</span>
                </div>
                <div className="flex items-start">
                  <CheckCircleIcon className="w-5 h-5 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Overview of how Optio could work for your family</span>
                </div>
                <div className="flex items-start">
                  <CheckCircleIcon className="w-5 h-5 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Answers to all your questions</span>
                </div>
              </div>
            </div>

            {/* Consultation Form */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 p-6 sm:p-8">
              {error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="parentName" className="block text-sm font-semibold text-gray-700 mb-2">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    id="parentName"
                    name="parentName"
                    value={formData.parentName}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6D469B] focus:border-optio-purple transition-colors"
                    placeholder="Your full name"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6D469B] focus:border-optio-purple transition-colors"
                    placeholder="your.email@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6D469B] focus:border-optio-purple transition-colors"
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div>
                  <label htmlFor="notes" className="block text-sm font-semibold text-gray-700 mb-2">
                    Tell Us About Your Situation (Optional)
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    rows="4"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6D469B] focus:border-optio-purple transition-colors resize-none"
                    placeholder="What are you hoping to learn more about? What ideas do you have? What interests does your child have?"
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-primary text-white py-4 px-6 rounded-lg font-bold text-lg hover:shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Submitting...
                    </div>
                  ) : (
                    'Request Your Free Consultation'
                  )}
                </button>
              </form>

              <p className="text-xs text-gray-500 text-center mt-6">
                We'll reach out within 24 hours to schedule your consultation. We respect your privacy—no spam, ever.
              </p>
            </div>
          </>
        ) : (
          /* Success State */
          <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 p-8 sm:p-12 text-center">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircleIcon className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Thank You!</h2>
            <p className="text-lg text-gray-700 mb-6 max-w-xl mx-auto">
              We've received your consultation request. An Optio teacher will reach out to you within 24 hours to schedule your free consultation.
            </p>
            <div className="bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF] rounded-xl p-6 mb-6">
              <p className="text-gray-700 mb-2">
                <strong>What happens next?</strong>
              </p>
              <p className="text-sm text-gray-600">
                Check your email for a confirmation message. We'll send you a calendar link to choose a time that works best for you, or we'll reach out directly to coordinate.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/"
                className="inline-flex items-center justify-center bg-gradient-primary text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all"
              >
                Return to Home
              </Link>
              <Link
                to="/demo"
                className="inline-flex items-center justify-center bg-white border-2 border-optio-purple text-optio-purple px-6 py-3 rounded-lg font-semibold hover:bg-optio-purple hover:text-white transition-all"
              >
                Explore Demo
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ConsultationPage
