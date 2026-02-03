/**
 * Real-time Notifications Hooks
 *
 * Provides hooks for fetching notifications and subscribing to real-time updates
 * via Supabase Realtime Broadcast channels.
 */

import { useEffect, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../services/supabaseClient'
import api from '../../services/api'

/**
 * Subscribe to real-time notifications for a user.
 *
 * Uses Supabase Realtime Broadcast to receive instant notification delivery.
 * Each user has their own channel: 'notifications:{user_id}'
 *
 * @param {string} userId - The user ID to subscribe for
 * @param {function} onNewNotification - Callback when new notification arrives
 * @returns {void}
 */
export const useNotificationSubscription = (userId, onNewNotification) => {
  const channelRef = useRef(null)
  const callbackRef = useRef(onNewNotification)

  // Keep callback ref updated without triggering re-subscription
  useEffect(() => {
    callbackRef.current = onNewNotification
  }, [onNewNotification])

  useEffect(() => {
    if (!userId) return

    const channelName = `notifications:${userId}`

    // Create channel subscription
    const channel = supabase.channel(channelName)
      .on('broadcast', { event: 'new_notification' }, (payload) => {
        if (payload.payload) {
          callbackRef.current?.(payload.payload)
        }
      })
      .subscribe()

    channelRef.current = channel

    // Cleanup on unmount or userId change
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [userId]) // Only re-subscribe when userId changes
}

/**
 * Fetch notifications with React Query.
 *
 * @param {object} options - Query options
 * @param {number} options.limit - Max notifications to fetch (default: 10)
 * @param {boolean} options.enabled - Whether to enable the query (default: true)
 * @returns {object} React Query result
 */
export const useNotificationsQuery = (options = {}) => {
  const { limit = 10, enabled = true, ...queryOptions } = options

  return useQuery({
    queryKey: ['notifications', { limit }],
    queryFn: async () => {
      const response = await api.get(`/api/notifications?limit=${limit}`)
      return response.data
    },
    enabled,
    staleTime: 30000, // Consider fresh for 30 seconds
    refetchOnWindowFocus: true,
    ...queryOptions
  })
}

/**
 * Combined hook for notifications with real-time updates.
 *
 * Fetches initial notifications and subscribes to real-time updates.
 * Automatically updates the cache when new notifications arrive.
 *
 * @param {string} userId - The user ID
 * @param {object} options - Query options
 * @returns {object} { notifications, unreadCount, isLoading, error, refetch }
 */
export const useNotifications = (userId, options = {}) => {
  const queryClient = useQueryClient()
  const { limit = 10, enabled = true } = options

  // Fetch initial notifications
  const {
    data,
    isLoading,
    error,
    refetch
  } = useNotificationsQuery({ limit, enabled: enabled && !!userId })

  // Handle new notification from real-time subscription
  const handleNewNotification = useCallback((notification) => {
    // Update the notifications cache optimistically
    queryClient.setQueryData(['notifications', { limit }], (oldData) => {
      if (!oldData) return oldData

      const currentNotifications = oldData.notifications || []

      // Check if notification already exists (prevent duplicates)
      const exists = currentNotifications.some(n => n.id === notification.id)
      if (exists) return oldData

      // Add new notification at the beginning
      const updatedNotifications = [notification, ...currentNotifications].slice(0, limit)

      return {
        ...oldData,
        notifications: updatedNotifications,
        unread_count: (oldData.unread_count || 0) + 1
      }
    })
  }, [queryClient, limit])

  // Subscribe to real-time notifications
  useNotificationSubscription(userId, handleNewNotification)

  return {
    notifications: data?.notifications || [],
    unreadCount: data?.unread_count || 0,
    isLoading,
    error,
    refetch
  }
}

/**
 * Hook for just the unread count with real-time updates.
 *
 * Lighter weight than full notifications - useful for badge display.
 *
 * @param {string} userId - The user ID
 * @returns {object} { unreadCount, isLoading, increment, decrement, reset }
 */
export const useUnreadCount = (userId) => {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-unread-count', userId],
    queryFn: async () => {
      const response = await api.get('/api/notifications?limit=1')
      return response.data?.unread_count || 0
    },
    enabled: !!userId,
    staleTime: 30000
  })

  const increment = useCallback(() => {
    queryClient.setQueryData(['notifications-unread-count', userId], (old) => (old || 0) + 1)
  }, [queryClient, userId])

  const decrement = useCallback(() => {
    queryClient.setQueryData(['notifications-unread-count', userId], (old) => Math.max(0, (old || 0) - 1))
  }, [queryClient, userId])

  const reset = useCallback(() => {
    queryClient.setQueryData(['notifications-unread-count', userId], 0)
  }, [queryClient, userId])

  return {
    unreadCount: data || 0,
    isLoading,
    increment,
    decrement,
    reset
  }
}
