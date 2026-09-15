/**
 * Family tab: every child as a card, the family's quests, one settings
 * sheet (2026-09-15, with the web's /family).
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import ParentDashboardPage from '../family';
import { useMyChildren, useChildDashboard } from '@/src/hooks/useParent';
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
jest.mock('@/src/hooks/useFamilyQuests', () => ({
  useFamilyQuests: jest.fn(() => ({ quests: [], loading: false, refetch: jest.fn(), enrollChildren: jest.fn(), endMemberQuest: jest.fn() })),
  createFamilyQuest: jest.fn(),
}));
jest.mock('@/src/hooks/useFamilyCover', () => ({
  useFamilyCover: jest.fn(() => ({ url: null, loading: false, busy: false, upload: jest.fn(), remove: jest.fn() })),
}));
jest.mock('@/src/hooks/useWeeklyXpGoal', () => ({
  useWeeklyXpGoal: jest.fn(() => ({ goal: null, loading: false, saving: false, save: jest.fn(), clear: jest.fn() })),
  XP_GOAL_PRESETS: [250, 500, 750, 1000],
}));
jest.mock('@/src/hooks/useConnectionApprovals', () => ({
  useConnectionApprovals: jest.fn(() => ({
    data: { pending: [], approved: [] }, loading: false, busy: false, refetch: jest.fn(), decide: jest.fn(), revoke: jest.fn(),
  })),
  forChild: (data: any, id: string) => ({
    pending: (data?.pending || []).filter((r: any) => r.child?.id === id),
    approved: (data?.approved || []).filter((r: any) => r.child?.id === id),
  }),
}));
jest.mock('@/src/hooks/useFerpaApprovals', () => ({
  useFerpaApprovals: jest.fn(() => ({ requests: [], loading: false, count: 0, refetch: jest.fn(), respond: jest.fn() })),
}));
jest.mock('@/src/components/layouts/MobileHeader', () => ({
  PageHeader: () => null,
}));

beforeEach(() => {
  setAuthAsParent();
  jest.clearAllMocks();
  (useChildDashboard as jest.Mock).mockReturnValue({
    data: {
      student: { total_xp: 850, streak_days: 3, avatar_url: null },
      learning_rhythm: { last_activity_date: new Date().toISOString() },
      stats: { total_xp: 850, active_quests_count: 2, completed_quests_count: 3, completed_tasks_count: 15 },
      active_quests: [
        { quest_id: 'q-1', title: 'Build a drone', rhythm: { state: 'in_flow', state_display: 'In Flow', message: '', pattern_description: '', last_7_days: [] } },
      ],
    },
    loading: false,
    refetch: jest.fn(),
  });
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
  it('shows every child as a card with their numbers and quests', async () => {
    const kids = [
      createMockChild({ id: 'kid-a', first_name: 'Romney', last_name: 'Hanna', display_name: 'Romney Hanna' }),
      createMockChild({ id: 'kid-b', first_name: 'Hope', last_name: 'Hanna', display_name: 'Hope Hanna' }),
    ];
    withChildren(kids);

    const { getByTestId, getAllByText, getByText } = render(<ParentDashboardPage />);

    await waitFor(() => expect(getByTestId('child-card-kid-a')).toBeTruthy());
    expect(getByTestId('child-card-kid-b')).toBeTruthy();
    expect(getByText('Romney Hanna')).toBeTruthy();
    expect(getByText('Hope Hanna')).toBeTruthy();
    // Each card reads its own summary.
    expect(useChildDashboard).toHaveBeenCalledWith('kid-a');
    expect(useChildDashboard).toHaveBeenCalledWith('kid-b');
    expect(getAllByText(/850 XP · 2 active quests · 3-day streak · Active/).length).toBe(2);
    expect(getAllByText('Build a drone').length).toBe(2);
    // The family's quests and the settings gear are on the page.
    expect(getByTestId('family-quests')).toBeTruthy();
    expect(getByTestId('family-settings')).toBeTruthy();
  });

  it('shows empty state when no children linked', () => {
    (useMyChildren as jest.Mock).mockReturnValue({ children: [], loading: false });

    const { getByText } = render(<ParentDashboardPage />);

    expect(getByText('No students linked')).toBeTruthy();
    expect(getByText('Add a Child')).toBeTruthy();
  });

  it('Open enters family scope and lands on the child dashboard; a quest row opens that quest with the child', async () => {
    const kids = [
      createMockChild({ id: 'kid-a', first_name: 'Romney', last_name: 'Hanna', display_name: 'Romney Hanna' }),
      createMockChild({ id: 'kid-b', first_name: 'Hope', last_name: 'Hanna', display_name: 'Hope Hanna' }),
    ];
    withChildren(kids);

    const { getByTestId, getAllByLabelText, getByLabelText } = render(<ParentDashboardPage />);
    await waitFor(() => expect(getByTestId('child-open-kid-b')).toBeTruthy());

    fireEvent.press(getByTestId('child-open-kid-b'));
    expect(useFamilyStore.getState().selectedChildId).toBe('kid-b');
    expect(router.push).toHaveBeenCalledWith('/(app)/(tabs)/dashboard');

    fireEvent.press(getAllByLabelText('Open Build a drone with Romney')[0]);
    expect(useFamilyStore.getState().selectedChildId).toBe('kid-a');
    expect(router.push).toHaveBeenCalledWith('/(app)/quests/q-1');

    // The name opens the full profile.
    fireEvent.press(getByLabelText("Open Hope Hanna's profile"));
    expect(router.push).toHaveBeenCalledWith('/parent/child/kid-b');

    // The catalog, in the child's scope.
    fireEvent.press(getByLabelText('Browse quests for Hope'));
    expect(useFamilyStore.getState().selectedChildId).toBe('kid-b');
    expect(router.push).toHaveBeenCalledWith('/(app)/(tabs)/quests');
  });

  it('keeps a child on the page when their summary has not loaded', async () => {
    (useChildDashboard as jest.Mock).mockReturnValue({ data: null, loading: true, refetch: jest.fn() });
    withChildren([createMockChild()]);

    const { getByText, getByTestId } = render(<ParentDashboardPage />);

    await waitFor(() => expect(getByText('Jane Bowman')).toBeTruthy());
    expect(getByTestId('child-open-child-1')).toBeTruthy();
  });
});
