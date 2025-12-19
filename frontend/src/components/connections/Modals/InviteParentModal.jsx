import React, { useState } from 'react'
import { InformationCircleIcon } from '@heroicons/react/24/outline'
import { Modal, Alert, FormField, FormFooter } from '../../ui'

const InviteParentModal = ({ isOpen, onClose, onSendInvite, isLoading }) => {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email.trim()) return

    onSendInvite(email.trim(), message.trim())
    // Reset form
    setEmail('')
    setMessage('')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite a Parent or Guardian"
      size="sm"
    >
      <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
        Give your parent, guardian, or extended family member access to view your progress. They'll be able to see your completed quests, upcoming tasks, and celebrate your learning wins with you.
      </p>

      {/* Info Box */}
      <Alert variant="info" className="mb-6">
        <div className="flex items-start gap-2">
          <InformationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            They'll receive an email invitation. Once you approve their request, they'll have read-only access to your learning dashboard.
          </span>
        </div>
      </Alert>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Input */}
        <FormField
          label="Parent/Guardian Email Address"
          required
          inputProps={{
            id: 'parent-email',
            type: 'email',
            value: email,
            onChange: (e) => setEmail(e.target.value),
            placeholder: 'parent@example.com',
            autoFocus: true,
            style: { fontFamily: 'Poppins', fontWeight: 500 }
          }}
        />

        {/* Optional Message */}
        <div>
          <label
            htmlFor="parent-message"
            className="block text-sm font-semibold text-gray-700 mb-2"
            style={{ fontFamily: 'Poppins', fontWeight: 600 }}
          >
            Personal Message (Optional)
          </label>
          <textarea
            id="parent-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a personal message to your invitation..."
            rows={3}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-optio-purple focus:outline-none transition-colors resize-none"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          />
        </div>

        {/* Action Buttons */}
        <FormFooter
          onCancel={onClose}
          onSubmit={handleSubmit}
          cancelText="Cancel"
          submitText={isLoading ? 'Sending...' : 'Send Invitation'}
          isSubmitting={isLoading}
          disabled={isLoading || !email.trim()}
        />
      </form>
    </Modal>
  )
}

export default InviteParentModal
