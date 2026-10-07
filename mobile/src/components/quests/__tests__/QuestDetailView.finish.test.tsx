/**
 * Finishing, or setting aside, a quest from the mobile quest screen.
 *
 * London Grover, 2026-10-02: four quests with every task done stayed active
 * for months. The "Quest Complete!" card had no button, and the only exit,
 * "Leave Quest", deleted the enrollment and reversed the XP under a dialog
 * promising the work would be kept.
 *
 * Ticket e17134c6-4d17-432d-a075-4e6e89174282, 2026-10-07. An iCreate org
 * admin, on the web's End Quest: "that's not super clear what that means.
 * And I didn't dare select that because I was worried I might end the quest
 * on accident and I didn't know what would happen." "Leave Quest" here had
 * the same problem, so both surfaces now offer the same two actions: "Save
 * for later" (POST /archive) and "Mark done" (POST /end, only at the XP
 * finish line). The Leave Quest test below was rewritten, not deleted: what
 * it pinned -- the student's exit keeps the work and never deletes -- still
 * holds under the new label.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import { confirmAlert, chooseAlert } from '@/src/utils/alerts';
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
  chooseAlert: jest.fn(),
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

describe('QuestDetailView: Save for later and Mark done', () => {
  // The card's button was "Finish quest"; it reads "Mark done" now, to match.
  it('offers Mark done on the Quest Complete card with every task done, and ends it', async () => {
    mockQuest = activeQuest([task('a', true), task('b', true)]);
    const { getByTestId } = render(<QuestDetailView questId="quest-1" />);

    fireEvent.press(getByTestId('finish-quest-btn'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/quests/quest-1/end', {});
    });
  });

  it('does not offer the card\'s Mark done on a quest that already ended', () => {
    mockQuest = {
      ...activeQuest([task('a', true)]),
      completed_enrollment: { id: 'uq-1' },
    };
    const { queryByTestId } = render(<QuestDetailView questId="quest-1" />);
    expect(queryByTestId('finish-quest-btn')).toBeNull();
  });

  it('offers Save for later and Mark done, and no Leave Quest', () => {
    mockQuest = activeQuest([task('a', true), task('b', false)]);
    const { getByText, queryByText } = render(<QuestDetailView questId="quest-1" />);
    expect(getByText('Save for later')).toBeTruthy();
    expect(getByText('Mark done')).toBeTruthy();
    expect(queryByText('Leave Quest')).toBeNull();
    expect(queryByText('End Class')).toBeNull();
  });

  it("saves the student's quest for later and never deletes or ends it", async () => {
    mockQuest = activeQuest([task('a', true), task('b', false)]);
    (chooseAlert as jest.Mock).mockResolvedValue('later');
    const { getByTestId } = render(<QuestDetailView questId="quest-1" />);

    fireEvent.press(getByTestId('save-for-later-btn'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/quests/quest-1/archive', {});
    });
    expect(api.post).not.toHaveBeenCalledWith('/api/quests/quest-1/end', expect.anything());
    expect(api.delete).not.toHaveBeenCalled();
  });

  // Ticket e17134c6, owner follow-up 2026-10-07: Save for later asks one
  // question with two answers. "I'm done with it" is the same POST with
  // reason 'lost_interest', which hides the quest everywhere.
  it("\"I'm done with it\" archives with reason lost_interest, and never deletes or ends", async () => {
    mockQuest = activeQuest([task('a', true), task('b', false)]);
    (chooseAlert as jest.Mock).mockResolvedValue('done');
    const { getByTestId } = render(<QuestDetailView questId="quest-1" />);

    fireEvent.press(getByTestId('save-for-later-btn'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/quests/quest-1/archive', { reason: 'lost_interest' });
    });
    expect(api.post).not.toHaveBeenCalledWith('/api/quests/quest-1/end', expect.anything());
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('Save for later does nothing when the question is cancelled', async () => {
    mockQuest = activeQuest([task('a', true), task('b', false)]);
    (chooseAlert as jest.Mock).mockResolvedValue(null);
    const { getByTestId } = render(<QuestDetailView questId="quest-1" />);

    fireEvent.press(getByTestId('save-for-later-btn'));

    await waitFor(() => expect(chooseAlert).toHaveBeenCalled());
    expect(api.post).not.toHaveBeenCalled();
  });

  // The question's copy is the promise the reporter reads before she dares
  // to press: what happens to the work and XP, where the quest goes, how to
  // come back. Until Home had a Saved for Later list it said "open it again
  // here to pick it back up". Assert the words.
  it('Save for later says the work and XP are kept either way, and names the Saved for Later list', async () => {
    mockQuest = activeQuest([task('a', true), task('b', false)]);
    (chooseAlert as jest.Mock).mockResolvedValue(null);
    const { getByTestId } = render(<QuestDetailView questId="quest-1" />);

    fireEvent.press(getByTestId('save-for-later-btn'));

    await waitFor(() => expect(chooseAlert).toHaveBeenCalled());
    const asked = (chooseAlert as jest.Mock).mock.calls[0][0];
    expect(asked.title).toBe('Save this quest for later?');
    expect(asked.message).toBe(
      'All work and XP are kept either way. "I\'ll come back to it" moves the quest to Saved for Later on Home, '
      + 'and Resume there brings it back. "I\'m done with it" takes the quest off every list, and the work and XP '
      + 'stay in the portfolio.'
    );
    expect(asked.choices.map((c: any) => c.text)).toEqual(["I'll come back to it", "I'm done with it"]);
    expect(confirmAlert).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('Mark done says the work and XP are kept, where the quest goes, and names the unfinished tasks', async () => {
    mockQuest = activeQuest([task('a', true), task('b', false)]);
    (confirmAlert as jest.Mock).mockResolvedValue(true);
    const { getByTestId } = render(<QuestDetailView questId="quest-1" />);

    fireEvent.press(getByTestId('mark-done-btn'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/quests/quest-1/end', {});
    });
    const asked = (confirmAlert as jest.Mock).mock.calls[0][0];
    expect(asked.title).toBe('Mark this quest done?');
    expect(asked.message).toBe(
      'All work and XP are kept, and the quest moves to Completed. You can reopen it later. 1 unfinished task will leave the dashboard.'
    );
    expect(api.post).not.toHaveBeenCalledWith('/api/quests/quest-1/archive', expect.anything());
  });

  // Below the school's XP finish line POST /end sets the quest aside rather
  // than finishing it, so Mark done there would be the old ambiguity again.
  it('Mark done is unavailable below the XP finish line, and says how much is left', () => {
    mockQuest = { ...activeQuest([task('a', true), task('b', false)]), xp_threshold: 300 };
    const { getByTestId, getByText } = render(<QuestDetailView questId="quest-1" />);

    const markDone = getByTestId('mark-done-btn');
    expect(markDone.props.accessibilityState?.disabled).toBe(true);
    expect(getByText('250 XP to go before you can mark this quest done.')).toBeTruthy();
    fireEvent.press(markDone);
    expect(confirmAlert).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  // Ticket e17134c6, owner follow-up: with no XP finish line the backend
  // refuses /end until a task is done, so the button waits and says why.
  it('Mark done is unavailable on a quest with no finish line and no finished task, and says why', () => {
    mockQuest = activeQuest([task('a', false), task('b', false)]);
    const { getByTestId, getByText } = render(<QuestDetailView questId="quest-1" />);

    const markDone = getByTestId('mark-done-btn');
    expect(markDone.props.accessibilityState?.disabled).toBe(true);
    expect(getByText('Finish at least one task to mark this quest done.')).toBeTruthy();
    fireEvent.press(markDone);
    expect(confirmAlert).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('Mark done is available on a quest with no finish line once one task is done', () => {
    mockQuest = activeQuest([task('a', true), task('b', false)]);
    const { getByTestId, queryByTestId } = render(<QuestDetailView questId="quest-1" />);
    expect(getByTestId('mark-done-btn').props.accessibilityState?.disabled).toBeFalsy();
    expect(queryByTestId('mark-done-hint')).toBeNull();
  });

  it('Mark done is available at the XP finish line', () => {
    mockQuest = { ...activeQuest([task('a', true), task('b', true)]), xp_threshold: 100 };
    const { getByTestId, queryByText } = render(<QuestDetailView questId="quest-1" />);
    expect(getByTestId('mark-done-btn').props.accessibilityState?.disabled).toBeFalsy();
    expect(queryByText(/XP to go/)).toBeNull();
  });

  it('the Quest Complete card offers Mark done only at the finish line', () => {
    mockQuest = { ...activeQuest([task('a', true), task('b', true)]), xp_threshold: 300 };
    const { queryByTestId } = render(<QuestDetailView questId="quest-1" />);
    expect(queryByTestId('finish-quest-btn')).toBeNull();
  });

  it('offers neither action on a quest that already ended', () => {
    mockQuest = { ...activeQuest([task('a', true)]), completed_enrollment: { id: 'uq-1' } };
    const { queryByTestId } = render(<QuestDetailView questId="quest-1" />);
    expect(queryByTestId('save-for-later-btn')).toBeNull();
    expect(queryByTestId('mark-done-btn')).toBeNull();
  });
});
