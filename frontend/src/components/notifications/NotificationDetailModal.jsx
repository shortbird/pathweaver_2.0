import React from 'react'
import ReactMarkdown from 'react-markdown'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { formatDistanceToNow } from 'date-fns'

/**
 * NotificationDetailModal
 *
 * Displays full notification content in a modal dialog.
 * For announcement-type notifications, renders markdown content.
 */
const NotificationDetailModal = ({ notification, isOpen, onClose }) => {
  if (!isOpen || !notification) return null

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  // Get full content from metadata if available, otherwise use message
  const fullContent = notification.metadata?.full_content || notification.message
  const authorName = notification.metadata?.author_name

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'quest_invitation':
        return '🎯'
      case 'announcement':
        return '📢'
      case 'badge_earned':
        return '🏆'
      case 'task_approved':
        return '✅'
      case 'observer_comment':
        return '💬'
      case 'task_revision_requested':
        return '📝'
      case 'parent_approval_required':
        return '👨‍👩‍👧'
      default:
        return '🔔'
    }
  }

  const getTypeLabel = (type) => {
    switch (type) {
      case 'quest_invitation':
        return 'Quest Invitation'
      case 'announcement':
        return 'Announcement'
      case 'badge_earned':
        return 'Badge Earned'
      case 'task_approved':
        return 'Task Approved'
      case 'observer_comment':
        return 'Observer Comment'
      case 'task_revision_requested':
        return 'Revision Requested'
      case 'parent_approval_required':
        return 'Approval Required'
      default:
        return 'Notification'
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />

      <div className="flex min-h-full items-center justify-center p-4">
        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between">
            <div className="flex-1 pr-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{getNotificationIcon(notification.type)}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-optio-purple/10 text-optio-purple">
                  {getTypeLabel(notification.type)}
                </span>
              </div>
              <h2 className="text-xl font-bold text-gray-900">{notification.title}</h2>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                {authorName && (
                  <>
                    <span>{authorName}</span>
                    <span>•</span>
                  </>
                )}
                <span>{formatDate(notification.created_at)}</span>
                <span className="text-gray-400">
                  ({formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })})
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
            {notification.type === 'announcement' && notification.metadata?.full_content ? (
              <div className="prose prose-sm max-w-none text-gray-700">
                <ReactMarkdown>{fullContent}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-gray-700">{fullContent}</p>
            )}

            {/* Action link if available */}
            {notification.link && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <a
                  href={notification.link}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
                >
                  View Details
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default NotificationDetailModal
