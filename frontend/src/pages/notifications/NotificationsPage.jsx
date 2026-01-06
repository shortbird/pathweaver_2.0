import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BellIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'react-hot-toast'

/**
 * NotificationsPage
 *
 * Full page view of all user notifications with filtering and actions.
 */
const NotificationsPage = () => {
  const [notifications, setNotifications] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all' | 'unread'
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    fetchNotifications(true)
  }, [filter])

  const fetchNotifications = async (reset = false) => {
    try {
      setIsLoading(true)
      const currentPage = reset ? 1 : page
      const response = await api.get(`/api/notifications?page=${currentPage}&limit=20${filter === 'unread' ? '&unread_only=true' : ''}`)

      if (response.data) {
        const newNotifications = response.data.notifications || []
        if (reset) {
          setNotifications(newNotifications)
          setPage(1)
        } else {
          setNotifications(prev => [...prev, ...newNotifications])
        }
        setHasMore(newNotifications.length === 20)
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
      toast.error('Failed to load notifications')
    } finally {
      setIsLoading(false)
    }
  }

  const markAsRead = async (notificationId) => {
    try {
      await api.put(`/api/notifications/${notificationId}/read`, {})
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      )
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      await api.put('/api/notifications/read-all', {})
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      toast.success('All notifications marked as read')
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error)
      toast.error('Failed to mark all as read')
    }
  }

  const dismissNotification = async (notificationId) => {
    const notification = notifications.find(n => n.id === notificationId)
    // Optimistic update - remove immediately
    setNotifications(prev => prev.filter(n => n.id !== notificationId))
    try {
      await api.delete(`/api/notifications/${notificationId}`)
    } catch (error) {
      // Restore on failure
      console.error('Failed to dismiss notification:', error)
      toast.error('Failed to dismiss notification')
      setNotifications(prev => [...prev, notification].sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      ))
    }
  }

  const loadMore = () => {
    setPage(prev => prev + 1)
    fetchNotifications()
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
          {/* Filter Toggle */}
          <div className="flex rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                filter === 'all'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                filter === 'unread'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Unread
            </button>
          </div>

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

      {/* Notification List */}
      {isLoading && notifications.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <BellIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No notifications</h3>
          <p className="text-gray-500">
            {filter === 'unread' ? "You're all caught up!" : "You don't have any notifications yet."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-100">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-4 hover:bg-gray-50 transition-colors ${
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
                        <p className="text-sm text-gray-500 mt-1">
                          {notification.message}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {notification.link && (
                        <Link
                          to={notification.link}
                          onClick={() => !notification.is_read && markAsRead(notification.id)}
                          className="text-sm text-optio-purple hover:text-optio-pink font-medium"
                        >
                          View
                        </Link>
                      )}
                      {!notification.is_read && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          className="p-1 text-gray-400 hover:text-optio-purple transition-colors"
                          title="Mark as read"
                        >
                          <CheckIcon className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => dismissNotification(notification.id)}
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
            onClick={loadMore}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-optio-purple hover:text-optio-pink transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

export default NotificationsPage
