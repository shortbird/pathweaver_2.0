/**
 * Family quests on the Family tab: who is on each with their rhythm, a
 * member's row opens their copy, Save for later and Mark done act on one
 * member's run, Add puts a child on it, New opens the family create sheet.
 *
 * Ticket e17134c6 (2026-10-07): the card's "End" became the quest screen's
 * two actions. An iCreate admin "didn't dare select [End Quest] because I was
 * worried I might end the quest on accident". Save for later asks one
 * question with two answers ("I'll come back to it" archives; "I'm done with
 * it" archives with reason lost_interest); Mark done (POST /end) waits for a
 * finished task on a quest with no XP finish line, and says why.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { FamilyQuestsSection } from '../FamilyQuestsSection';
import { useFamilyQuests } from '@/src/hooks/useFamilyQuests';
import { useFamilyStore } from '@/src/stores/familyStore';
import { confirmAlert, chooseAlert } from '@/src/utils/alerts';
import { createMockChild } from '@/src/__tests__/utils/mockFactories';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/hooks/useFamilyQuests', () => ({
  useFamilyQuests: jest.fn(),
  createFamilyQuest: jest.fn(),
}));
jest.mock('@/src/utils/alerts', () => ({
  showAlert: jest.fn(),
  confirmAlert: jest.fn().mockResolvedValue(true),
  chooseAlert: jest.fn().mockResolvedValue('later'),
}));
jest.mock('@/src/components/journal/CreateQuestSheet', () => ({
  CreateQuestSheet: ({ visible, familyChildren }: any) =>
    visible ? require('react').createElement(require('react-native').Text, { testID: 'create-sheet' }, `create for ${familyChildren.length}`) : null,
}));

const kids = [
  createMockChild({ id: 'kid-a', first_name: 'Romney', last_name: 'Hanna', display_name: 'Romney Hanna' }),
  createMockChild({ id: 'kid-b', first_name: 'Hope', last_name: 'Hanna', display_name: 'Hope Hanna' }),
];

const rhythm = { state: 'in_flow', state_display: 'In Flow', message: '', pattern_description: '', last_7_days: [] };

const quest = {
  id: 'q-1',
  title: 'New Zealand 101',
  description: 'A country study',
  image_url: null,
  members: [
    { user_id: 'parent-1', first_name: 'Paige', avatar_url: null, is_self: true, completed_at: null, progress: { completed_tasks: 1, total_tasks: 3 }, rhythm },
    { user_id: 'kid-a', first_name: 'Romney', avatar_url: null, is_self: false, completed_at: '2026-09-01T00:00:00Z', progress: { completed_tasks: 3, total_tasks: 3 }, rhythm },
  ],
};

// A quest both children are partway through: Romney has a task done, Hope
// has none.
const shared = {
  id: 'q-2',
  title: 'Bird Count',
  description: null,
  image_url: null,
  members: [
    { user_id: 'kid-a', first_name: 'Romney', avatar_url: null, is_self: false, completed_at: null, progress: { completed_tasks: 1, total_tasks: 3 }, rhythm },
    { user_id: 'kid-b', first_name: 'Hope', avatar_url: null, is_self: false, completed_at: null, progress: { completed_tasks: 0, total_tasks: 2 }, rhythm },
  ],
};

let hook: any;

beforeEach(() => {
  jest.clearAllMocks();
  hook = {
    quests: [quest], loading: false, refetch: jest.fn(),
    enrollChildren: jest.fn().mockResolvedValue({ enrolled: [{ child_id: 'kid-b' }], failed: [] }),
    endMemberQuest: jest.fn().mockResolvedValue(undefined),
    archiveMemberQuest: jest.fn().mockResolvedValue(undefined),
  };
  (useFamilyQuests as jest.Mock).mockReturnValue(hook);
  useFamilyStore.setState({ parentId: 'parent-1', children: kids, selectedChildId: 'kid-a' });
});

describe('FamilyQuestsSection', () => {
  it('names who is on each quest -- the parent as You, a finished child as Completed, the rest by rhythm', () => {
    const { getByText, getByLabelText, queryByText } = render(<FamilyQuestsSection kids={kids} />);
    expect(getByText('New Zealand 101')).toBeTruthy();
    expect(getByText('You')).toBeTruthy();
    expect(getByText('Romney')).toBeTruthy();
    expect(getByText('Completed')).toBeTruthy();
    // The parent's own row shows the rhythm as icon and boxes, no text.
    expect(getByLabelText('Active')).toBeTruthy();
    expect(queryByText('Active')).toBeNull();
  });

  it("a child's row opens their copy in family scope; the parent's own opens the learner screen", () => {
    const { getByLabelText } = render(<FamilyQuestsSection kids={kids} />);
    fireEvent.press(getByLabelText("Open Romney's copy"));
    expect(useFamilyStore.getState().selectedChildId).toBe('kid-a');
    expect(router.push).toHaveBeenCalledWith('/(app)/quests/q-1');

    fireEvent.press(getByLabelText('Open your copy'));
    expect(router.push).toHaveBeenCalledWith('/(app)/quests/q-1');
  });

  // Was "End asks, then ends that member at the quest". The card says "End"
  // no more (ticket e17134c6); Mark done is the /end half of it.
  it('Mark done asks, names the unfinished tasks, then ends that member at the quest', async () => {
    const { getByLabelText, queryByLabelText, queryByText } = render(<FamilyQuestsSection kids={kids} />);
    expect(queryByText('End')).toBeNull();
    // A finished member has nothing to mark done or save.
    expect(queryByLabelText("Mark Romney's quest done")).toBeNull();
    expect(queryByLabelText("Save Romney's quest for later")).toBeNull();

    fireEvent.press(getByLabelText('Mark your quest done'));
    await waitFor(() => expect(hook.endMemberQuest).toHaveBeenCalledWith('q-1', null));
    const asked = (confirmAlert as jest.Mock).mock.calls[0][0];
    expect(asked.title).toBe('Mark your "New Zealand 101" done?');
    expect(asked.message).toBe(
      'All work and XP are kept, and the quest moves to Completed. It can be reopened later. 2 unfinished tasks will leave the dashboard.'
    );
  });

  it("Mark done passes the child's student_id", async () => {
    hook.quests = [shared];
    const { getByLabelText } = render(<FamilyQuestsSection kids={kids} />);
    fireEvent.press(getByLabelText("Mark Romney's quest done"));
    await waitFor(() => expect(hook.endMemberQuest).toHaveBeenCalledWith('q-2', 'kid-a'));
  });

  it('Mark done is unavailable for a member with no finished task on a quest with no finish line, and says why', () => {
    hook.quests = [shared];
    const { getByLabelText, getByText } = render(<FamilyQuestsSection kids={kids} />);
    const markDone = getByLabelText("Mark Hope's quest done");
    expect(markDone.props.accessibilityState?.disabled).toBe(true);
    expect(getByText('Finish at least one task to mark this quest done.')).toBeTruthy();
    fireEvent.press(markDone);
    expect(confirmAlert).not.toHaveBeenCalled();
    expect(hook.endMemberQuest).not.toHaveBeenCalled();
  });

  it("Save for later: \"I'll come back to it\" archives the child's run, naming the child", async () => {
    hook.quests = [shared];
    (chooseAlert as jest.Mock).mockResolvedValueOnce('later');
    const { getByLabelText } = render(<FamilyQuestsSection kids={kids} />);
    fireEvent.press(getByLabelText("Save Hope's quest for later"));
    await waitFor(() => expect(hook.archiveMemberQuest).toHaveBeenCalledWith('q-2', 'kid-b', 'later'));
    const asked = (chooseAlert as jest.Mock).mock.calls[0][0];
    expect(asked.title).toBe('Save this quest for later?');
    expect(asked.message).toBe(
      'All work and XP are kept either way. "I\'ll come back to it" moves the quest to Saved for Later on Home, '
      + 'and Resume there brings it back. "I\'m done with it" takes the quest off every list, and the work and XP '
      + 'stay in the portfolio.'
    );
    expect(hook.endMemberQuest).not.toHaveBeenCalled();
  });

  it("Save for later: \"I'm done with it\" passes that answer, and Cancel does nothing", async () => {
    hook.quests = [shared];
    (chooseAlert as jest.Mock).mockResolvedValueOnce('done').mockResolvedValueOnce(null);
    const { getByLabelText } = render(<FamilyQuestsSection kids={kids} />);
    fireEvent.press(getByLabelText("Save Romney's quest for later"));
    await waitFor(() => expect(hook.archiveMemberQuest).toHaveBeenCalledWith('q-2', 'kid-a', 'done'));

    fireEvent.press(getByLabelText("Save Hope's quest for later"));
    await waitFor(() => expect(chooseAlert).toHaveBeenCalledTimes(2));
    expect(hook.archiveMemberQuest).toHaveBeenCalledTimes(1);
  });

  it("the parent's own quest has no Saved for Later list on mobile, and the copy says so", async () => {
    const { getByLabelText } = render(<FamilyQuestsSection kids={kids} />);
    fireEvent.press(getByLabelText('Save your quest for later'));
    await waitFor(() => expect(hook.archiveMemberQuest).toHaveBeenCalledWith('q-1', null, 'later'));
    expect((chooseAlert as jest.Mock).mock.calls[0][0].message).toMatch(/off the active list, and you can open it again here/);
  });

  it('offers to add a child who is not on it yet, and not one who is', async () => {
    const { getByLabelText, queryByLabelText } = render(<FamilyQuestsSection kids={kids} />);
    expect(queryByLabelText('Add Romney')).toBeNull();
    fireEvent.press(getByLabelText('Add Hope'));
    await waitFor(() => expect(hook.enrollChildren).toHaveBeenCalledWith('q-1', ['kid-b']));
  });

  it('New opens the create sheet with every child to pick from', () => {
    const { getByLabelText, getByTestId } = render(<FamilyQuestsSection kids={kids} />);
    fireEvent.press(getByLabelText('New family quest'));
    expect(getByTestId('create-sheet')).toHaveTextContent('create for 2');
  });

  it('with no family quests, says so and offers to make one', () => {
    hook.quests = [];
    const { getByText } = render(<FamilyQuestsSection kids={kids} />);
    expect(getByText('No family quests yet')).toBeTruthy();
    expect(getByText('New family quest')).toBeTruthy();
  });
});
