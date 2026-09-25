/**
 * CreateQuestSheet for a student in a school class: they can say which class
 * the quest is for (Gryffin, 2026-09-25). "Just for me" sends exactly what the
 * sheet always sent, so a personal quest stays personal.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import { CreateQuestSheet } from '../CreateQuestSheet';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/utils/alerts', () => ({ showAlert: jest.fn(), confirmAlert: jest.fn() }));

const mockedApi = api as jest.Mocked<typeof api>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.get.mockResolvedValue({ data: { classes: [{ id: 'c1', name: 'Earth Science' }] } });
  mockedApi.post.mockResolvedValue({ data: { quest_id: 'q-new', class_attached: true } });
});

describe('CreateQuestSheet (class)', () => {
  it('sends the class the student picked', async () => {
    const { findByLabelText, getByText, getByPlaceholderText } = render(
      <CreateQuestSheet visible onClose={jest.fn()} />,
    );
    fireEvent.press(await findByLabelText('Earth Science'));
    fireEvent.changeText(getByPlaceholderText('e.g. Build my first drone'), 'Minerals in Rocks');
    fireEvent.press(getByText('Create Quest'));
    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith(
      '/api/quests/create', { title: 'Minerals in Rocks', class_id: 'c1' }));
  });

  it('starts on "Just for me" and sends no class', async () => {
    const { findByLabelText, getByText, getByPlaceholderText } = render(
      <CreateQuestSheet visible onClose={jest.fn()} />,
    );
    expect((await findByLabelText('Just for me')).props.accessibilityState.checked).toBe(true);
    fireEvent.changeText(getByPlaceholderText('e.g. Build my first drone'), 'Garden');
    fireEvent.press(getByText('Create Quest'));
    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/api/quests/create', { title: 'Garden' }));
  });

  it('asks for no classes when a parent creates for a child', () => {
    render(<CreateQuestSheet visible onClose={jest.fn()} forChild={{ id: 'kid-a', name: 'Romney' }} />);
    expect(mockedApi.get).not.toHaveBeenCalled();
  });
});
