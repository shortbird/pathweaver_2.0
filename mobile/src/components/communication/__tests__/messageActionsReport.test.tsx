/**
 * Report on a message (Friends phase 3): offered on someone else's message,
 * never on your own, and only when the window passes a handler (direct
 * messages do; group chats do not).
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MessageActionsSheet } from '../MessageActionsSheet';
import type { Message } from '@/src/hooks/useMessages';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

const message = {
  id: 'm1', sender_id: 'pal', recipient_id: 'me', message_content: 'hey', created_at: '2026-09-17T10:00:00Z',
} as unknown as Message;

const base = {
  visible: true,
  onClose: jest.fn(),
  message,
  canDelete: false,
  onReact: jest.fn(),
  onReply: jest.fn(),
  onDelete: jest.fn(),
};

describe('MessageActionsSheet report row', () => {
  it('shows Report for another person\'s message and runs it after close', () => {
    const onReport = jest.fn();
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <MessageActionsSheet {...base} isOwn={false} onReport={onReport} onClose={onClose} />
    );
    fireEvent.press(getByLabelText('Report'));
    // Deferred: the action runs once the sheet has closed, not on the tap.
    expect(onClose).toHaveBeenCalled();
    expect(onReport).not.toHaveBeenCalled();
  });

  it('never offers Report on your own message', () => {
    const { queryByLabelText } = render(
      <MessageActionsSheet {...base} isOwn onReport={jest.fn()} />
    );
    expect(queryByLabelText('Report')).toBeNull();
  });

  it('offers nothing when no handler is passed (group chats)', () => {
    const { queryByLabelText } = render(<MessageActionsSheet {...base} isOwn={false} />);
    expect(queryByLabelText('Report')).toBeNull();
  });
});
