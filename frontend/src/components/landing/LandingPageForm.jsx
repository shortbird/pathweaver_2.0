import { useState } from 'react'
import { Check, Loader } from 'lucide-react'

const LandingPageForm = ({
  campaignSource,
  fields = [],
  submitText = 'Submit',
  successMessage = 'Thank you for signing up!',
  successSubtitle = 'We will be in touch soon.',
  apiEndpoint = null,
}) => {
  const [formData, setFormData] = useState(() => {
    const initialData = {}
    fields.forEach(field => {
      initialData[field.name] = ''
    })
    return initialData
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
      const endpoint = apiEndpoint || `/api/promo/${campaignSource}`

      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          source: campaignSource
        }),
      })

      const result = await response.json()

      if (response.ok) {
        // Meta Pixel tracking (if available)
        if (typeof fbq !== 'undefined') {
          fbq('track', 'Lead', {
            content_name: `${campaignSource} Landing Page`,
            value: 0.00,
            currency: 'USD'
          })
        }

        setIsSubmitting(false)
        setSubmitted(true)
      } else {
        throw new Error(result.error || 'Failed to submit form')
      }
    } catch (err) {
      console.error('Form submission error:', err)
      setError(err.message || 'Something went wrong. Please try again.')
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div
        id="signup-form"
        className="max-w-2xl mx-auto py-16 px-4 text-center"
      >
        <div className="bg-white rounded-2xl shadow-xl p-12 border-2 border-green-500">
          <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-fade-in">
            <Check className="w-10 h-10 text-white" />
          </div>
          <h2
            className="text-3xl text-gray-900 mb-4"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            {successMessage}
          </h2>
          <p
            className="text-lg text-gray-600"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            {successSubtitle}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      id="signup-form"
      className="max-w-2xl mx-auto py-16 px-4"
    >
      <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12 border border-gray-200">
        <form onSubmit={handleSubmit} className="space-y-6">
          {fields.map((field) => (
            <div key={field.name}>
              <label
                htmlFor={field.name}
                className="block text-sm text-gray-700 mb-2"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>

              {field.type === 'select' ? (
                <select
                  id={field.name}
                  name={field.name}
                  value={formData[field.name]}
                  onChange={handleInputChange}
                  required={field.required}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-pink focus:border-optio-pink transition-colors"
                  style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                >
                  <option value="">{field.placeholder}</option>
                  {field.options?.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  id={field.name}
                  name={field.name}
                  value={formData[field.name]}
                  onChange={handleInputChange}
                  required={field.required}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-pink focus:border-optio-pink transition-colors resize-none"
                  placeholder={field.placeholder}
                  style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                />
              ) : (
                <input
                  id={field.name}
                  type={field.type || 'text'}
                  name={field.name}
                  value={formData[field.name]}
                  onChange={handleInputChange}
                  required={field.required}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-pink focus:border-optio-pink transition-colors"
                  placeholder={field.placeholder}
                  style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                />
              )}

              {field.helpText && (
                <p className="text-sm text-gray-500 mt-1" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  {field.helpText}
                </p>
              )}
            </div>
          ))}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              <p style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-primary text-white py-4 px-6 rounded-lg text-lg hover:shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            {isSubmitting ? (
              <>
                <Loader className="w-5 h-5 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              submitText
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LandingPageForm
