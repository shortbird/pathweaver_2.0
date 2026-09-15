/**
 * Family quests on the Family tab: who is on each with their rhythm, a
 * member's row opens their copy, End ends one member's run, Add puts a
 * child on it, New opens the family create sheet.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { FamilyQuestsSection } from '../FamilyQuestsSection';
import { useFamilyQuests } from '@/src/hooks/useFamilyQuests';
import { useFamilyStore } from '@/src/stores/familyStore';
import { confirmAlert } from '@/src/utils/alerts';
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

let hook: any;

beforeEach(() => {
  jest.clearAllMocks();
  hook = {
    quests: [quest], loading: false, refetch: jest.fn(),
    enrollChildren: jest.fn().mockResolvedValue({ enrolled: [{ child_id: 'kid-b' }], failed: [] }),
    endMemberQuest: jest.fn().mockResolvedValue(undefined),
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

  it('End asks, then ends that member at the quest', async () => {
    const { getByLabelText, queryByLabelText } = render(<FamilyQuestsSection kids={kids} />);
    // A finished member has nothing to end.
    expect(queryByLabelText("End Romney's quest")).toBeNull();

    fireEvent.press(getByLabelText('End your quest'));
    await waitFor(() => expect(hook.endMemberQuest).toHaveBeenCalledWith('q-1', null));
    expect((confirmAlert as jest.Mock).mock.calls[0][0].message).toMatch(/2 tasks are still unfinished/);
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
