/**
 * Read receipts and the "<Teacher> for <School>" label on the phone
 * (iCreate meeting, 2026-09-23: 9b46c748 "add read receipts", d93b24d2 a
 * teacher answering a thread the office handed them).
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { ReceiptLine, SenderLabel, seenByCount } from '../MessageParts';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

describe('seenByCount', () => {
  const msg = { sender_id: 'me', created_at: '2026-09-24T10:00:00Z' };

  it('counts the members whose marker is at or past the message', () => {
    expect(seenByCount([
      { user_id: 'me', last_read_at: '2026-09-24T11:00:00Z' },
      { user_id: 'a', last_read_at: '2026-09-24T10:00:00Z' },
      { user: { id: 'b' }, last_read_at: '2026-09-24T12:00:00Z' },
      { user_id: 'c', last_read_at: '2026-09-24T09:00:00Z' },
      { user_id: 'd', last_read_at: null },
    ], msg, 'me')).toBe(2);
  });
});

describe('ReceiptLine', () => {
  it('says the receipt', () => {
    const { getByText } = render(<ReceiptLine text="Seen by 2" />);
    expect(getByText('Seen by 2')).toBeTruthy();
  });

  it('renders nothing without one', () => {
    const { toJSON } = render(<ReceiptLine text={null} />);
    expect(toJSON()).toBeNull();
  });
});

describe('SenderLabel', () => {
  it('names who wrote a school message', () => {
    const { getByText } = render(<SenderLabel label="Tam T for iCreate" isMine={false} />);
    expect(getByText('Tam T for iCreate')).toBeTruthy();
  });

  it('renders nothing on an ordinary message', () => {
    const { toJSON } = render(<SenderLabel label={undefined} isMine={false} />);
    expect(toJSON()).toBeNull();
  });
});
