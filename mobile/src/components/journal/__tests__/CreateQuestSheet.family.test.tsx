/**
 * CreateQuestSheet in family mode: a picker of the children, all ticked to
 * start, and the quest created on the parent's account with the ticked
 * children enrolled. The sheet stays put afterwards.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { CreateQuestSheet } from '../CreateQuestSheet';
import { createFamilyQuest } from '@/src/hooks/useFamilyQuests';
import { createMockChild } from '@/src/__tests__/utils/mockFactories';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/hooks/useFamilyQuests', () => ({
  createFamilyQuest: jest.fn().mockResolvedValue({ questId: 'q-new', failed: [] }),
}));
jest.mock('@/src/utils/alerts', () => ({ showAlert: jest.fn(), confirmAlert: jest.fn() }));

const kids = [
  createMockChild({ id: 'kid-a', first_name: 'Romney', last_name: 'Hanna', display_name: 'Romney Hanna' }),
  createMockChild({ id: 'kid-b', first_name: 'Hope', last_name: 'Hanna', display_name: 'Hope Hanna' }),
];

beforeEach(() => jest.clearAllMocks());

describe('CreateQuestSheet (family)', () => {
  it('ticks every child to start and creates the quest for the ones left ticked', async () => {
    const onCreated = jest.fn();
    const onClose = jest.fn();
    const { getByText, getByLabelText, getByPlaceholderText } = render(
      <CreateQuestSheet visible onClose={onClose} onCreated={onCreated} familyChildren={kids} />,
    );
    expect(getByText('New family quest')).toBeTruthy();
    expect(getByLabelText('Romney').props.accessibilityState.checked).toBe(true);
    expect(getByLabelText('Hope').props.accessibilityState.checked).toBe(true);

    fireEvent.press(getByLabelText('Hope'));
    fireEvent.changeText(getByPlaceholderText('e.g. Build my first drone'), 'Garden');
    fireEvent.press(getByText('Create family quest'));

    await waitFor(() => expect(createFamilyQuest).toHaveBeenCalledWith({ title: 'Garden' }, ['kid-a']));
    expect(onCreated).toHaveBeenCalledWith('q-new');
    expect(onClose).toHaveBeenCalled();
    // No one child's copy to land on: the parent stays on the Family tab.
    expect(router.push).not.toHaveBeenCalled();
  });

  it('will not create a family quest for nobody', () => {
    const { getByText, getByLabelText, getByPlaceholderText } = render(
      <CreateQuestSheet visible onClose={jest.fn()} familyChildren={kids} />,
    );
    fireEvent.changeText(getByPlaceholderText('e.g. Build my first drone'), 'Garden');
    fireEvent.press(getByLabelText('Romney'));
    fireEvent.press(getByLabelText('Hope'));
    fireEvent.press(getByText('Create family quest'));
    expect(createFamilyQuest).not.toHaveBeenCalled();
  });

  it('single-child mode still lands on that child\'s new quest', async () => {
    const { getByText, getByPlaceholderText } = render(
      <CreateQuestSheet visible onClose={jest.fn()} forChild={{ id: 'kid-a', name: 'Romney' }} />,
    );
    fireEvent.changeText(getByPlaceholderText('e.g. Build my first drone'), 'Garden');
    fireEvent.press(getByText('Create Quest'));
    await waitFor(() => expect(createFamilyQuest).toHaveBeenCalledWith({ title: 'Garden' }, ['kid-a']));
    expect(router.push).toHaveBeenCalledWith('/parent/quest/kid-a/q-new?new=1');
  });
});
