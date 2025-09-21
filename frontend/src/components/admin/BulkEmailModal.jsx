import React, { useState, memo } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

const BulkEmailModal = ({ selectedUserIds, users, onClose, onSend }) => {
  const [emailData, setEmailData] = useState({
    subject: '',
    message: '',
    template: 'custom'
  })
  const [sending, setSending] = useState(false)

  const emailTemplates = {
    custom: { subject: '', message: '' },
    welcome_back: {
      subject: 'We miss you at OptioQuest!',
      message: `Hi {{first_name}},

We noticed you haven't been active recently. Your learning journey is waiting for you!

Check out our latest quests and continue building your skills.

Best regards,
The OptioQuest Team`
    },
    new_feature: {
      subject: 'Exciting New Features at OptioQuest',
      message: `Hi {{first_name}},

We've added some amazing new features to enhance your learning experience:
- New quest categories
- Improved XP tracking
- Collaboration features

Log in to explore what's new!

The OptioQuest Team`
    },
    achievement: {
      subject: 'Congratulations on Your Progress!',
      message: `Hi {{first_name}},

You're making incredible progress on your learning journey! Keep up the great work.

Your current XP: {{total_xp}}
Quests completed: {{quests_completed}}

Ready for your next challenge?

The OptioQuest Team`
    }
  }

  const handleTemplateChange = (template) => {
    setEmailData({
      ...emailData,
      template,
      subject: emailTemplates[template].subject,
      message: emailTemplates[template].message
    })
  }

  const handleSendEmails = async () => {
    if (!emailData.subject || !emailData.message) {
      toast.error('Please provide both subject and message')
      return
    }

    if (window.confirm(`Send email to ${selectedUserIds.length} users?`)) {
      setSending(true)
      try {
        await api.post('/api/v3/admin/users/bulk-email', {
          user_ids: selectedUserIds,
          subject: emailData.subject,
          message: emailData.message
        })
        toast.success(`Email sent to ${selectedUserIds.length} users`)
        onSend()
      } catch (error) {
        toast.error('Failed to send emails')
      } finally {
        setSending(false)
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">Send Bulk Email</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Recipients Preview */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-900 mb-2">
              Sending to {selectedUserIds.length} users:
            </p>
            <div className="flex flex-wrap gap-2">
              {users.slice(0, 5).map(user => (
                <span key={user.id} className="px-2 py-1 bg-white rounded text-sm">
                  {user.first_name} {user.last_name}
                </span>
              ))}
              {users.length > 5 && (
                <span className="px-2 py-1 bg-white rounded text-sm text-gray-500">
                  +{users.length - 5} more
                </span>
              )}
            </div>
          </div>

          {/* Template Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Template
            </label>
            <select
              value={emailData.template}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="custom">Custom Message</option>
              <option value="welcome_back">Welcome Back</option>
              <option value="new_feature">New Feature Announcement</option>
              <option value="achievement">Achievement Celebration</option>
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subject
            </label>
            <input
              type="text"
              value={emailData.subject}
              onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
              placeholder="Enter email subject..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              value={emailData.message}
              onChange={(e) => setEmailData({ ...emailData, message: e.target.value })}
              rows={10}
              placeholder="Enter your message..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              Available variables: {`{{first_name}}, {{last_name}}, {{email}}, {{total_xp}}`}
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSendEmails}
              disabled={sending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {sending ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(BulkEmailModal)