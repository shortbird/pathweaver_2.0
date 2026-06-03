/**
 * Notification hooks with real-time updates via Supabase Broadcast.
 *
 * Provides hooks for fetching notifications, tracking unread count,
 * and subscribing to real-time notification delivery.
 */

import { useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/src/services/supabaseClient';
import api from '@/src/services/api';

// expo-notifications isn't available on web; lazy-require on native only so a
// missing dep on web doesn't break the bundle.
let Notifications: typeof import('expo-notifications') | null = null;
if (Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications');
  } catch { /* dev fallback */ }
}

/**
 * Sync the iOS/Android app-icon badge to the in-app unread count. Push
 * delivery sets the badge automatically (shouldSetBadge: true), but the OS
 * has no way to know when the user reads/dismisses notifications inside the
 * app — so we have to push the cleared count back to it.
 */
async function syncAppIconBadge(count: number): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch { /* non-critical */ }
}

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
      // A failed fetch (incl. an unrecoverable 401) shows an inline error/empty
      // state — it must never crash the screen or cascade into a logout. The
      // interceptor decides on its own whether the session is genuinely gone.
      const status = e?.response?.status;
      setError(
        status === 401 || status === 403
          ? 'Your session needs attention. Pull to refresh to try again.'
          : e?.message || 'Failed to load notifications',
      );
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

  // Mutations swallow their own errors into `error` state: a failed mark/delete
  // on the notifications screen must never throw an unhandled rejection (which
  // would otherwise surface as a screen crash) — and certainly never log out.
  const markRead = useCallback(async (id: string) => {
    try {
      await markNotificationRead(id);
    } catch (e: any) {
      setError(e?.message || 'Failed to mark notification as read');
      return;
    }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => {
      const next = Math.max(0, prev - 1);
      syncAppIconBadge(next);
      return next;
    });
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await markAllRead();
    } catch (e: any) {
      setError(e?.message || 'Failed to mark all as read');
      return;
    }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
    syncAppIconBadge(0);
  }, []);

  const remove = useCallback(async (id: string) => {
    const wasUnread = notifications.find(n => n.id === id)?.is_read === false;
    try {
      await deleteNotification(id);
    } catch (e: any) {
      setError(e?.message || 'Failed to delete notification');
      return;
    }
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (wasUnread) {
      setUnreadCount(prev => {
        const next = Math.max(0, prev - 1);
        syncAppIconBadge(next);
        return next;
      });
    }
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
 *
 * Refetches on every screen focus so the badge stays in sync after the user
 * dismisses notifications elsewhere (this hook is mounted in MobileHeader on
 * each tab; expo-router's Tabs keeps screens alive, so the cached count would
 * otherwise go stale until the next app launch).
 */
export function useUnreadCount(userId: string | undefined) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const c = await fetchUnreadCount();
      setCount(c);
      syncAppIconBadge(c);
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-pull whenever the screen this hook is mounted under regains focus —
  // e.g., user comes back from the notifications screen after dismissing one.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleNew = useCallback(() => {
    setCount(prev => {
      const next = prev + 1;
      syncAppIconBadge(next);
      return next;
    });
  }, []);

  useNotificationSubscription(userId, handleNew);

  return { unreadCount: count, loading, setCount };
}
