/**
 * useNotifications hook tests - fetch, mark read, delete, unread count.
 */

import { renderHook } from '@testing-library/react-native';
import api from '@/src/services/api';
import { supabase } from '@/src/services/supabaseClient';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllRead,
  deleteNotification,
  isSchoolInboxNotice,
  useNotificationSubscription,
} from '../useNotifications';

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

// The school inbox is read in the web console, and this app has no screen for
// it. An alert about it used to ring the office's phones and open "not
// available in the mobile app" (iCreate, 2026-09-30: "I have this
// notification on my phone, but I can't find it"). The server now sends no
// push for it and leaves it out of this app's list and count; the live
// update has to be dropped too, or the badge counts a row the list never shows.
describe('school-inbox notices stay off the phone', () => {
  it('knows a school-inbox notice by its link', () => {
    expect(isSchoolInboxNotice({ link: '/inbox?tab=school&conversation=c1' })).toBe(true);
    expect(isSchoolInboxNotice({ link: '/inbox' })).toBe(true);
    expect(isSchoolInboxNotice({ link: '/communication?user=u1' })).toBe(false);
    expect(isSchoolInboxNotice({ link: null })).toBe(false);
    expect(isSchoolInboxNotice(undefined)).toBe(false);
  });

  it('drops the live update for one and passes every other', () => {
    let handler: (event: any) => void = () => {};
    (supabase.channel as jest.Mock).mockReturnValueOnce({
      on: jest.fn(function (this: any, _kind: string, _filter: any, cb: (event: any) => void) {
        handler = cb;
        return this;
      }),
      subscribe: jest.fn().mockReturnThis(),
    });
    const onNew = jest.fn();
    renderHook(() => useNotificationSubscription('u1', onNew));

    handler({ payload: { id: 'n1', link: '/inbox?tab=school&conversation=c1' } });
    expect(onNew).not.toHaveBeenCalled();

    handler({ payload: { id: 'n2', link: '/communication?user=u2' } });
    expect(onNew).toHaveBeenCalledWith({ id: 'n2', link: '/communication?user=u2' });
  });
});

