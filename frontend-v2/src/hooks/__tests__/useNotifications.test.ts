/**
 * useNotifications hook tests - fetch, mark read, delete, unread count.
 */

jest.mock('@/src/services/api', () => require('@/src/__tests__/utils/mockApi').mockApiModule());
jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: {
    restore: jest.fn(),
    setTokens: jest.fn().mockResolvedValue(undefined),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
  },
}));

// Mock supabase channel for real-time (no-op)
jest.mock('@/src/services/supabaseClient', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    })),
    removeChannel: jest.fn(),
  },
}));

import { renderHook, act, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllRead,
  deleteNotification,
} from '../useNotifications';

const mockNotifications = [
  { id: 'n1', user_id: 'u1', type: 'task_approved', title: 'Task Approved!', message: '+50 XP', is_read: false, created_at: '2026-03-31T10:00:00Z', link: '/quests', metadata: null, organization_id: null },
  { id: 'n2', user_id: 'u1', type: 'announcement', title: 'New Announcement', message: 'Hello everyone', is_read: true, created_at: '2026-03-30T10:00:00Z', link: null, metadata: { full_content: 'Full announcement text here' }, organization_id: null },
];

describe('useNotifications API helpers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetchNotifications calls GET /api/notifications with params', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { notifications: mockNotifications, unread_count: 1 },
    });

    const result = await fetchNotifications(50, false);

    expect(api.get).toHaveBeenCalledWith('/api/notifications?limit=50');
    expect(result.notifications).toHaveLength(2);
    expect(result.unread_count).toBe(1);
  });

  it('fetchNotifications passes unread_only param', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { notifications: [mockNotifications[0]], unread_count: 1 },
    });

    await fetchNotifications(50, true);

    expect(api.get).toHaveBeenCalledWith('/api/notifications?limit=50&unread_only=true');
  });

  it('fetchUnreadCount calls GET /api/notifications/unread-count', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { unread_count: 3 },
    });

    const count = await fetchUnreadCount();

    expect(api.get).toHaveBeenCalledWith('/api/notifications/unread-count');
    expect(count).toBe(3);
  });

  it('markNotificationRead calls PUT with empty body', async () => {
    (api.put as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    await markNotificationRead('n1');

    expect(api.put).toHaveBeenCalledWith('/api/notifications/n1/read', {});
  });

  it('markAllRead calls PUT /api/notifications/mark-all-read', async () => {
    (api.put as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    await markAllRead();

    expect(api.put).toHaveBeenCalledWith('/api/notifications/mark-all-read', {});
  });

  it('deleteNotification calls DELETE /api/notifications/:id', async () => {
    (api.delete as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    await deleteNotification('n1');

    expect(api.delete).toHaveBeenCalledWith('/api/notifications/n1');
  });
});
