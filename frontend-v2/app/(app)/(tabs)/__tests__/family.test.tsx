/**
 * Family/Parent dashboard screen tests.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

jest.mock('@/src/hooks/useParent', () => ({
  useMyChildren: jest.fn(),
  useChildDashboard: jest.fn(),
  useChildEngagement: jest.fn(),
}));
jest.mock('@/src/hooks/useFeed', () => ({
  useFeed: jest.fn(),
}));
jest.mock('@/src/components/engagement/EngagementCalendar', () => ({
  EngagementCalendar: () => null,
}));
jest.mock('@/src/components/engagement/RhythmBadge', () => ({
  RhythmBadge: () => null,
}));
jest.mock('@/src/components/feed/FeedCard', () => ({
  FeedCard: () => null,
}));
jest.mock('@/src/components/layouts/MobileHeader', () => ({
  PageHeader: () => null,
}));

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import ParentDashboardPage from '../family';
import { useMyChildren, useChildDashboard, useChildEngagement } from '@/src/hooks/useParent';
import { useFeed } from '@/src/hooks/useFeed';
import { setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { createMockChild } from '@/src/__tests__/utils/mockFactories';

beforeEach(() => {
  setAuthAsParent();
  jest.clearAllMocks();
  (useChildDashboard as jest.Mock).mockReturnValue({
    data: {
      stats: { total_xp: 850, active_quests_count: 2, completed_quests_count: 3, completed_tasks_count: 15 },
      active_quests: [],
      completed_quests: [],
    },
    loading: false,
    refetch: jest.fn(),
  });
  (useChildEngagement as jest.Mock).mockReturnValue({ data: null, loading: false });
  (useFeed as jest.Mock).mockReturnValue({
    items: [], loading: false, loadingMore: false, hasMore: false, error: null, loadMore: jest.fn(), refetch: jest.fn(),
  });
});

afterEach(() => {
  clearAuthState();
});

describe('ParentDashboardPage', () => {
  it('shows child hero card with stats when children exist', async () => {
    const children = [createMockChild()];
    (useMyChildren as jest.Mock).mockReturnValue({ children, loading: false });

    const { getByText } = render(<ParentDashboardPage />);

    await waitFor(() => {
      expect(getByText('Jane Bowman')).toBeTruthy();
    });
    expect(getByText('Total XP')).toBeTruthy();
  });

  it('shows empty state when no children linked', () => {
    (useMyChildren as jest.Mock).mockReturnValue({ children: [], loading: false });

    const { getByText } = render(<ParentDashboardPage />);

    expect(getByText('No students linked')).toBeTruthy();
    expect(getByText('Add a Child')).toBeTruthy();
  });
});
