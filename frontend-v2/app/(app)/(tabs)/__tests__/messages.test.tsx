/**
 * Messages screen tests - mobile UX (list → chat → back) and desktop split-panel.
 */

import React from 'react';
import { Platform } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import MessagesScreen from '../messages';
import { useConversations, useContacts, useGroups, useChildren } from '@/src/hooks/useMessages';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import {
  createMockContact,
  createMockGroup,
} from '@/src/__tests__/utils/mockFactories';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

jest.mock('@/src/hooks/useMessages', () => ({
  useConversations: jest.fn(),
  useContacts: jest.fn(),
  useGroups: jest.fn(),
  useChildren: jest.fn(),
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
  ConversationList: ({ contacts, groups, selected, onSelect, loading, isMobile }: any) => {
    const { View, Text, Pressable } = require('react-native');
    if (loading) return <Text>Loading conversations...</Text>;
    return (
      <View>
        <Text>{isMobile ? 'Messages (mobile)' : 'Messages'}</Text>
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
  ChatWindow: ({ contact, onBack }: any) => {
    const { Text, Pressable } = require('react-native');
    return (
      <>
        <Text>{`Chat with ${contact.first_name} ${contact.last_name}`}</Text>
        {onBack && (
          <Pressable onPress={onBack} testID="back-button">
            <Text>Back</Text>
          </Pressable>
        )}
      </>
    );
  },
}));

jest.mock('@/src/components/communication/GroupChatWindow', () => ({
  GroupChatWindow: ({ group, onBack }: any) => {
    const { Text, Pressable } = require('react-native');
    return (
      <>
        <Text>{`Group: ${group.name}`}</Text>
        {onBack && (
          <Pressable onPress={onBack} testID="back-button">
            <Text>Back</Text>
          </Pressable>
        )}
      </>
    );
  },
}));

jest.mock('@/src/components/communication/CreateGroupModal', () => ({
  CreateGroupModal: () => null,
}));

jest.mock('@/src/stores/uiStore', () => ({
  useUIStore: (selector: any) => {
    const state = { tabBarHidden: false, setTabBarHidden: jest.fn() };
    return selector(state);
  },
}));

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
  (useConversations as jest.Mock).mockReturnValue({ conversations: [], loading: false, refetch: jest.fn() });
  (useContacts as jest.Mock).mockReturnValue({ contacts: [], loading: false, refetch: jest.fn() });
  (useGroups as jest.Mock).mockReturnValue({ groups: [], loading: false, refetch: jest.fn() });
  (useChildren as jest.Mock).mockReturnValue({ children: [], loading: false });
  // No deep link by default — individual tests opt in.
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
});

afterEach(() => {
  clearAuthState();
});

describe('MessagesScreen - mobile', () => {
  // Default test env: Platform.OS = 'ios', so isMobile = true

  it('renders conversation list in mobile mode', () => {
    const contacts = [
      createMockContact(),
      createMockContact({ id: 'student-2', first_name: 'Bob', last_name: 'Jones', relationship: 'student' }),
    ];
    (useContacts as jest.Mock).mockReturnValue({ contacts, loading: false, refetch: jest.fn() });

    const { getByText, queryByText } = render(<MessagesScreen />);

    expect(getByText('Messages (mobile)')).toBeTruthy();
    expect(getByText('Jane Smith')).toBeTruthy();
    expect(getByText('Bob Jones')).toBeTruthy();
    // Mobile: no split-panel empty state
    expect(queryByText('Select a conversation')).toBeNull();
  });

  it('shows empty state when no contacts or groups', () => {
    const { getByText, queryByText } = render(<MessagesScreen />);

    expect(getByText('No contacts available')).toBeTruthy();
    expect(queryByText('Select a conversation')).toBeNull();
  });

  it('navigates to DM chat when selecting a contact', () => {
    const contacts = [createMockContact()];
    (useContacts as jest.Mock).mockReturnValue({ contacts, loading: false, refetch: jest.fn() });

    const { getByText, queryByText } = render(<MessagesScreen />);

    fireEvent.press(getByText('Jane Smith'));

    // Chat replaces list on mobile
    expect(getByText('Chat with Jane Smith')).toBeTruthy();
    expect(queryByText('Messages (mobile)')).toBeNull();
  });

  it('navigates back from DM chat to list', () => {
    const contacts = [createMockContact()];
    (useContacts as jest.Mock).mockReturnValue({ contacts, loading: false, refetch: jest.fn() });

    const { getByText, getByTestId } = render(<MessagesScreen />);

    fireEvent.press(getByText('Jane Smith'));
    expect(getByText('Chat with Jane Smith')).toBeTruthy();

    fireEvent.press(getByTestId('back-button'));
    expect(getByText('Messages (mobile)')).toBeTruthy();
  });

  it('navigates to group chat when selecting a group', () => {
    const groups = [createMockGroup()];
    (useGroups as jest.Mock).mockReturnValue({ groups, loading: false, refetch: jest.fn() });

    const { getByText, queryByText } = render(<MessagesScreen />);

    fireEvent.press(getByText('Science Study Group'));

    expect(getByText('Group: Science Study Group')).toBeTruthy();
    expect(queryByText('Messages (mobile)')).toBeNull();
  });

  it('navigates back from group chat to list', () => {
    const groups = [createMockGroup()];
    (useGroups as jest.Mock).mockReturnValue({ groups, loading: false, refetch: jest.fn() });

    const { getByText, getByTestId } = render(<MessagesScreen />);

    fireEvent.press(getByText('Science Study Group'));
    expect(getByText('Group: Science Study Group')).toBeTruthy();

    fireEvent.press(getByTestId('back-button'));
    expect(getByText('Messages (mobile)')).toBeTruthy();
  });

  // A tapped message notification lands here with the conversation in the query
  // string. Without these the tap dropped the user on the inbox list and they
  // had to find the thread themselves (bug report 2026-09-02, class chats).
  describe('notification deep link', () => {
    it('opens the group chat named by ?group=', () => {
      const groups = [createMockGroup({ id: 'class-chat-1', name: 'ALD Class Chat' })];
      (useGroups as jest.Mock).mockReturnValue({ groups, loading: false, refetch: jest.fn() });
      (useLocalSearchParams as jest.Mock).mockReturnValue({ group: 'class-chat-1' });

      const { getByText, queryByText } = render(<MessagesScreen />);

      expect(getByText('Group: ALD Class Chat')).toBeTruthy();
      expect(queryByText('Messages (mobile)')).toBeNull();
    });

    it('stays on the list when ?group= names a group the user is not in', () => {
      (useGroups as jest.Mock).mockReturnValue({ groups: [createMockGroup()], loading: false, refetch: jest.fn() });
      (useLocalSearchParams as jest.Mock).mockReturnValue({ group: 'someone-elses-group' });

      const { getByText } = render(<MessagesScreen />);

      expect(getByText('Messages (mobile)')).toBeTruthy();
    });

    it('back out of a deep-linked group chat stays on the list', () => {
      const groups = [createMockGroup({ id: 'class-chat-1', name: 'ALD Class Chat' })];
      (useGroups as jest.Mock).mockReturnValue({ groups, loading: false, refetch: jest.fn() });
      (useLocalSearchParams as jest.Mock).mockReturnValue({ group: 'class-chat-1' });

      const { getByText, getByTestId } = render(<MessagesScreen />);

      fireEvent.press(getByTestId('back-button'));
      expect(getByText('Messages (mobile)')).toBeTruthy();
    });

    it('opens the DM named by ?user=', () => {
      const contacts = [createMockContact()];
      (useContacts as jest.Mock).mockReturnValue({ contacts, loading: false, refetch: jest.fn() });
      (useLocalSearchParams as jest.Mock).mockReturnValue({ user: contacts[0].id });

      const { getByText } = render(<MessagesScreen />);

      expect(getByText('Chat with Jane Smith')).toBeTruthy();
    });
  });

  it('shows loading state while data is fetching', () => {
    (useContacts as jest.Mock).mockReturnValue({ contacts: [], loading: true, refetch: jest.fn() });
    (useConversations as jest.Mock).mockReturnValue({ conversations: [], loading: true, refetch: jest.fn() });

    const { getByText } = render(<MessagesScreen />);

    expect(getByText('Loading conversations...')).toBeTruthy();
  });
});

describe('MessagesScreen - desktop', () => {
  const originalOS = Platform.OS;
  let mockWidth = 1024;

  beforeEach(() => {
    (Platform as any).OS = 'web';
    jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({
      width: mockWidth,
      height: 768,
      scale: 1,
      fontScale: 1,
    });
  });

  afterEach(() => {
    (Platform as any).OS = originalOS;
    jest.restoreAllMocks();
  });

  it('renders split-panel with empty chat placeholder', () => {
    const contacts = [createMockContact()];
    (useContacts as jest.Mock).mockReturnValue({ contacts, loading: false, refetch: jest.fn() });

    const { getByText } = render(<MessagesScreen />);

    // Desktop: list and empty state visible simultaneously
    expect(getByText('Messages')).toBeTruthy();
    expect(getByText('Jane Smith')).toBeTruthy();
    expect(getByText('Select a conversation')).toBeTruthy();
  });

  it('opens DM chat in panel while keeping list visible', () => {
    const contacts = [createMockContact()];
    (useContacts as jest.Mock).mockReturnValue({ contacts, loading: false, refetch: jest.fn() });

    const { getByText } = render(<MessagesScreen />);

    fireEvent.press(getByText('Jane Smith'));

    // Both list and chat visible on desktop
    expect(getByText('Messages')).toBeTruthy();
    expect(getByText('Chat with Jane Smith')).toBeTruthy();
  });
});
