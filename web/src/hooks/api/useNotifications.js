/**
 * Notifications: one read, one set of actions, one cache.
 *
 * The bell (components/notifications/NotificationBell) and the page
 * (pages/notifications/NotificationsPage) each fetched, polled, marked and
 * dismissed on their own local state until 2026-09-15, so a notification
 * read on the page stayed bold in the bell until its next poll. Both read
 * through here now: the bell the first ten with the realtime subscription,
 * the page an infinite list with the unread filter, and every action patches
 * every cached list at once and then refetches.
 *
 * Polling and refetch-on-focus are deliberate, not belt-and-braces: realtime
 * depends on a channel the cookie-authenticated client cannot always
 * subscribe to, and when it is not connected the count simply froze until a
 * full page load -- which reads as "I never get notified" (Gryffin,
 * 2026-08-27).
 */

import { useEffect, useCallback, useRef } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../services/supabaseClient'
import api from '../../services/api'

export const NOTIFICATIONS_KEY = ['notifications']
export const notificationKeys = {
  all: NOTIFICATIONS_KEY,
  list: (params) => [...NOTIFICATIONS_KEY, 'list', params],
  feed: (params) => [...NOTIFICATIONS_KEY, 'feed', params],
}

const PAGE_SIZE = 20

function listUrl({ page = 1, limit = 10, unreadOnly = false }) {
  return `/api/notifications?page=${page}&limit=${limit}${unreadOnly ? '&unread_only=true' : ''}`
}

/** Apply `fn` to every cached notifications payload (bell list, page feed). */
function patchEveryList(queryClient, fn) {
  queryClient.setQueriesData({ queryKey: NOTIFICATIONS_KEY }, (old) => {
    if (!old) return old
    if (old.pages) return { ...old, pages: old.pages.map(fn) }
    return fn(old)
  })
}

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
    queryKey: notificationKeys.list({ limit }),
    queryFn: async () => {
      const response = await api.get(listUrl({ limit }))
      return response.data
    },
    enabled,
    staleTime: 30000, // Consider fresh for 30 seconds
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
    ...queryOptions
  })
}

/**
 * The full list, a page at a time, with the unread filter -- what the
 * notifications page renders. `notifications` is every page so far.
 */
export const useNotificationsFeed = ({ unreadOnly = false, enabled = true } = {}) => {
  const query = useInfiniteQuery({
    queryKey: notificationKeys.feed({ unreadOnly }),
    queryFn: async ({ pageParam = 1 }) => {
      const response = await api.get(listUrl({ page: pageParam, limit: PAGE_SIZE, unreadOnly }))
      return response.data || { notifications: [] }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      (lastPage?.notifications || []).length === PAGE_SIZE ? pages.length + 1 : undefined,
    enabled,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  })
  const notifications = (query.data?.pages || []).flatMap((p) => p.notifications || [])
  return {
    notifications,
    unreadCount: query.data?.pages?.[0]?.unread_count ?? notifications.filter((n) => !n.is_read).length,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasMore: Boolean(query.hasNextPage),
    loadMore: query.fetchNextPage,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * The four things a reader does to notifications. Each patches every cached
 * list first (so the bell and the page agree at once), sends the write, and
 * refetches; a failed write refetches too, which restores whatever the patch
 * removed.
 */
export const useNotificationActions = () => {
  const queryClient = useQueryClient()
  const refetchAll = useCallback(
    () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
    [queryClient],
  )

  const markRead = useCallback(async (notificationId) => {
    patchEveryList(queryClient, (old) => {
      const was = (old.notifications || []).find((n) => n.id === notificationId)
      return {
        ...old,
        notifications: (old.notifications || []).map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)),
        unread_count: was && !was.is_read ? Math.max(0, (old.unread_count || 0) - 1) : old.unread_count,
      }
    })
    try {
      await api.put(`/api/notifications/${notificationId}/read`, {})
    } finally {
      refetchAll()
    }
  }, [queryClient, refetchAll])

  const markAllRead = useCallback(async () => {
    patchEveryList(queryClient, (old) => ({
      ...old,
      notifications: (old.notifications || []).map((n) => ({ ...n, is_read: true })),
      unread_count: 0,
    }))
    try {
      await api.put('/api/notifications/mark-all-read', {})
    } finally {
      refetchAll()
    }
  }, [queryClient, refetchAll])

  const dismiss = useCallback(async (notificationId) => {
    patchEveryList(queryClient, (old) => {
      const was = (old.notifications || []).find((n) => n.id === notificationId)
      return {
        ...old,
        notifications: (old.notifications || []).filter((n) => n.id !== notificationId),
        unread_count: was && !was.is_read ? Math.max(0, (old.unread_count || 0) - 1) : old.unread_count,
      }
    })
    try {
      await api.delete(`/api/notifications/${notificationId}`)
    } finally {
      refetchAll()
    }
  }, [queryClient, refetchAll])

  const dismissAll = useCallback(async () => {
    patchEveryList(queryClient, (old) => ({ ...old, notifications: [], unread_count: 0 }))
    try {
      await api.delete('/api/notifications/delete-all')
    } finally {
      refetchAll()
    }
  }, [queryClient, refetchAll])

  return { markRead, markAllRead, dismiss, dismissAll, refetchAll }
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
    queryClient.setQueryData(notificationKeys.list({ limit }), (oldData) => {
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
