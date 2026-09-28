import React from 'react'
import ReactMarkdown from 'react-markdown'
import { Link, useLocation } from 'react-router-dom'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { formatDistanceToNow } from 'date-fns'
import { safeHref } from '../../utils/safeHref'
import ModalOverlay from '../ui/ModalOverlay'
import HeldMessageDetail from './HeldMessageDetail'
import { useAuth } from '../../contexts/AuthContext'

const CTA_CLASS = 'inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 transition-opacity'

const ArrowRight = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
  </svg>
)

/**
 * NotificationDetailModal
 *
 * Displays full notification content in a modal dialog. Opened from the
 * notifications page AND from the bell dropdown, which is where most people
 * meet a notification -- so this is the surface that has to carry the whole
 * message, not a two-line clip of it.
 * For announcement-type notifications, renders markdown content.
 */
/**
 * Whether following `href` would leave the reader where they already are.
 *
 * A link with no query of its own lands on the same page when the paths match
 * (the old school-inbox notifications all said '/inbox', and "View details" on
 * /inbox just closed the modal -- iCreate, 11f6ad24). A link with a query is
 * the same place only when the query matches too: '/inbox?conversation=x'
 * opens a thread, which is exactly what the reader wants.
 */
export const linksToCurrentPage = (href, location) => {
  if (!href || !href.startsWith('/') || !location) return false
  const [hrefPath, hrefQuery = ''] = href.split('#')[0].split('?')
  const here = (location.pathname || '').replace(/\/+$/, '') || '/'
  const there = hrefPath.replace(/\/+$/, '') || '/'
  if (here !== there) return false
  if (!hrefQuery) return true
  return `?${hrefQuery}` === (location.search || '')
}

/**
 * Whether a reader with this role can open `href` at all. The /admin console
 * is superadmin-only; an org admin following a link into it bounced straight
 * back out (d1bb050c: a held-message notification linked /admin/moderation),
 * so for anybody else the button would be a lie. Every other in-app link is
 * the notifier's promise that the recipient can open it.
 */
export const canReachLink = (href, role) => {
  if (!href) return false
  const path = href.split(/[?#]/)[0]
  if (path === '/admin' || path.startsWith('/admin/')) return role === 'superadmin'
  return true
}

/**
 * The reader's role, or undefined outside an AuthProvider (the modal renders
 * bare in tests). useAuth() throws there; reading that as "not a superadmin"
 * only ever hides an /admin button. Not useContext(AuthContext): most suites
 * mock the AuthContext module with useAuth alone, and a missing export throws.
 */
function useViewerRole() {
  try {
    return useAuth()?.user?.role
  } catch {
    return undefined
  }
}

const NotificationDetailModal = ({ notification, isOpen, onClose }) => {
  const location = useLocation()
  const role = useViewerRole()
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
      case 'school_notice':
        return '🏫'
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
      case 'peer_text_held':
        return '🛡️'
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
      case 'school_notice':
        return 'From the school'
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
      case 'peer_text_held':
        return 'Safety Check'
      default:
        return 'Notification'
    }
  }

  // A held-message notification shows the message itself below.
  const heldMessageId = notification.type === 'peer_text_held'
    ? notification.metadata?.hold_id || null
    : null

  // The action is the notification's own link, for every type. A held
  // message used to drop it, which left the reader with the message and no
  // way to do anything about it (d1bb050c); the page it links to is where
  // the hold is released or kept. The notifications page is where this modal
  // is usually opened from, so a link back to it is a no-op button.
  const href = notification.link && notification.link !== '/notifications'
    ? safeHref(notification.link)
    : null
  const isInternal = !!href && href.startsWith('/')
  // A button that only closes the modal is a dead end, and one into a
  // console the reader cannot open is worse; leave both out.
  const showLink = !!href && href !== '#'
    && !linksToCurrentPage(href, location)
    && (!isInternal || canReachLink(href, role))
  const actionLabel = heldMessageId ? 'Review this message' : 'View Details'

  // Portalled, not a raw `fixed inset-0`. The bell that opens this sits inside
  // a z-30 sticky nav, and a modal nested in that stacking context paints
  // UNDER the rest of the page however high its own z-index goes.
  return (
    <ModalOverlay onClose={onClose}>
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
          {heldMessageId ? (
            // The hold itself replaces the notification text, which only
            // summarised it; the text comes back as the fallback if the
            // hold cannot be loaded.
            <HeldMessageDetail holdId={heldMessageId} fallback={fullContent} />
          ) : notification.type === 'announcement' && notification.metadata?.full_content ? (
            <div className="prose prose-sm max-w-none text-gray-700">
              <ReactMarkdown>{fullContent}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-gray-700">{fullContent}</p>
          )}

          {/* Action link if available. An internal path routes in place --
              a full page reload here threw away the app's loaded state and
              made "View Details" feel broken on a slow connection. */}
          {showLink && (
            <div className="mt-6 pt-4 border-t border-gray-100">
              {isInternal ? (
                <Link to={href} onClick={onClose} className={CTA_CLASS}>
                  {actionLabel}
                  <ArrowRight />
                </Link>
              ) : (
                <a href={href} target="_blank" rel="noopener noreferrer" className={CTA_CLASS}>
                  {actionLabel}
                  <ArrowRight />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}

export default NotificationDetailModal
