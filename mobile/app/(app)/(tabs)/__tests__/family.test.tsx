/**
 * Family/Parent dashboard screen tests.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import ParentDashboardPage from '../family';
import { useMyChildren, useChildDashboard } from '@/src/hooks/useParent';
import { useGlobalEngagement } from '@/src/hooks/useDashboard';
import { useFamilyStore } from '@/src/stores/familyStore';
import { setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { createMockChild } from '@/src/__tests__/utils/mockFactories';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

jest.mock('@/src/hooks/useParent', () => ({
  useMyChildren: jest.fn(),
  useChildDashboard: jest.fn(),
}));
jest.mock('@/src/hooks/useDashboard', () => ({
  useDashboard: jest.fn(() => ({ data: null, loading: false })),
  useGlobalEngagement: jest.fn(),
}));
jest.mock('@/src/components/engagement/EngagementCalendar', () => ({
  EngagementCalendar: () => null,
}));
jest.mock('@/src/components/engagement/RhythmBadge', () => ({
  RhythmBadge: () => null,
}));
jest.mock('@/src/components/layouts/MobileHeader', () => ({
  PageHeader: () => null,
}));

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
  (useGlobalEngagement as jest.Mock).mockReturnValue({ data: null, loading: false });
  useFamilyStore.getState().clear();
});

/** useMyChildren is mocked, so seed the store the way the real hook does. */
function withChildren(children: any[]) {
  (useMyChildren as jest.Mock).mockReturnValue({ children, loading: false });
  useFamilyStore.setState({ parentId: 'parent-1', children, selectedChildId: children[0]?.id || null });
}

afterEach(() => {
  clearAuthState();
});

describe('ParentDashboardPage', () => {
  it('shows child hero card with stats when children exist', async () => {
    const children = [createMockChild()];
    withChildren(children);

    const { getAllByText, getByText } = render(<ParentDashboardPage />);

    // 'Jane Bowman' renders in multiple places (selector header, child list,
    // hero card heading) — verify the child is rendered, not that it appears
    // exactly once.
    await waitFor(() => {
      expect(getAllByText('Jane Bowman').length).toBeGreaterThan(0);
    });
    expect(getByText('Total XP')).toBeTruthy();
  });

  it('shows empty state when no children linked', () => {
    (useMyChildren as jest.Mock).mockReturnValue({ children: [], loading: false });

    const { getByText } = render(<ParentDashboardPage />);

    expect(getByText('No students linked')).toBeTruthy();
    expect(getByText('Add a Child')).toBeTruthy();
  });

  it('reads the selected child from the family store and offers the child\'s own surfaces', async () => {
    const kids = [createMockChild({ id: 'kid-a', first_name: 'Romney', last_name: 'Hanna', display_name: 'Romney Hanna' }),
                  createMockChild({ id: 'kid-b', first_name: 'Hope', last_name: 'Hanna', display_name: 'Hope Hanna' })];
    withChildren(kids);
    useFamilyStore.setState({ selectedChildId: 'kid-b' });

    const { getByText, getByTestId } = render(<ParentDashboardPage />);

    await waitFor(() => {
      expect(getByText('Hope Hanna')).toBeTruthy();
    });
    // Rhythm is read for the selected child through the scoped hook.
    expect(useGlobalEngagement).toHaveBeenCalledWith('kid-b');
    // The child's quests and profile are one tap away, in scope.
    expect(getByTestId('family-open-quests')).toBeTruthy();
    expect(getByTestId('family-open-profile')).toBeTruthy();
  });
});
