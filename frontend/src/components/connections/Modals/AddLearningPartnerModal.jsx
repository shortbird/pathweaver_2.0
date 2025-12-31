import React, { useState, useEffect } from 'react'
import { Modal, Alert, FormField, FormFooter } from '../../ui'

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Connect with a Learning Partner"
      size="sm"
    >
      <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
        Enter their email to send a connection request. You'll be able to see what they're learning and celebrate their progress together.
      </p>

      <form onSubmit={handleSubmit}>
        {/* Email Input */}
        <FormField
          label="Email Address"
          required
          error={errors.email}
          inputProps={{
            id: 'email',
            type: 'email',
            value: email,
            onChange: (e) => {
              setEmail(e.target.value)
              setErrors({ ...errors, email: null })
            },
            placeholder: 'partner@example.com',
            autoFocus: true,
            className: 'min-h-[44px] text-base touch-manipulation',
            style: { fontFamily: 'Poppins', fontWeight: 500 }
          }}
        />

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
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-optio-purple focus:outline-none resize-none min-h-[100px] text-base touch-manipulation"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            rows={3}
            placeholder="I'm exploring [topic] and would love to connect and share our learning journeys!"
            maxLength={MAX_MESSAGE_LENGTH}
          />
          <div className="flex justify-between items-center mt-1">
            <p className="text-xs text-gray-400" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              {message.length}/{MAX_MESSAGE_LENGTH} characters
            </p>
          </div>
        </div>

        {/* Tip */}
        <Alert variant="purple" className="mb-6">
          <p className="text-sm flex items-start gap-2" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            <span className="text-xl flex-shrink-0">💡</span>
            <span>
              Shared learning journeys are more meaningful when you're both exploring similar interests!
            </span>
          </p>
        </Alert>

        {/* Actions */}
        <FormFooter
          onCancel={onClose}
          onSubmit={handleSubmit}
          cancelText="Cancel"
          submitText={isLoading ? 'Sending...' : 'Send Request'}
          isSubmitting={isLoading}
          disabled={isLoading || !email.trim()}
        />
      </form>
    </Modal>
  )
}

export default AddLearningPartnerModal
