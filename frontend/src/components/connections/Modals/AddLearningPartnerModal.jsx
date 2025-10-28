import React, { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

const AddLearningPartnerModal = ({ isOpen, onClose, onSendRequest, isLoading = false }) => {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState({})

  const MAX_MESSAGE_LENGTH = 200

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setEmail('')
      setMessage('')
      setErrors({})
    }
  }, [isOpen])

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Trap focus in modal
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(email)
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    // Validate
    const newErrors = {}
    if (!email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!validateEmail(email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    onSendRequest(email.trim(), message.trim())
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-xl p-6 sm:p-8 w-full max-w-md animate-[modalEnter_300ms_ease-out]"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close modal"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>

        {/* Title */}
        <h2
          id="modal-title"
          className="text-2xl font-bold text-gray-900 mb-2 pr-8"
          style={{ fontFamily: 'Poppins', fontWeight: 700 }}
        >
          Connect with a Learning Partner
        </h2>

        <p
          className="text-gray-600 mb-6"
          style={{ fontFamily: 'Poppins', fontWeight: 500 }}
        >
          Enter their email to send a connection request. You'll be able to see what they're learning and celebrate their progress together.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Email Input */}
          <div className="mb-6">
            <label
              htmlFor="email"
              className="block text-sm font-semibold text-gray-700 mb-2"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setErrors({ ...errors, email: null })
              }}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all focus:outline-none ${
                errors.email
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-gray-200 focus:border-purple-400'
              }`}
              style={{
                fontFamily: 'Poppins',
                fontWeight: 500,
              }}
              placeholder="partner@example.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              autoFocus
            />
            {errors.email && (
              <p
                id="email-error"
                className="text-red-500 text-sm mt-1"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                {errors.email}
              </p>
            )}
          </div>

          {/* Message Input */}
          <div className="mb-6">
            <label
              htmlFor="message"
              className="block text-sm font-semibold text-gray-700 mb-2"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Add a Personal Message (Optional)
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => {
                if (e.target.value.length <= MAX_MESSAGE_LENGTH) {
                  setMessage(e.target.value)
                }
              }}
              className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-purple-400 focus:outline-none resize-none"
              style={{
                fontFamily: 'Poppins',
                fontWeight: 500,
              }}
              rows={3}
              placeholder="I'm exploring [topic] and would love to connect and share our learning journeys!"
              maxLength={MAX_MESSAGE_LENGTH}
            />
            <div className="flex justify-between items-center mt-1">
              <p
                className="text-xs text-gray-400"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                {message.length}/{MAX_MESSAGE_LENGTH} characters
              </p>
            </div>
          </div>

          {/* Tip */}
          <div className="bg-purple-50 border-2 border-purple-100 rounded-xl p-4 mb-6">
            <p
              className="text-sm text-purple-900 flex items-start gap-2"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              <span className="text-xl flex-shrink-0">💡</span>
              <span>
                Shared learning journeys are more meaningful when you're both exploring similar interests!
              </span>
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-full font-semibold hover:bg-gray-50 transition-all disabled:opacity-50"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isLoading || !email.trim()}
              className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-full font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              {isLoading ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        </form>
      </div>

      {/* Animation styles */}
      <style>{`
        @keyframes modalEnter {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  )
}

export default AddLearningPartnerModal
