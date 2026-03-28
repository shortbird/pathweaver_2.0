/**
 * useMessages hook tests - conversations, messages, contacts, groups, send, mark read.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

import { renderHook, waitFor, act } from '@testing-library/react-native';
import {
  useConversations,
  useConversationMessages,
  useContacts,
  useUnreadCount,
  useGroups,
  useGroupMessages,
  useGroupDetail,
  sendDirectMessage,
  markMessageRead,
  sendGroupMessage,
  createGroup,
  markGroupRead,
} from '../useMessages';
import { messageAPI, groupAPI } from '@/src/services/api';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import {
  createMockConversation,
  createMockMessage,
  createMockContact,
  createMockGroup,
} from '@/src/__tests__/utils/mockFactories';

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  clearAuthState();
  jest.useRealTimers();
});

describe('useConversations', () => {
  it('fetches conversations from /api/messages/conversations', async () => {
    const mockConvos = [createMockConversation(), createMockConversation({ id: 'conv-2', unread_count: 0 })];
    (messageAPI.conversations as jest.Mock).mockResolvedValueOnce({
      data: { data: { conversations: mockConvos } },
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(messageAPI.conversations).toHaveBeenCalled();
    expect(result.current.conversations).toHaveLength(2);
  });
});

describe('useConversationMessages', () => {
  it('fetches messages for a conversation', async () => {
    const mockMessages = [
      createMockMessage(),
      createMockMessage({ id: 'msg-2', sender_id: 'advisor-1', recipient_id: 'user-1', message_content: 'Sure, ask away!' }),
    ];
    (messageAPI.messages as jest.Mock).mockResolvedValueOnce({
      data: { data: { messages: mockMessages } },
    });

    const { result } = renderHook(() => useConversationMessages('conv-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(messageAPI.messages).toHaveBeenCalledWith('conv-1');
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].message_content).toBe('Hello, I have a question about the assignment.');
  });

  it('skips fetch when conversationId is null', async () => {
    const { result } = renderHook(() => useConversationMessages(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(messageAPI.messages).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(0);
  });
});

describe('useContacts', () => {
  it('fetches messaging contacts from /api/messages/contacts', async () => {
    const mockContacts = [
      createMockContact(),
      createMockContact({ id: 'student-2', first_name: 'Bob', last_name: 'Jones', relationship: 'student' }),
    ];
    (messageAPI.contacts as jest.Mock).mockResolvedValueOnce({
      data: { data: { contacts: mockContacts } },
    });

    const { result } = renderHook(() => useContacts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(messageAPI.contacts).toHaveBeenCalled();
    expect(result.current.contacts).toHaveLength(2);
    expect(result.current.contacts[0].relationship).toBe('advisor');
  });
});

describe('useUnreadCount', () => {
  it('fetches unread count from /api/messages/unread-count', async () => {
    (messageAPI.unreadCount as jest.Mock).mockResolvedValueOnce({
      data: { data: { unread_count: 5 } },
    });

    const { result } = renderHook(() => useUnreadCount());

    await waitFor(() => {
      expect(result.current.count).toBe(5);
    });

    expect(messageAPI.unreadCount).toHaveBeenCalled();
  });
});

describe('useGroups', () => {
  it('fetches groups from /api/groups', async () => {
    const mockGroups = [createMockGroup(), createMockGroup({ id: 'group-2', name: 'Math Help' })];
    (groupAPI.list as jest.Mock).mockResolvedValueOnce({
      data: { data: { groups: mockGroups } },
    });

    const { result } = renderHook(() => useGroups());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(groupAPI.list).toHaveBeenCalled();
    expect(result.current.groups).toHaveLength(2);
    expect(result.current.groups[0].name).toBe('Science Study Group');
  });
});

describe('useGroupMessages', () => {
  it('fetches messages for a group', async () => {
    const mockMessages = [
      createMockMessage({ id: 'gmsg-1', group_id: 'group-1', message_content: 'Hey team!' }),
    ];
    (groupAPI.messages as jest.Mock).mockResolvedValueOnce({
      data: { data: { messages: mockMessages } },
    });

    const { result } = renderHook(() => useGroupMessages('group-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(groupAPI.messages).toHaveBeenCalledWith('group-1');
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].message_content).toBe('Hey team!');
  });
});

describe('useGroupDetail', () => {
  it('fetches group details with member list', async () => {
    const detail = {
      ...createMockGroup(),
      members: [
        { id: 'm1', user_id: 'advisor-1', role: 'admin', user: { id: 'advisor-1', display_name: 'Ms. Smith', first_name: 'Jane', last_name: 'Smith', avatar_url: null, role: 'advisor' } },
        { id: 'm2', user_id: 'user-1', role: 'member', user: { id: 'user-1', display_name: 'Test Student', first_name: 'Test', last_name: 'Student', avatar_url: null, role: 'student' } },
      ],
    };
    (groupAPI.get as jest.Mock).mockResolvedValueOnce({
      data: { data: { group: detail } },
    });

    const { result } = renderHook(() => useGroupDetail('group-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(groupAPI.get).toHaveBeenCalledWith('group-1');
    expect(result.current.group).toBeTruthy();
    expect(result.current.group!.members).toHaveLength(2);
    expect(result.current.group!.members![0].user.display_name).toBe('Ms. Smith');
  });
});

describe('message actions', () => {
  it('sendDirectMessage: POST /api/messages/conversations/{id}/send', async () => {
    (messageAPI.send as jest.Mock).mockResolvedValueOnce({
      data: { data: { message: createMockMessage(), conversation_id: 'conv-1' } },
    });

    await sendDirectMessage('advisor-1', 'Hello!');

    expect(messageAPI.send).toHaveBeenCalledWith('advisor-1', 'Hello!');
  });

  it('markMessageRead: PUT /api/messages/{id}/read', async () => {
    (messageAPI.markRead as jest.Mock).mockResolvedValueOnce({
      data: { data: { success: true } },
    });

    await markMessageRead('msg-1');

    expect(messageAPI.markRead).toHaveBeenCalledWith('msg-1');
  });

  it('sendGroupMessage: POST /api/groups/{id}/messages', async () => {
    (groupAPI.sendMessage as jest.Mock).mockResolvedValueOnce({
      data: { data: { message: createMockMessage({ group_id: 'group-1' }) } },
    });

    await sendGroupMessage('group-1', 'Hey team!');

    expect(groupAPI.sendMessage).toHaveBeenCalledWith('group-1', 'Hey team!');
  });

  it('createGroup: POST /api/groups', async () => {
    (groupAPI.create as jest.Mock).mockResolvedValueOnce({
      data: { data: { group: createMockGroup() } },
    });

    await createGroup('New Group', 'A description', ['user-2', 'user-3']);

    expect(groupAPI.create).toHaveBeenCalledWith({
      name: 'New Group',
      description: 'A description',
      member_ids: ['user-2', 'user-3'],
    });
  });

  it('markGroupRead: POST /api/groups/{id}/read', async () => {
    (groupAPI.markRead as jest.Mock).mockResolvedValueOnce({
      data: { data: { success: true } },
    });

    await markGroupRead('group-1');

    expect(groupAPI.markRead).toHaveBeenCalledWith('group-1');
  });
});
