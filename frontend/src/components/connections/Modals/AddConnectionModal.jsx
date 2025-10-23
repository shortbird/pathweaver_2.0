import React, { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

const AddConnectionModal = ({ isOpen, onClose, onSendRequest, isLoading = false }) => {
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
        className="relative bg-white rounded-[24px] shadow-[0_20px_60px_rgba(109,70,155,0.15)] p-8 sm:p-10 w-full max-w-[560px] animate-[modalEnter_300ms_ease-out]"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-500 transition-colors"
          aria-label="Close modal"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>

        {/* Title */}
        <h2
          id="modal-title"
          className="text-2xl font-bold text-neutral-700 mb-2"
          style={{ fontFamily: 'Poppins', fontWeight: 700 }}
        >
          Connect with a Learning Partner
        </h2>

        <p
          className="text-neutral-500 mb-6"
          style={{ fontFamily: 'Poppins', fontWeight: 500 }}
        >
          Enter their email address to send a connection request
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Email Input */}
          <div className="mb-6">
            <label
              htmlFor="email"
              className="block text-sm font-semibold text-neutral-700 mb-2"
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
              className={`w-full px-4 py-3 rounded-[12px] border-2 transition-all focus:outline-none ${
                errors.email
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-[#EEEBEF] focus:border-transparent focus:ring-2 focus:ring-offset-0'
              }`}
              style={{
                fontFamily: 'Poppins',
                fontWeight: 500,
              }}
              placeholder="friend@example.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
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
              className="block text-sm font-semibold text-neutral-700 mb-2"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Add a personal message (optional)
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => {
                if (e.target.value.length <= MAX_MESSAGE_LENGTH) {
                  setMessage(e.target.value)
                }
              }}
              className="w-full px-4 py-3 rounded-[12px] border-2 border-[#EEEBEF] focus:border-transparent focus:ring-2 focus:outline-none resize-none"
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
                className="text-xs text-neutral-400"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                {message.length}/{MAX_MESSAGE_LENGTH} characters
              </p>
            </div>
          </div>

          {/* Tip */}
          <div className="bg-neutral-50 rounded-[12px] p-4 mb-6">
            <p
              className="text-sm text-neutral-500 flex items-start gap-2"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              <span className="text-xl flex-shrink-0">💡</span>
              <span>
                Shared learning journeys are more meaningful when you're both exploring similar interests!
              </span>
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-6 py-3 rounded-full font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isLoading || !email.trim()}
              className="px-8 py-3 rounded-full font-semibold bg-gradient-primary text-white shadow-[0_4px_20px_rgba(109,70,155,0.15)] hover:shadow-[0_6px_25px_rgba(109,70,155,0.25)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              {isLoading ? 'Sending...' : 'Send Connection Request'}
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

export default AddConnectionModal
