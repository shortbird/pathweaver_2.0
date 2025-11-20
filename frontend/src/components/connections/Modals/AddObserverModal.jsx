import React, { useState, useEffect } from 'react'
import { XMarkIcon, EyeIcon, InformationCircleIcon } from '@heroicons/react/24/outline'

const AddObserverModal = ({ isOpen, onClose, onSendRequest, isLoading = false }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    relationship: '',
    message: ''
  })
  const [errors, setErrors] = useState({})

  const MAX_MESSAGE_LENGTH = 300

  const relationshipOptions = [
    { value: '', label: 'Select a relationship' },
    { value: 'teacher', label: 'Teacher' },
    { value: 'advisor', label: 'Advisor' },
    { value: 'mentor', label: 'Mentor' },
    { value: 'counselor', label: 'Counselor' },
    { value: 'coach', label: 'Coach' },
    { value: 'other', label: 'Other' }
  ]

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '',
        email: '',
        relationship: '',
        message: ''
      })
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

  const handleInputChange = (field, value) => {
    setFormData({ ...formData, [field]: value })
    setErrors({ ...errors, [field]: null })
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    // Validate
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Observer name is required'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!formData.relationship) {
      newErrors.relationship = 'Please select a relationship'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    onSendRequest({
      name: formData.name.trim(),
      email: formData.email.trim(),
      relationship: formData.relationship,
      message: formData.message.trim()
    })
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

        {/* Title with Icon */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <EyeIcon className="w-5 h-5 text-white" />
          </div>
          <h2
            id="modal-title"
            className="text-2xl font-bold text-gray-900"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Request Observer
          </h2>
        </div>

        <p
          className="text-gray-600 mb-6"
          style={{ fontFamily: 'Poppins', fontWeight: 500 }}
        >
          Request to add an observer who can support your learning journey. An admin will review your request.
        </p>

        {/* Info Box */}
        <div className="bg-blue-50 border-2 border-blue-100 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-2">
            <InformationCircleIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p
              className="text-sm text-blue-900"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              Your request will be reviewed by an admin who will verify and add this observer to your account if approved.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Name Input */}
          <div className="mb-4">
            <label
              htmlFor="name"
              className="block text-sm font-semibold text-gray-700 mb-2"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Observer Full Name
            </label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all focus:outline-none ${
                errors.name
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-gray-200 focus:border-blue-400'
              }`}
              style={{
                fontFamily: 'Poppins',
                fontWeight: 500,
              }}
              placeholder="Dr. Jane Smith"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
              autoFocus
            />
            {errors.name && (
              <p
                id="name-error"
                className="text-red-500 text-sm mt-1"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                {errors.name}
              </p>
            )}
          </div>

          {/* Email Input */}
          <div className="mb-4">
            <label
              htmlFor="email"
              className="block text-sm font-semibold text-gray-700 mb-2"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Observer Email Address
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all focus:outline-none ${
                errors.email
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-gray-200 focus:border-blue-400'
              }`}
              style={{
                fontFamily: 'Poppins',
                fontWeight: 500,
              }}
              placeholder="observer@example.com"
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

          {/* Relationship Dropdown */}
          <div className="mb-4">
            <label
              htmlFor="relationship"
              className="block text-sm font-semibold text-gray-700 mb-2"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Relationship
            </label>
            <select
              id="relationship"
              value={formData.relationship}
              onChange={(e) => handleInputChange('relationship', e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all focus:outline-none appearance-none bg-white ${
                errors.relationship
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-gray-200 focus:border-blue-400'
              }`}
              style={{
                fontFamily: 'Poppins',
                fontWeight: 500,
              }}
              aria-invalid={!!errors.relationship}
              aria-describedby={errors.relationship ? 'relationship-error' : undefined}
            >
              {relationshipOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.relationship && (
              <p
                id="relationship-error"
                className="text-red-500 text-sm mt-1"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                {errors.relationship}
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
              Why would you like this person as an observer? (Optional)
            </label>
            <textarea
              id="message"
              value={formData.message}
              onChange={(e) => {
                if (e.target.value.length <= MAX_MESSAGE_LENGTH) {
                  handleInputChange('message', e.target.value)
                }
              }}
              className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:outline-none resize-none"
              style={{
                fontFamily: 'Poppins',
                fontWeight: 500,
              }}
              rows={3}
              placeholder="Dr. Smith is my biology teacher and has been supporting my science journey..."
              maxLength={MAX_MESSAGE_LENGTH}
            />
            <div className="flex justify-between items-center mt-1">
              <p
                className="text-xs text-gray-400"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                {formData.message.length}/{MAX_MESSAGE_LENGTH} characters
              </p>
            </div>
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
              disabled={isLoading || !formData.name.trim() || !formData.email.trim() || !formData.relationship}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              {isLoading ? 'Submitting...' : 'Submit Request'}
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

export default AddObserverModal
