/**
 * "Email this to me" on a direct message: superadmin only.
 *
 * Ticket fc21a562 (Tanner, superadmin, mobile /messages, 2026-10-05): "Email
 * this to me disappeared. I want it back." It was removed on 2026-10-01 and is
 * restored as it was: the row shows for a superadmin and for nobody else,
 * because it mails one person's words to a mailbox they did not choose.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ChatWindow } from '../ChatWindow';
import { MessageActionsSheet } from '../MessageActionsSheet';
import type { Message } from '@/src/hooks/useMessages';
import { setAuthAsStudent } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

const received = {
  id: 'm1', sender_id: 'member-1', recipient_id: 'test-user-id',
  message_content: 'Help with my credit', created_at: '2026-10-05T15:00:00Z',
} as unknown as Message;

jest.mock('@/src/hooks/useMessages', () => ({
  useConversationMessages: () => ({
    messages: [{
      id: 'm1', sender_id: 'member-1', recipient_id: 'test-user-id',
      message_content: 'Help with my credit', created_at: '2026-10-05T15:00:00Z',
    }],
    loading: false,
    setMessages: jest.fn(),
  }),
  sendDirectMessage: jest.fn(() => Promise.resolve({ id: 'm2' })),
  markMessageRead: jest.fn(() => Promise.resolve()),
  toggleDmReaction: jest.fn(() => Promise.resolve()),
  editDirectMessage: jest.fn(() => Promise.resolve()),
  deleteDirectMessage: jest.fn(() => Promise.resolve()),
  forwardMessageToSchool: jest.fn(() => Promise.resolve({})),
  emailMessageToMe: jest.fn(() => Promise.resolve({ emailed_to: 't@x.com', replies_enabled: true })),
}));

jest.mock('@/src/hooks/useMessagingRealtime', () => ({
  useMessagingRealtime: jest.fn(),
  appendRealtimeMessage: jest.fn(),
  patchMessageReactions: jest.fn(),
  patchMessageEdited: jest.fn(),
  patchMessageDeleted: jest.fn(),
}));

const contact = { id: 'member-1', first_name: 'Finn', last_name: 'Oneill' } as any;

function openActionsOnTheMessage(role: string) {
  setAuthAsStudent({ role } as any);
  const screen = render(<ChatWindow contact={contact} conversationId="conv-1" />);
  fireEvent(screen.getByText('Help with my credit'), 'longPress');
  return screen;
}

describe('Email this to me in the direct message window', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers the row to a superadmin', () => {
    const { getByLabelText } = openActionsOnTheMessage('superadmin');
    expect(getByLabelText('Email this to me')).toBeTruthy();
  });

  it.each(['student', 'parent', 'advisor', 'org_managed'])('hides the row from a %s', (role) => {
    const { queryByLabelText, getByLabelText } = openActionsOnTheMessage(role);
    // The sheet is open (Reply is always offered), and the row is not in it.
    expect(getByLabelText('Reply')).toBeTruthy();
    expect(queryByLabelText('Email this to me')).toBeNull();
  });
});

describe('MessageActionsSheet email row', () => {
  const base = {
    visible: true,
    message: received,
    isOwn: false,
    canDelete: false,
    onReact: jest.fn(),
    onReply: jest.fn(),
    onDelete: jest.fn(),
  };

  it('shows the row only when the window passes a handler, and closes the sheet on tap', () => {
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <MessageActionsSheet {...base} onClose={onClose} onEmailToSelf={jest.fn()} />
    );
    fireEvent.press(getByLabelText('Email this to me'));
    expect(onClose).toHaveBeenCalled();
  });

  it('has no row without a handler', () => {
    const { queryByLabelText } = render(<MessageActionsSheet {...base} onClose={jest.fn()} />);
    expect(queryByLabelText('Email this to me')).toBeNull();
  });
});
