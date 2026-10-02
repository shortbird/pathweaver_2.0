/**
 * Finishing a quest from the mobile quest screen.
 *
 * London Grover, 2026-10-02: four quests with every task done stayed active
 * for months. The "Quest Complete!" card had no button, and the only exit,
 * "Leave Quest", deleted the enrollment and reversed the XP under a dialog
 * promising the work would be kept. Both exits now end the quest.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import { confirmAlert } from '@/src/utils/alerts';
import { QuestDetailView } from '../QuestDetailView';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

let mockQuest: any = null;
jest.mock('@/src/hooks/useQuestDetail', () => ({
  ...jest.requireActual('@/src/hooks/useQuestDetail'),
  useQuestDetail: () => ({
    quest: mockQuest, loading: false, error: null,
    refetch: jest.fn(), enroll: jest.fn(), completeTask: jest.fn(),
    generateTasks: jest.fn(), acceptTask: jest.fn(), adjustTask: jest.fn(),
    deleteTask: jest.fn(), addManualTask: jest.fn(), analyzeManualTask: jest.fn(),
  }),
}));

jest.mock('@/src/hooks/useDashboard', () => ({
  useQuestEngagement: () => ({ data: null }),
}));

jest.mock('@/src/utils/alerts', () => ({
  showAlert: jest.fn(),
  confirmAlert: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useFocusEffect: jest.fn(),
}));

jest.mock('@/src/components/tasks/TaskCreationWizard', () => ({ TaskCreationWizard: () => null }));
jest.mock('@/src/components/engagement/QuestEngagement', () => ({ QuestEngagement: () => null }));
jest.mock('@/src/components/friends/QuestFriendsLine', () => ({ QuestFriendsLine: () => null }));

const task = (id: string, is_completed: boolean) => ({
  id, title: `Task ${id}`, description: '', pillar: 'art', xp_value: 50,
  is_completed, approval_status: 'approved', order_index: 0,
});

const activeQuest = (tasks: any[]) => ({
  id: 'quest-1', title: 'Experience France', quest_type: 'optio',
  user_enrollment: { id: 'uq-1', is_active: true },
  completed_enrollment: null,
  quest_tasks: tasks,
});

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: {} });
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true } });
});

describe('QuestDetailView finishing a quest', () => {
  it('offers Finish quest on a quest with every task done, and ends it', async () => {
    mockQuest = activeQuest([task('a', true), task('b', true)]);
    const { getByTestId } = render(<QuestDetailView questId="quest-1" />);

    fireEvent.press(getByTestId('finish-quest-btn'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/quests/quest-1/end', {});
    });
  });

  it('does not offer Finish quest on a quest that already ended', () => {
    mockQuest = {
      ...activeQuest([task('a', true)]),
      completed_enrollment: { id: 'uq-1' },
    };
    const { queryByTestId } = render(<QuestDetailView questId="quest-1" />);
    expect(queryByTestId('finish-quest-btn')).toBeNull();
  });

  it("ends the student's quest on Leave Quest and never deletes it", async () => {
    mockQuest = activeQuest([task('a', true), task('b', false)]);
    (confirmAlert as jest.Mock).mockResolvedValue(true);
    const { getByText } = render(<QuestDetailView questId="quest-1" />);

    fireEvent.press(getByText('Leave Quest'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/quests/quest-1/end', {});
    });
    expect(api.delete).not.toHaveBeenCalled();
    expect((confirmAlert as jest.Mock).mock.calls[0][0].message).toMatch(/XP are kept/);
  });
});
