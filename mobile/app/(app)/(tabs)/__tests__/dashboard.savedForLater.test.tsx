/**
 * Home's "Saved for Later" list (ticket e17134c6).
 *
 * e17134c6 replaced the quest page's "End quest" with "Save for later"
 * (POST /api/quests/:id/archive, work and XP kept) and "Mark done". The web
 * dashboard lists saved quests under "Saved for Later" with Resume; mobile had
 * no list, so a quest saved for later on the phone could only come back by
 * finding it again and pressing Start. These pin the mobile list: it shows the
 * dashboard's `archived_quests`, is hidden when there are none, a row opens
 * the quest, and Resume posts /unarchive (naming the child in a parent's
 * family scope) and then reloads the dashboard so the quest moves back to the
 * active list. Remove (owner follow-up, same day) asks, then posts /archive
 * with reason 'lost_interest', which hides the quest everywhere with the
 * work and XP kept.
 *
 * The list is whatever the backend returns as Saved for Later (archived,
 * set down, or paused with neither); rows without archived_at must show.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import DashboardScreen from '../dashboard';
import { useDashboard, useGlobalEngagement } from '@/src/hooks/useDashboard';
import api from '@/src/services/api';
import { setAuthAsStudent, setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { useFamilyStore } from '@/src/stores/familyStore';
import { createMockChild } from '@/src/__tests__/utils/mockFactories';
import { confirmAlert } from '@/src/utils/alerts';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/utils/alerts', () => ({
  showAlert: jest.fn(),
  confirmAlert: jest.fn().mockResolvedValue(true),
  chooseAlert: jest.fn(),
}));
jest.mock('@/src/hooks/useDashboard', () => ({
  useDashboard: jest.fn(),
  useGlobalEngagement: jest.fn(),
}));
jest.mock('@/src/components/engagement/MiniHeatmap', () => ({ MiniHeatmap: () => null }));
jest.mock('@/src/components/engagement/RhythmBadge', () => ({ RhythmBadge: () => null }));
jest.mock('@/src/components/layouts/MobileHeader', () => ({ PageHeader: () => null }));

const mockRouter = require('expo-router').router;

const savedRows = [
  {
    id: 'uq-saved-1',
    quest_id: 'q-saved-1',
    archived_at: '2026-10-05T12:00:00Z',
    archive_reason: null,
    quests: { id: 'q-saved-1', title: 'Learn the Ukulele', description: null, image_url: null, header_image_url: null },
  },
  {
    id: 'uq-saved-2',
    quest_id: 'q-saved-2',
    archived_at: '2026-10-06T12:00:00Z',
    archive_reason: null,
    quests: { id: 'q-saved-2', title: 'Bird Count', description: null, image_url: null, header_image_url: null },
  },
];

const baseData = {
  active_quests: [
    { id: 'uq-1', quests: { id: 'q-1', title: 'Build a Robot', description: null, header_image_url: null } },
  ],
  enrolled_courses: [],
  recent_completed_quests: [],
  stats: { total_xp: 100, completed_quests_count: 0, completed_tasks_count: 0, level: null },
};

let refetch: jest.Mock;

function mockDashboard(data: any) {
  (useDashboard as jest.Mock).mockReturnValue({
    data, loading: false, error: null, unsupported: false, refetch,
  });
}

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
  refetch = jest.fn().mockResolvedValue(undefined);
  mockDashboard({ ...baseData, archived_quests: savedRows });
  (useGlobalEngagement as jest.Mock).mockReturnValue({ data: null, loading: false });
  (api.get as jest.Mock).mockResolvedValue({ data: { claims: [], agenda: [], quest: { quest_tasks: [] } } });
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, restored: 1 } });
});

afterEach(() => {
  clearAuthState();
});

describe('Home: Saved for Later (ticket e17134c6)', () => {
  it('lists the quests saved for later', () => {
    const r = render(<DashboardScreen />);
    expect(r.getByTestId('saved-for-later-section')).toBeTruthy();
    expect(r.getByText('Saved for Later')).toBeTruthy();
    expect(r.getByText('Learn the Ukulele')).toBeTruthy();
    expect(r.getByText('Bird Count')).toBeTruthy();
    expect(r.getByTestId('saved-quest-resume-q-saved-1')).toBeTruthy();
  });

  it('shows a paused quest with no archived_at (a set-down one), unfiltered', () => {
    mockDashboard({ ...baseData, archived_quests: [
      { id: 'uq-set-down', quest_id: 'q-set-down', archived_at: null, quests: { id: 'q-set-down', title: 'Old Garden' } },
    ] });
    const r = render(<DashboardScreen />);
    expect(r.getByText('Old Garden')).toBeTruthy();
    expect(r.getByTestId('saved-quest-resume-q-set-down')).toBeTruthy();
  });

  it('is hidden when nothing is saved for later', () => {
    mockDashboard({ ...baseData, archived_quests: [] });
    const r = render(<DashboardScreen />);
    expect(r.queryByTestId('saved-for-later-section')).toBeNull();
    expect(r.queryByText('Saved for Later')).toBeNull();
  });

  it('is hidden when the dashboard has no archived_quests field', () => {
    mockDashboard(baseData);
    const r = render(<DashboardScreen />);
    expect(r.queryByTestId('saved-for-later-section')).toBeNull();
  });

  it('opens the quest when a row is tapped', () => {
    const r = render(<DashboardScreen />);
    fireEvent.press(r.getByTestId('saved-quest-open-q-saved-2'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/quests/q-saved-2');
  });

  it('Resume posts /unarchive for the student, with no student_id, then reloads the dashboard', async () => {
    const r = render(<DashboardScreen />);
    refetch.mockClear();
    fireEvent.press(r.getByTestId('saved-quest-resume-q-saved-1'));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/quests/q-saved-1/unarchive', {});
    });
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });

  it('does not reload the dashboard when Resume fails', async () => {
    (api.post as jest.Mock).mockRejectedValueOnce(new Error('404'));
    const r = render(<DashboardScreen />);
    refetch.mockClear();
    fireEvent.press(r.getByTestId('saved-quest-resume-q-saved-1'));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(refetch).not.toHaveBeenCalled();
  });

  it('Remove asks first, says the work and XP stay, then archives with lost_interest and reloads', async () => {
    const r = render(<DashboardScreen />);
    refetch.mockClear();
    fireEvent.press(r.getByTestId('saved-quest-remove-q-saved-2'));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/quests/q-saved-2/archive', { reason: 'lost_interest' });
    });
    const asked = (confirmAlert as jest.Mock).mock.calls[0][0];
    expect(asked.title).toBe('Remove "Bird Count" from Saved for Later?');
    expect(asked.message).toBe('The quest leaves every list. All work and XP stay in the portfolio.');
    expect(asked.destructive).toBeFalsy();
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('Remove does nothing when the question is cancelled', async () => {
    (confirmAlert as jest.Mock).mockResolvedValueOnce(false);
    const r = render(<DashboardScreen />);
    fireEvent.press(r.getByTestId('saved-quest-remove-q-saved-2'));
    await waitFor(() => expect(confirmAlert).toHaveBeenCalled());
    expect(api.post).not.toHaveBeenCalled();
  });

  describe('for a parent in family scope', () => {
    const romney = createMockChild({ id: 'kid-a', first_name: 'Romney', last_name: 'Hanna', display_name: 'Romney Hanna' });

    beforeEach(() => {
      setAuthAsParent();
      useFamilyStore.setState({ parentId: 'parent-1', children: [romney], selectedChildId: 'kid-a' });
    });

    afterEach(() => useFamilyStore.getState().clear());

    it('lists the child\'s saved quests and Resume names the child', async () => {
      const r = render(<DashboardScreen />);
      expect(useDashboard).toHaveBeenCalledWith('kid-a');
      expect(r.getByText('Learn the Ukulele')).toBeTruthy();
      refetch.mockClear();
      fireEvent.press(r.getByTestId('saved-quest-resume-q-saved-1'));
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/quests/q-saved-1/unarchive', { student_id: 'kid-a' });
      });
      await waitFor(() => expect(refetch).toHaveBeenCalled());
    });

    it('Remove names the child', async () => {
      const r = render(<DashboardScreen />);
      fireEvent.press(r.getByTestId('saved-quest-remove-q-saved-1'));
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/api/quests/q-saved-1/archive', { reason: 'lost_interest', student_id: 'kid-a' },
        );
      });
    });
  });
});
