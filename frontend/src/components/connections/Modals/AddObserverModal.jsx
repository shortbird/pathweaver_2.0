import React, { useState, useEffect } from 'react'
import { EyeIcon } from '@heroicons/react/24/outline'
import { Modal, Alert, FormField, FormFooter } from '../../ui'

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      header={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <EyeIcon className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            Request Observer
          </h2>
        </div>
      }
    >
      <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
        Request to add an observer who can support your learning journey. An admin will review your request.
      </p>

      {/* Info Box */}
      <Alert variant="info" className="mb-6">
        Your request will be reviewed by an admin who will verify and add this observer to your account if approved.
      </Alert>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        {/* Name Input */}
        <FormField
          label="Observer Full Name"
          required
          error={errors.name}
          inputProps={{
            id: 'name',
            type: 'text',
            value: formData.name,
            onChange: (e) => handleInputChange('name', e.target.value),
            placeholder: 'Dr. Jane Smith',
            autoFocus: true,
            style: { fontFamily: 'Poppins', fontWeight: 500 }
          }}
        />

        {/* Email Input */}
        <FormField
          label="Observer Email Address"
          required
          error={errors.email}
          inputProps={{
            id: 'email',
            type: 'email',
            value: formData.email,
            onChange: (e) => handleInputChange('email', e.target.value),
            placeholder: 'observer@example.com',
            style: { fontFamily: 'Poppins', fontWeight: 500 }
          }}
        />

        {/* Relationship Dropdown */}
        <div className="mb-4">
          <label
            htmlFor="relationship"
            className="block text-sm font-semibold text-gray-700 mb-2"
            style={{ fontFamily: 'Poppins', fontWeight: 600 }}
          >
            Relationship <span className="text-red-500">*</span>
          </label>
          <select
            id="relationship"
            value={formData.relationship}
            onChange={(e) => handleInputChange('relationship', e.target.value)}
            className={`w-full px-4 py-3 rounded-lg border-2 transition-all focus:outline-none appearance-none bg-white ${
              errors.relationship
                ? 'border-red-500 focus:border-red-500'
                : 'border-gray-200 focus:border-optio-purple'
            }`}
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            {relationshipOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.relationship && (
            <p className="text-red-500 text-sm mt-1" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
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
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-optio-purple focus:outline-none resize-none"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            rows={3}
            placeholder="Dr. Smith is my biology teacher and has been supporting my science journey..."
            maxLength={MAX_MESSAGE_LENGTH}
          />
          <div className="flex justify-between items-center mt-1">
            <p className="text-xs text-gray-400" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              {formData.message.length}/{MAX_MESSAGE_LENGTH} characters
            </p>
          </div>
        </div>

        {/* Actions */}
        <FormFooter
          onCancel={onClose}
          onSubmit={handleSubmit}
          cancelText="Cancel"
          submitText={isLoading ? 'Submitting...' : 'Submit Request'}
          isSubmitting={isLoading}
          disabled={isLoading || !formData.name.trim() || !formData.email.trim() || !formData.relationship}
        />
      </form>
    </Modal>
  )
}

export default AddObserverModal
