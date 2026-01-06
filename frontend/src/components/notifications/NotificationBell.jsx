import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { BellIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { BellIcon as BellIconSolid } from '@heroicons/react/24/solid'
import api from '../../services/api'
import { formatDistanceToNow } from 'date-fns'

/**
 * NotificationBell component
 *
 * Displays a bell icon in the navigation with unread notification count.
 * Clicking opens a dropdown showing recent notifications.
 *
 * Features:
 * - Unread count badge
 * - Dropdown with recent notifications
 * - Mark as read on click
 * - Mark all as read button
 * - Link to full notifications page
 */
const NotificationBell = () => {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const dropdownRef = useRef(null)

  // Fetch notifications on mount and periodically
  useEffect(() => {
    fetchNotifications()

    // Poll for new notifications every 60 seconds
    const interval = setInterval(fetchNotifications, 60000)
    return () => clearInterval(interval)
  }, [])

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

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/api/notifications?limit=10')
      if (response.data) {
        setNotifications(response.data.notifications || [])
        setUnreadCount(response.data.unread_count || 0)
      }
    } catch (error) {
      // Silently fail - notifications are non-critical
      console.debug('Failed to fetch notifications:', error)
    }
  }

  const markAsRead = async (notificationId) => {
    try {
      await api.put(`/api/notifications/${notificationId}/read`, {})
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      await api.put('/api/notifications/read-all', {})
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error)
    }
  }

  const dismissNotification = async (e, notificationId) => {
    e.preventDefault()
    e.stopPropagation()
    const notification = notifications.find(n => n.id === notificationId)
    // Optimistic update - remove immediately
    setNotifications(prev => prev.filter(n => n.id !== notificationId))
    if (notification && !notification.is_read) {
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
    try {
      await api.delete(`/api/notifications/${notificationId}`)
    } catch (error) {
      // Restore on failure
      console.error('Failed to dismiss notification:', error)
      setNotifications(prev => [...prev, notification].sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      ))
      if (notification && !notification.is_read) {
        setUnreadCount(prev => prev + 1)
      }
    }
  }

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id)
    }
    setIsOpen(false)
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
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-optio-purple hover:text-optio-pink transition-colors"
              >
                Mark all as read
              </button>
            )}
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
                    <Link
                      to={notification.link || '/notifications'}
                      onClick={() => handleNotificationClick(notification)}
                      className={`block px-4 py-3 hover:bg-gray-50 transition-colors ${
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
                    </Link>
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
    </div>
  )
}

export default NotificationBell
