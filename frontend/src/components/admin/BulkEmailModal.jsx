import React, { useState, memo } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { Modal, Alert, FormFooter } from '../ui'

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
        await api.post('/api/admin/users/bulk-email', {
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
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Send Bulk Email"
      size="md"
      className="max-w-full sm:max-w-3xl mx-2 sm:mx-0"
      footer={
        <FormFooter
          onCancel={onClose}
          onSubmit={handleSendEmails}
          cancelText="Cancel"
          submitText={sending ? 'Sending...' : 'Send Email'}
          isSubmitting={sending}
        />
      }
    >
      <div className="space-y-4">
        {/* Recipients Preview */}
        <Alert variant="info">
          <p className="text-sm font-semibold mb-2">
            Sending to {selectedUserIds.length} users:
          </p>
          <div className="flex flex-wrap gap-2">
            {users.slice(0, 5).map(user => (
              <span key={user.id} className="px-2 py-1 bg-white rounded text-sm min-h-[36px] flex items-center">
                {user.first_name} {user.last_name}
              </span>
            ))}
            {users.length > 5 && (
              <span className="px-2 py-1 bg-white rounded text-sm text-gray-500">
                +{users.length - 5} more
              </span>
            )}
          </div>
        </Alert>

        {/* Template Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Template
          </label>
          <select
            value={emailData.template}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple min-h-[44px]"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple min-h-[44px]"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple min-h-[200px]"
          />
          <p className="text-sm text-gray-500 mt-1">
            Available variables: {`{{first_name}}, {{last_name}}, {{email}}, {{total_xp}}`}
          </p>
        </div>
      </div>
    </Modal>
  )
}

export default memo(BulkEmailModal)