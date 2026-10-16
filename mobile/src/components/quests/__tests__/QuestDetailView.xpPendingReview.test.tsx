/**
 * Ticket 536a3018, Jackie Hill (Arete Academy): "have the xp not be awarded
 * until it's approved". At a school that holds XP for a teacher's accept, the
 * quest detail marks a finished task xp_pending_review. The quest screen does
 * not count its XP as earned, and says the XP comes when the teacher accepts.
 * Without the flag the screen is what it always was.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import api from '@/src/services/api';
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
jest.mock('@/src/hooks/useDashboard', () => ({ useQuestEngagement: () => ({ data: null }) }));
jest.mock('@/src/utils/alerts', () => ({ showAlert: jest.fn(), confirmAlert: jest.fn(), chooseAlert: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('@/src/components/tasks/TaskCreationWizard', () => ({ TaskCreationWizard: () => null }));
jest.mock('@/src/components/engagement/QuestEngagement', () => ({ QuestEngagement: () => null }));
jest.mock('@/src/components/friends/QuestFriendsLine', () => ({ QuestFriendsLine: () => null }));

const PENDING = 'Sent to your teacher. You get the XP when they accept it.';

const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `Task ${id}`, description: '', pillar: 'art', xp_value: 50,
  is_completed: true, approval_status: 'approved', order_index: 0, ...extra,
});

const quest = (tasks: any[]) => ({
  id: 'quest-1', title: 'Bridges', quest_type: 'optio',
  user_enrollment: { id: 'uq-1', is_active: true },
  completed_enrollment: null,
  quest_tasks: tasks,
});

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: {} });
});

describe('QuestDetailView: XP that waits for a teacher', () => {
  it('leaves held XP out of what the student earned and says why', () => {
    mockQuest = quest([task('a'), task('b', { xp_pending_review: true })]);
    const { getByText } = render(<QuestDetailView questId="quest-1" />);
    expect(getByText('You earned 50 XP across 2 tasks. Great work!')).toBeTruthy();
    // The line sits in the task's open card.
    fireEvent.press(getByText('Task b'));
    expect(getByText(PENDING)).toBeTruthy();
  });

  it('without a hold counts every finished task, as before', () => {
    mockQuest = quest([task('a'), task('b')]);
    const { getByText, queryByText } = render(<QuestDetailView questId="quest-1" />);
    expect(getByText('You earned 100 XP across 2 tasks. Great work!')).toBeTruthy();
    fireEvent.press(getByText('Task b'));
    expect(queryByText(PENDING)).toBeNull();
  });
});
