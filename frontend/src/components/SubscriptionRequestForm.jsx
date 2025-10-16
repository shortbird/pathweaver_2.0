import React, { useState } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'

const SubscriptionRequestForm = ({ tier, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    tier_requested: tier?.tier_key || '',
    contact_preference: 'email',
    phone_number: '',
    message: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Validate form
      if (!formData.tier_requested) {
        toast.error('Please select a tier')
        setIsSubmitting(false)
        return
      }

      if (formData.contact_preference === 'phone' && !formData.phone_number.trim()) {
        toast.error('Please provide a phone number')
        setIsSubmitting(false)
        return
      }

      // Submit the request
      const response = await api.post('/api/subscription-requests/submit', {
        tier_requested: formData.tier_requested,
        contact_preference: formData.contact_preference,
        phone_number: formData.phone_number.trim() || null,
        message: formData.message.trim() || null
      })

      if (response.data.success) {
        toast.success('Request submitted! Our support team will contact you soon.')
        if (onSuccess) {
          onSuccess(response.data)
        }
        onClose()
      }
    } catch (error) {
      console.error('Error submitting subscription request:', error)
      const errorMessage = error.response?.data?.error || 'Failed to submit request. Please try again.'
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] px-6 py-4 rounded-t-xl flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">
              Request {tier?.display_name || tier?.tier_key} Upgrade
            </h2>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-1 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Tier Info */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h3 className="font-semibold text-purple-900 mb-2">
                About {tier?.display_name}
              </h3>
              <p className="text-sm text-purple-700 mb-2">{tier?.description}</p>
              <p className="text-lg font-bold text-purple-900">
                ${parseFloat(tier?.price_monthly || 0).toFixed(2)}/month
              </p>
            </div>

            {/* Contact Preference */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How would you like our support team to reach you?
              </label>
              <div className="space-y-2">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="contact_preference"
                    value="email"
                    checked={formData.contact_preference === 'email'}
                    onChange={(e) =>
                      setFormData({ ...formData, contact_preference: e.target.value })
                    }
                    className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-gray-700">Email (recommended)</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="contact_preference"
                    value="phone"
                    checked={formData.contact_preference === 'phone'}
                    onChange={(e) =>
                      setFormData({ ...formData, contact_preference: e.target.value })
                    }
                    className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-gray-700">Phone call</span>
                </label>
              </div>
            </div>

            {/* Phone Number (conditional) */}
            {formData.contact_preference === 'phone' && (
              <div>
                <label
                  htmlFor="phone_number"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Phone Number *
                </label>
                <input
                  type="tel"
                  id="phone_number"
                  value={formData.phone_number}
                  onChange={(e) =>
                    setFormData({ ...formData, phone_number: e.target.value })
                  }
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>
            )}

            {/* Optional Message */}
            <div>
              <label
                htmlFor="message"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Anything you'd like to share? (optional)
              </label>
              <textarea
                id="message"
                value={formData.message}
                onChange={(e) =>
                  setFormData({ ...formData, message: e.target.value })
                }
                rows={4}
                placeholder="Share your goals, questions, or why you're interested in this tier..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">What happens next?</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>✓ Our support team will review your request</li>
                <li>✓ We'll reach out within 24-48 hours</li>
                <li>✓ You'll discuss your goals and see if it's the right fit</li>
                <li>✓ If so, we'll help you get started immediately</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg font-bold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>

            {/* Privacy Note */}
            <p className="text-xs text-gray-500 text-center">
              Your information will only be used to contact you about your subscription request.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}

export default SubscriptionRequestForm
