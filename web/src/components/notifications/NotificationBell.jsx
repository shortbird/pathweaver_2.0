import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { BellIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { BellIcon as BellIconSolid } from '@heroicons/react/24/solid'
import { formatDistanceToNow } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { useNotifications, useNotificationActions } from '../../hooks/api/useNotifications'
import NotificationDetailModal from './NotificationDetailModal'

/**
 * NotificationBell component
 *
 * Displays a bell icon in the navigation with unread notification count.
 * Clicking opens a dropdown showing recent notifications.
 *
 * The list, the polling, the realtime subscription and the four actions all
 * live in hooks/api/useNotifications, shared with the notifications page, so
 * a notification read on either surface is read on both at once.
 */
const NotificationBell = () => {
  const { user } = useAuth()
  const { notifications, unreadCount } = useNotifications(user?.id, { limit: 10 })
  const { markRead, markAllRead, dismiss, dismissAll } = useNotificationActions()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedNotification, setSelectedNotification] = useState(null)
  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const markAsRead = (notificationId) => markRead(notificationId).catch(() => {})
  const markAllAsRead = () => markAllRead().catch(() => {})
  const dismissAllNotifications = () => dismissAll().catch(() => {})
  const dismissNotification = (e, notificationId) => {
    e.preventDefault()
    e.stopPropagation()
    dismiss(notificationId).catch(() => {})
  }

  /**
   * Open the notification here, in the same modal the notifications page uses.
   *
   * This row used to be a bare link to notification.link, which failed two ways
   * at once (Gryffin, 2026-09-04). A link to the page you are already on does
   * nothing when clicked — "I got an alert about it but when I click on it to
   * see the alert nothing happens" — and even when it did navigate, the message
   * itself was clipped to two lines here, so the one thing the reader wanted
   * (which work is still open) was only ever legible after a detour through
   * /notifications. The modal shows the whole message and still offers the link
   * as a button, so nothing that used to navigate has lost the ability to.
   */
  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id)
    }
    setIsOpen(false)
    setSelectedNotification(notification)
  }

  const getNotificationIcon = (type) => {
    return null
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-optio-purple focus:outline-none focus:ring-2 focus:ring-optio-purple focus:ring-offset-2 rounded-full transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        {unreadCount > 0 ? (
          <BellIconSolid className="h-6 w-6" />
        ) : (
          <BellIcon className="h-6 w-6" />
        )}

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform bg-optio-pink rounded-full min-w-[20px]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 z-50 max-h-[70vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-optio-purple hover:text-optio-pink transition-colors"
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={dismissAllNotifications}
                  className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                >
                  Dismiss all
                </button>
              )}
            </div>
          </div>

          {/* Notification List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                <BellIcon className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <li key={notification.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={`block w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                        !notification.is_read ? 'bg-optio-purple/5' : ''
                      }`}
                    >
                      <div className="flex gap-3">
                        <span className="text-lg flex-shrink-0">
                          {getNotificationIcon(notification.type)}
                        </span>
                        <div className="flex-1 min-w-0 pr-6">
                          <p className={`text-sm ${!notification.is_read ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                            {notification.title}
                          </p>
                          {notification.message && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                              {notification.message}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        {!notification.is_read && (
                          <span className="flex-shrink-0 w-2 h-2 bg-optio-purple rounded-full mt-2" />
                        )}
                      </div>
                    </button>
                    <button
                      onClick={(e) => dismissNotification(e, notification.id)}
                      className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Dismiss notification"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-4 py-3">
            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              className="block text-center text-sm text-optio-purple hover:text-optio-pink transition-colors font-medium"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}

      <NotificationDetailModal
        notification={selectedNotification}
        isOpen={!!selectedNotification}
        onClose={() => setSelectedNotification(null)}
      />
    </div>
  )
}

export default NotificationBell
