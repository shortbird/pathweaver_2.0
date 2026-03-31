/**
 * Notification hooks with real-time updates via Supabase Broadcast.
 *
 * Provides hooks for fetching notifications, tracking unread count,
 * and subscribing to real-time notification delivery.
 */

import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/src/services/supabaseClient';
import api from '@/src/services/api';

// ── Types ──

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  metadata: Record<string, any> | null;
  organization_id: string | null;
}

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
}

// ── Real-time subscription hook ──

/**
 * Subscribe to real-time notifications for a user.
 * Uses Supabase Realtime Broadcast on channel `notifications:{userId}`.
 */
export function useNotificationSubscription(
  userId: string | undefined,
  onNewNotification: (notification: Notification) => void,
) {
  const channelRef = useRef<any>(null);
  const callbackRef = useRef(onNewNotification);

  useEffect(() => {
    callbackRef.current = onNewNotification;
  }, [onNewNotification]);

  useEffect(() => {
    if (!userId) return;

    const channelName = `notifications:${userId}`;
    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'new_notification' }, (payload: any) => {
        if (payload.payload) {
          callbackRef.current?.(payload.payload);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId]);
}

// ── API helpers ──

export async function fetchNotifications(limit = 50, unreadOnly = false): Promise<{ notifications: Notification[]; unread_count: number }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (unreadOnly) params.append('unread_only', 'true');
  const { data } = await api.get(`/api/notifications?${params}`);
  return { notifications: data.notifications || [], unread_count: data.unread_count || 0 };
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await api.get('/api/notifications/unread-count');
  return data.unread_count || 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.put(`/api/notifications/${id}/read`, {});
}

export async function markAllRead(): Promise<void> {
  await api.put('/api/notifications/mark-all-read', {});
}

export async function deleteNotification(id: string): Promise<void> {
  await api.delete(`/api/notifications/${id}`);
}

export async function deleteAllNotifications(): Promise<void> {
  await api.delete('/api/notifications/delete-all');
}

// ── Combined hook ──

import { useState } from 'react';

/**
 * Full notification hook: fetch + real-time updates.
 */
export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (unreadOnly = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchNotifications(50, unreadOnly);
      setNotifications(result.notifications);
      setUnreadCount(result.unread_count);
    } catch (e: any) {
      setError(e.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (userId) load();
  }, [userId]);

  // Real-time handler
  const handleNewNotification = useCallback((notification: Notification) => {
    setNotifications(prev => {
      if (prev.some(n => n.id === notification.id)) return prev;
      return [notification, ...prev];
    });
    setUnreadCount(prev => prev + 1);
  }, []);

  useNotificationSubscription(userId, handleNewNotification);

  const markRead = useCallback(async (id: string) => {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(async () => {
    await markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, []);

  const remove = useCallback(async (id: string) => {
    const wasUnread = notifications.find(n => n.id === id)?.is_read === false;
    await deleteNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
  }, [notifications]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refetch: load,
    markRead,
    markAllAsRead,
    remove,
  };
}

/**
 * Lightweight hook for just the unread count with real-time.
 */
export function useUnreadCount(userId: string | undefined) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const c = await fetchUnreadCount();
        setCount(c);
      } catch { /* non-critical */ }
      finally { setLoading(false); }
    })();
  }, [userId]);

  const handleNew = useCallback(() => {
    setCount(prev => prev + 1);
  }, []);

  useNotificationSubscription(userId, handleNew);

  return { unreadCount: count, loading, setCount };
}
