/**
 * "Delete quest" on a quest the family made and never worked on.
 *
 * Ticket bd1be541, Karen Boyd (parent, Optio Academy): "I created a couple of
 * quests that I ended up not wanting to use... I can't see how to delete old
 * quests." The server decides who may (GET /api/quests/<id>/own-quest) and
 * checks again on DELETE; the screen offers the button only when it says yes.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import { confirmAlert, showAlert } from '@/src/utils/alerts';
import { router } from 'expo-router';
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
jest.mock('@/src/utils/alerts', () => ({
  showAlert: jest.fn(), confirmAlert: jest.fn(), chooseAlert: jest.fn(),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('@/src/components/tasks/TaskCreationWizard', () => ({ TaskCreationWizard: () => null }));
jest.mock('@/src/components/engagement/QuestEngagement', () => ({ QuestEngagement: () => null }));
jest.mock('@/src/components/friends/QuestFriendsLine', () => ({ QuestFriendsLine: () => null }));

const quest = () => ({
  id: 'quest-1', title: 'Volcano model', quest_type: 'optio',
  user_enrollment: { id: 'uq-1', is_active: true },
  completed_enrollment: null,
  quest_tasks: [{ id: 't-1', title: 'Sketch it', description: '', pillar: 'stem', xp_value: 50,
    is_completed: false, approval_status: 'approved', order_index: 0 }],
});

const deletable = (canDelete: boolean) => (api.get as jest.Mock).mockImplementation((url: string) =>
  Promise.resolve(url.endsWith('/own-quest')
    ? { data: { success: true, can_delete: canDelete } }
    : { data: {} }));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuest = quest();
});

describe('QuestDetailView: Delete quest', () => {
  it('is offered when the server says yes, and asks before deleting', async () => {
    deletable(true);
    (confirmAlert as jest.Mock).mockResolvedValue(true);
    (api.delete as jest.Mock).mockResolvedValue({ data: { success: true } });
    const { findByTestId } = render(<QuestDetailView questId="quest-1" />);

    fireEvent.press(await findByTestId('delete-own-quest-btn'));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/quests/quest-1/own-quest', { params: {} }));
    expect(confirmAlert).toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
  });

  it('names the child in parent mode', async () => {
    deletable(true);
    (confirmAlert as jest.Mock).mockResolvedValue(true);
    (api.delete as jest.Mock).mockResolvedValue({ data: { success: true } });
    const { findByTestId } = render(<QuestDetailView questId="quest-1" studentId="kid-1" />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/quests/quest-1/own-quest', { params: { student_id: 'kid-1' } }));
    fireEvent.press(await findByTestId('delete-own-quest-btn'));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/quests/quest-1/own-quest', { params: { student_id: 'kid-1' } }));
  });

  it('is not offered when the server says no', async () => {
    deletable(false);
    const { queryByTestId, getByText } = render(<QuestDetailView questId="quest-1" />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/quests/quest-1/own-quest', { params: {} }));
    expect(queryByTestId('delete-own-quest-btn')).toBeNull();
    expect(getByText('Save for later')).toBeTruthy();
  });

  it('does nothing when the question is cancelled', async () => {
    deletable(true);
    (confirmAlert as jest.Mock).mockResolvedValue(false);
    const { findByTestId } = render(<QuestDetailView questId="quest-1" />);
    fireEvent.press(await findByTestId('delete-own-quest-btn'));
    await waitFor(() => expect(confirmAlert).toHaveBeenCalled());
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("shows the server's refusal", async () => {
    deletable(true);
    (confirmAlert as jest.Mock).mockResolvedValue(true);
    (api.delete as jest.Mock).mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { error: 'This quest has finished tasks or evidence.' } } });
    const { findByTestId } = render(<QuestDetailView questId="quest-1" />);
    fireEvent.press(await findByTestId('delete-own-quest-btn'));
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('Could not delete', 'This quest has finished tasks or evidence.'));
    expect(router.back).not.toHaveBeenCalled();
  });

  // Coordinator decision on ticket bd1be541: one delete button for a parent.
  // An eligible quest has no work, so "Remove quest" (which reverses XP) adds
  // nothing beside "Delete quest".
  it('hides the parent\'s Remove quest when Delete quest is offered', async () => {
    deletable(true);
    const { findByTestId, queryByText } = render(<QuestDetailView questId="quest-1" studentId="kid-1" />);
    await findByTestId('delete-own-quest-btn');
    expect(queryByText('Remove quest')).toBeNull();
  });

  it('keeps the parent\'s Remove quest when Delete quest is not offered', async () => {
    deletable(false);
    const { getByText, queryByTestId } = render(<QuestDetailView questId="quest-1" studentId="kid-1" />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      '/api/quests/quest-1/own-quest', { params: { student_id: 'kid-1' } }));
    expect(queryByTestId('delete-own-quest-btn')).toBeNull();
    expect(getByText('Remove quest')).toBeTruthy();
  });
});
