/**
 * Enter must not send a message.
 *
 * The composers previously sent on Enter (Shift+Enter for a newline), but the RN
 * key event can't cancel the newline the multiline input has already inserted —
 * so one Enter both sent the message AND left a stray line break in the box.
 * Sending is the send button only; Enter is a plain newline.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

jest.mock('@/src/hooks/useMessages', () => ({
  useConversationMessages: () => ({ messages: [], loading: false, setMessages: jest.fn() }),
  useGroupMessages: () => ({ messages: [], loading: false, setMessages: jest.fn() }),
  useGroupDetail: () => ({ detail: null, loading: false, refetch: jest.fn() }),
  sendDirectMessage: jest.fn(() => Promise.resolve({ id: 'm1' })),
  sendGroupMessage: jest.fn(() => Promise.resolve({ id: 'm1' })),
  markMessageRead: jest.fn(() => Promise.resolve()),
  markGroupRead: jest.fn(() => Promise.resolve()),
  toggleDmReaction: jest.fn(() => Promise.resolve()),
  toggleGroupReaction: jest.fn(() => Promise.resolve()),
  editDirectMessage: jest.fn(() => Promise.resolve()),
  editGroupMessage: jest.fn(() => Promise.resolve()),
  deleteDirectMessage: jest.fn(() => Promise.resolve()),
  deleteGroupMessage: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/src/hooks/useMessagingRealtime', () => ({
  useMessagingRealtime: jest.fn(),
  appendRealtimeMessage: jest.fn(),
  patchMessageReactions: jest.fn(),
  patchMessageEdited: jest.fn(),
  patchMessageDeleted: jest.fn(),
}));

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ChatWindow } from '../ChatWindow';
import { GroupChatWindow } from '../GroupChatWindow';
import { sendDirectMessage, sendGroupMessage } from '@/src/hooks/useMessages';
import { setAuthAsStudent } from '@/src/__tests__/utils/authStoreHelper';

const contact = { id: 'c1', first_name: 'Molly', last_name: 'Christensen' } as any;
const group = { id: 'g1', name: 'Theater JR', member_count: 4 } as any;

beforeEach(() => {
  jest.clearAllMocks();
  setAuthAsStudent();
});

describe('message composer Enter key', () => {
  it('does not send a direct message on Enter', () => {
    const { getByPlaceholderText } = render(
      <ChatWindow contact={contact} conversationId="conv-1" />
    );

    const input = getByPlaceholderText('Message Molly Christensen...');
    fireEvent.changeText(input, 'hello');
    fireEvent(input, 'keyPress', { nativeEvent: { key: 'Enter' } });
    fireEvent(input, 'submitEditing', { nativeEvent: { text: 'hello' } });

    expect(sendDirectMessage).not.toHaveBeenCalled();
    // Enter is a newline, so the draft stays in the box.
    expect(input.props.value).toBe('hello');
  });

  it('does not send a group message on Enter', () => {
    const { getByPlaceholderText } = render(
      <GroupChatWindow group={group} />
    );

    const input = getByPlaceholderText('Type a message...');
    fireEvent.changeText(input, 'hello team');
    fireEvent(input, 'keyPress', { nativeEvent: { key: 'Enter' } });
    fireEvent(input, 'submitEditing', { nativeEvent: { text: 'hello team' } });

    expect(sendGroupMessage).not.toHaveBeenCalled();
    expect(input.props.value).toBe('hello team');
  });

  it('keeps Enter as a newline instead of a submit', () => {
    const { getByPlaceholderText } = render(
      <ChatWindow contact={contact} conversationId="conv-1" />
    );

    const input = getByPlaceholderText('Message Molly Christensen...');
    expect(input.props.multiline).toBe(true);
    expect(input.props.submitBehavior).toBe('newline');
    expect(input.props.onKeyPress).toBeUndefined();
  });
});
