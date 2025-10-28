import React, { useState } from 'react'
import { X, InformationCircleIcon } from 'lucide-react'

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

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Header */}
        <h2
          className="text-2xl font-bold mb-2 pr-8"
          style={{ fontFamily: 'Poppins', fontWeight: 700 }}
        >
          Invite a Parent or Guardian
        </h2>
        <p
          className="text-gray-600 mb-6"
          style={{ fontFamily: 'Poppins', fontWeight: 500 }}
        >
          Give your parent, guardian, or extended family member access to view your progress. They'll be able to see your completed quests, upcoming tasks, and celebrate your learning wins with you.
        </p>

        {/* Info Box */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-6">
          <p
            className="text-sm text-blue-900 font-medium flex items-start gap-2"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            <InformationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>
              They'll receive an email invitation. Once you approve their request, they'll have read-only access to your learning dashboard.
            </span>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Input */}
          <div>
            <label
              htmlFor="parent-email"
              className="block text-sm font-semibold text-gray-700 mb-2"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Parent/Guardian Email Address
            </label>
            <input
              type="email"
              id="parent-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parent@example.com"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-400 focus:outline-none transition-colors"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              required
              autoFocus
            />
          </div>

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
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-400 focus:outline-none transition-colors resize-none"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-full font-semibold hover:bg-gray-50 transition-all"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-full font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              disabled={isLoading || !email.trim()}
            >
              {isLoading ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default InviteParentModal
