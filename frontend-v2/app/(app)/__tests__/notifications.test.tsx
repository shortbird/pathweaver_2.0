/**
 * Notifications page tests - rendering, filter tabs, empty state, broadcast modal.
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
jest.mock('@/src/services/supabaseClient', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    })),
    removeChannel: jest.fn(),
  },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import NotificationsScreen from '../notifications';
import api from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';

const mockNotifications = [
  { id: 'n1', type: 'task_approved', title: 'Task Approved!', message: '+50 XP', is_read: false, created_at: '2026-03-31T10:00:00Z', link: '/quests', metadata: null },
  { id: 'n2', type: 'announcement', title: 'Announcement', message: 'Hello', is_read: true, created_at: '2026-03-30T10:00:00Z', link: null, metadata: { full_content: 'Full text' } },
];

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    user: { id: 'u1', email: 'test@test.com', role: 'student' } as any,
    isAuthenticated: true,
    isLoading: false,
  });
  (api.get as jest.Mock).mockResolvedValue({
    data: { notifications: mockNotifications, unread_count: 1 },
  });
});

describe('NotificationsScreen', () => {
  it('renders notification list after loading', async () => {
    const { getByText } = render(<NotificationsScreen />);

    await waitFor(() => {
      expect(getByText('Task Approved!')).toBeTruthy();
      expect(getByText('Announcement')).toBeTruthy();
    });
  });

  it('shows filter tabs (All and Unread)', async () => {
    const { getByText } = render(<NotificationsScreen />);

    await waitFor(() => {
      expect(getByText('All')).toBeTruthy();
      expect(getByText('Unread (1)')).toBeTruthy();
    });
  });

  it('shows empty state when no notifications', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: { notifications: [], unread_count: 0 },
    });

    const { getByText } = render(<NotificationsScreen />);

    await waitFor(() => {
      expect(getByText('No notifications yet')).toBeTruthy();
    });
  });

  it('marks notification as read on tap', async () => {
    (api.put as jest.Mock).mockResolvedValue({ data: { success: true } });

    const { getByText } = render(<NotificationsScreen />);

    await waitFor(() => {
      expect(getByText('Task Approved!')).toBeTruthy();
    });

    fireEvent.press(getByText('Task Approved!'));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/notifications/n1/read', {});
    });
  });
});
