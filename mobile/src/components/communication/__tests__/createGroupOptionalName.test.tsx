/**
 * A group chat without a name.
 *
 * Ticket 9c774b30, a coordinator: "is there a way we can have a group chat
 * without making a whole GROUP thread? I would like to just send a message to
 * two other people." The name is optional now; left blank, the server names
 * the group from its members' first names (backend/routes/group_messages.py).
 * The form needs a name OR at least one member, never neither.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CreateGroupModal } from '../CreateGroupModal';
import { createGroup } from '@/src/hooks/useMessages';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

jest.mock('@/src/hooks/useMessages', () => ({
  useContacts: () => ({
    contacts: [
      { id: 'u-ann', first_name: 'Ann', last_name: 'Lee' },
      { id: 'u-bo', first_name: 'Bo', last_name: 'Park' },
    ],
    loading: false,
  }),
  createGroup: jest.fn(() => Promise.resolve({ group: { id: 'g-1' } })),
}));

function renderModal() {
  const onCreated = jest.fn();
  const onClose = jest.fn();
  const utils = render(<CreateGroupModal visible onClose={onClose} onCreated={onCreated} />);
  return { ...utils, onCreated, onClose };
}

const createButton = (utils: ReturnType<typeof render>) =>
  utils.getByText('Create Group');

beforeEach(() => jest.clearAllMocks());

describe('CreateGroupModal: optional name (ticket 9c774b30)', () => {
  it('creates a nameless group with members and sends an empty name for the server to fill', async () => {
    const utils = renderModal();
    fireEvent.press(utils.getByText('Ann Lee'));
    fireEvent.press(utils.getByText('Bo Park'));
    fireEvent.press(createButton(utils));

    await waitFor(() => expect(createGroup).toHaveBeenCalledTimes(1));
    expect(createGroup).toHaveBeenCalledWith('', undefined, ['u-ann', 'u-bo']);
    await waitFor(() => expect(utils.onCreated).toHaveBeenCalledWith({ id: 'g-1' }));
  });

  it('keeps Create disabled with neither a name nor members', async () => {
    const utils = renderModal();
    fireEvent.press(createButton(utils));
    // A whitespace-only name is no name.
    fireEvent.changeText(utils.getByPlaceholderText('Leave blank to use their first names'), '   ');
    fireEvent.press(createButton(utils));
    await new Promise((r) => setTimeout(r, 0));
    expect(createGroup).not.toHaveBeenCalled();
  });

  it('sends the name when one is given', async () => {
    const utils = renderModal();
    fireEvent.changeText(utils.getByPlaceholderText('Leave blank to use their first names'), '  Field trip  ');
    fireEvent.press(utils.getByText('Ann Lee'));
    fireEvent.press(createButton(utils));

    await waitFor(() => expect(createGroup).toHaveBeenCalledWith('Field trip', undefined, ['u-ann']));
  });
});
