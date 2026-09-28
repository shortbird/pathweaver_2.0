import React, { useEffect, useState } from 'react'
import { BellIcon, CheckIcon, XMarkIcon, PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { useNotificationsFeed, useNotificationActions, useNotificationTypes } from '../../hooks/api/useNotifications'
import NotificationDetailModal from '../../components/notifications/NotificationDetailModal'
import SendNotificationModal from '../../components/notifications/SendNotificationModal'
import { GlassTabBar, Spinner } from '../../components/ui'

export const SEARCH_DEBOUNCE_MS = 300

/**
 * NotificationsPage
 *
 * Full page view of all user notifications with filtering, actions, and modals.
 * Search and the kind filter run on the server (04e24d8c, iCreate), so they
 * reach notifications older than the pages already loaded.
 * Reads and writes through hooks/api/useNotifications, the same cache the bell
 * uses, so the two never disagree about what has been read.
 */
const NotificationsPage = () => {
  const { user } = useAuth()
  const [filter, setFilter] = useState('all') // 'all' | 'unread'
  const [selectedNotification, setSelectedNotification] = useState(null)
  const [showSendModal, setShowSendModal] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  // One request per pause in typing, not one per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchInput])

  const { notifications, isLoading, isFetchingNextPage, hasMore, loadMore, refetch } =
    useNotificationsFeed({ unreadOnly: filter === 'unread', search, type: typeFilter, enabled: !!user?.id })
  const typeOptions = useNotificationTypes({ enabled: !!user?.id })
  const actions = useNotificationActions()
  const isFiltered = !!search || !!typeFilter

  // Check if user can send notifications
  const canSendNotifications = ['advisor', 'org_admin', 'superadmin'].includes(user?.role)

  const markAsRead = (notificationId) => actions.markRead(notificationId).catch(() => {})

  const markAllAsRead = async () => {
    try {
      await actions.markAllRead()
      toast.success('All notifications marked as read')
    } catch {
      toast.error('Failed to mark all as read')
    }
  }

  const dismissNotification = async (notificationId, e) => {
    e?.stopPropagation()
    try {
      await actions.dismiss(notificationId)
    } catch {
      toast.error('Failed to dismiss notification')
    }
  }

  const handleNotificationClick = (notification) => {
    // Mark as read when opened
    if (!notification.is_read) {
      markAsRead(notification.id)
    }
    setSelectedNotification(notification)
  }

  const handleSendSuccess = () => {
    setShowSendModal(false)
    refetch()
  }

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
      default:
        return '🔔'
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Send Notification Button - Only for admins/advisors */}
          {canSendNotifications && (
            <button
              onClick={() => setShowSendModal(true)}
              className="btn-primary"
            >
              <PlusIcon className="h-4 w-4" />
              Send Notification
            </button>
          )}

          {/* Filter Toggle */}
          <GlassTabBar
            className="!mx-0"
            tabs={[{ id: 'all', label: 'All' }, { id: 'unread', label: 'Unread' }]}
            active={filter}
            onSelect={setFilter}
            aria-label="Filter notifications"
          />

          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-optio-purple hover:text-optio-pink transition-colors"
            >
              <CheckIcon className="h-4 w-4" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Search and kind */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search notifications"
            aria-label="Search notifications"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple/30 focus:border-optio-purple"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Kind of notification"
          className="sm:w-56 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-optio-purple/30 focus:border-optio-purple"
        >
          <option value="">All kinds</option>
          {typeOptions.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Notification List */}
      {isLoading && notifications.length === 0 ? (
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <BellIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No notifications</h3>
          <p className="text-gray-500">
            {isFiltered
              ? 'Nothing matches that search. Try other words or another kind.'
              : filter === 'unread' ? "You're all caught up!" : "You don't have any notifications yet."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                !notification.is_read ? 'bg-optio-purple/5' : ''
              }`}
            >
              <div className="flex gap-4">
                <span className="text-2xl flex-shrink-0">
                  {getNotificationIcon(notification.type)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className={`text-sm ${!notification.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {notification.title}
                      </p>
                      {notification.message && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* View opens the same detail the row does (d1bb050c):
                          it used to follow the link straight away, which for
                          some notifications was a page the reader could not
                          open, while clicking the text showed the message.
                          The detail carries the link as its action. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleNotificationClick(notification)
                        }}
                        className="text-sm text-optio-purple hover:text-optio-pink font-medium"
                      >
                        View
                      </button>
                      {!notification.is_read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            markAsRead(notification.id)
                          }}
                          className="p-1 text-gray-400 hover:text-optio-purple transition-colors"
                          title="Mark as read"
                        >
                          <CheckIcon className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => dismissNotification(notification.id, e)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Dismiss notification"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load More */}
      {hasMore && notifications.length > 0 && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => loadMore()}
            disabled={isFetchingNextPage}
            className="px-4 py-2 text-sm font-medium text-optio-purple hover:text-optio-pink transition-colors disabled:opacity-50"
          >
            {isFetchingNextPage ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {/* Detail Modal */}
      <NotificationDetailModal
        notification={selectedNotification}
        isOpen={!!selectedNotification}
        onClose={() => setSelectedNotification(null)}
      />

      {/* Send Notification Modal */}
      {showSendModal && (
        <SendNotificationModal
          onClose={() => setShowSendModal(false)}
          onSuccess={handleSendSuccess}
        />
      )}
    </div>
  )
}

export default NotificationsPage
