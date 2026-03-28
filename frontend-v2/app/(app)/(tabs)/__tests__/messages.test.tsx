/**
 * Messages screen tests - renders conversation list, empty state, group section.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

jest.mock('@/src/hooks/useMessages', () => ({
  useConversations: jest.fn(),
  useContacts: jest.fn(),
  useGroups: jest.fn(),
  useConversationMessages: jest.fn(),
  useGroupMessages: jest.fn(),
  useGroupDetail: jest.fn(),
  sendDirectMessage: jest.fn(),
  markMessageRead: jest.fn(),
  sendGroupMessage: jest.fn(),
  createGroup: jest.fn(),
  markGroupRead: jest.fn(),
}));

jest.mock('@/src/components/communication/ConversationList', () => ({
  ConversationList: ({ contacts, groups, selected, onSelect, loading }: any) => {
    const { View, Text, Pressable } = require('react-native');
    if (loading) return <Text>Loading conversations...</Text>;
    return (
      <View>
        <Text>Messages</Text>
        {contacts.map((c: any) => (
          <Pressable key={c.id} onPress={() => onSelect({ id: c.id, type: 'dm', contact: c })}>
            <Text>{`${c.first_name} ${c.last_name}`}</Text>
          </Pressable>
        ))}
        {groups.map((g: any) => (
          <Pressable key={g.id} onPress={() => onSelect({ id: g.id, type: 'group', group: g })}>
            <Text>{g.name}</Text>
          </Pressable>
        ))}
        {contacts.length === 0 && groups.length === 0 && <Text>No contacts available</Text>}
      </View>
    );
  },
}));

jest.mock('@/src/components/communication/ChatWindow', () => ({
  ChatWindow: ({ contact }: any) => {
    const { Text } = require('react-native');
    return <Text>{`Chat with ${contact.first_name} ${contact.last_name}`}</Text>;
  },
}));

jest.mock('@/src/components/communication/GroupChatWindow', () => ({
  GroupChatWindow: ({ group }: any) => {
    const { Text } = require('react-native');
    return <Text>{`Group: ${group.name}`}</Text>;
  },
}));

jest.mock('@/src/components/communication/CreateGroupModal', () => ({
  CreateGroupModal: () => null,
}));

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MessagesScreen from '../messages';
import { useConversations, useContacts, useGroups } from '@/src/hooks/useMessages';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import {
  createMockContact,
  createMockConversation,
  createMockGroup,
} from '@/src/__tests__/utils/mockFactories';

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
  (useConversations as jest.Mock).mockReturnValue({ conversations: [], loading: false, refetch: jest.fn() });
  (useContacts as jest.Mock).mockReturnValue({ contacts: [], loading: false, refetch: jest.fn() });
  (useGroups as jest.Mock).mockReturnValue({ groups: [], loading: false, refetch: jest.fn() });
});

afterEach(() => {
  clearAuthState();
});

describe('MessagesScreen', () => {
  it('renders conversation list with contacts and empty chat placeholder', () => {
    const contacts = [
      createMockContact(),
      createMockContact({ id: 'student-2', first_name: 'Bob', last_name: 'Jones', relationship: 'student' }),
    ];
    (useContacts as jest.Mock).mockReturnValue({ contacts, loading: false, refetch: jest.fn() });

    const { getByText } = render(<MessagesScreen />);

    expect(getByText('Messages')).toBeTruthy();
    expect(getByText('Jane Smith')).toBeTruthy();
    expect(getByText('Bob Jones')).toBeTruthy();
    expect(getByText('Select a conversation')).toBeTruthy();
  });

  it('shows empty state when no contacts or groups', () => {
    const { getByText } = render(<MessagesScreen />);

    expect(getByText('No contacts available')).toBeTruthy();
    expect(getByText('Select a conversation')).toBeTruthy();
  });

  it('opens DM chat when selecting a contact', () => {
    const contacts = [createMockContact()];
    (useContacts as jest.Mock).mockReturnValue({ contacts, loading: false, refetch: jest.fn() });

    const { getByText } = render(<MessagesScreen />);

    fireEvent.press(getByText('Jane Smith'));

    expect(getByText('Chat with Jane Smith')).toBeTruthy();
  });

  it('opens group chat when selecting a group', () => {
    const groups = [createMockGroup()];
    (useGroups as jest.Mock).mockReturnValue({ groups, loading: false, refetch: jest.fn() });

    const { getByText } = render(<MessagesScreen />);

    fireEvent.press(getByText('Science Study Group'));

    expect(getByText('Group: Science Study Group')).toBeTruthy();
  });

  it('shows loading state while data is fetching', () => {
    (useContacts as jest.Mock).mockReturnValue({ contacts: [], loading: true, refetch: jest.fn() });
    (useConversations as jest.Mock).mockReturnValue({ conversations: [], loading: true, refetch: jest.fn() });

    const { getByText } = render(<MessagesScreen />);

    expect(getByText('Loading conversations...')).toBeTruthy();
  });
});
