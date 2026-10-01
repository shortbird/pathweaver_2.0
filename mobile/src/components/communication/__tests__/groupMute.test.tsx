/**
 * Muting a group chat's alerts on the phone.
 *
 * Owner decision, 2026-10-01: a member can mute one chat. A muted chat puts
 * nothing in their bell and sends their phone no push; the chat's own unread
 * count in Messages still climbs. The control is the bell in the chat header,
 * and the list row carries a small bell-off so a quiet chat explains itself.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { GroupChatWindow } from '../GroupChatWindow';
import { ConversationList } from '../ConversationList';
import { setGroupMuted, useGroupDetail } from '@/src/hooks/useMessages';
import { groupAPI } from '@/src/services/api';
import { setAuthAsStudent } from '@/src/__tests__/utils/authStoreHelper';
import { createMockGroup } from '@/src/__tests__/utils/mockFactories';

jest.mock('@/src/services/api', () => {
  const mod = require('@/src/__tests__/utils/mockApi').mockApiModule();
  // Until the shared mock lists it: the call this feature added.
  mod.groupAPI.mute = mod.groupAPI.mute || jest.fn().mockResolvedValue({ data: {} });
  return mod;
});

jest.mock('@/src/hooks/useMessages', () => {
  const actual = jest.requireActual('@/src/hooks/useMessages');
  return {
    useGroupMessages: () => ({ messages: [], loading: false, setMessages: jest.fn() }),
    useGroupDetail: jest.fn(() => ({ group: null, loading: false, refetch: jest.fn() })),
    markGroupRead: jest.fn(() => Promise.resolve()),
    sendGroupMessage: jest.fn(() => Promise.resolve({ id: 'm1' })),
    setGroupMuted: jest.fn(),
    // The list's page header carries the Messages button and its badge.
    useUnreadCount: () => ({ count: 0, refetch: jest.fn() }),
    // The real one, for the wire test at the bottom.
    realSetGroupMuted: actual.setGroupMuted,
  };
});

jest.mock('@/src/hooks/useMessagingRealtime', () => ({
  useMessagingRealtime: jest.fn(),
  appendRealtimeMessage: jest.fn(),
  patchMessageReactions: jest.fn(),
  patchMessageEdited: jest.fn(),
  patchMessageDeleted: jest.fn(),
}));

const MUTE = 'Mute alerts for this chat';
const UNMUTE = 'Unmute alerts for this chat';
const group = createMockGroup({ id: 'g1', name: 'Theater JR' });

beforeEach(() => {
  jest.clearAllMocks();
  setAuthAsStudent();
  (useGroupDetail as jest.Mock).mockReturnValue({ group: null, loading: false, refetch: jest.fn() });
});

describe('the bell in the chat header', () => {
  it('mutes a chat whose alerts are on, and tells the list', async () => {
    (setGroupMuted as jest.Mock).mockResolvedValueOnce({ muted: true });
    const onMuteChanged = jest.fn();
    const { getByLabelText, queryByLabelText, getByTestId } = render(
      <GroupChatWindow group={group} onMuteChanged={onMuteChanged} />
    );

    expect(getByTestId('icon-notifications-outline')).toBeTruthy();
    fireEvent.press(getByLabelText(MUTE));

    expect(setGroupMuted).toHaveBeenCalledWith('g1', true);
    await waitFor(() => expect(getByLabelText(UNMUTE)).toBeTruthy());
    expect(queryByLabelText(MUTE)).toBeNull();
    expect(getByTestId('icon-notifications-off-outline')).toBeTruthy();
    await waitFor(() => expect(onMuteChanged).toHaveBeenCalledWith(true));
  });

  it('unmutes a chat the list row says is muted', async () => {
    (setGroupMuted as jest.Mock).mockResolvedValueOnce({ muted: false });
    const { getByLabelText } = render(<GroupChatWindow group={{ ...group, muted: true }} />);

    fireEvent.press(getByLabelText(UNMUTE));

    expect(setGroupMuted).toHaveBeenCalledWith('g1', false);
    await waitFor(() => expect(getByLabelText(MUTE)).toBeTruthy());
  });

  // A chat opened from a push notification has no list row behind it, and a
  // row can be one poll old.
  it('trusts the chat detail over the row it was opened from', () => {
    (useGroupDetail as jest.Mock).mockReturnValue({
      group: { ...group, muted: true }, loading: false, refetch: jest.fn(),
    });
    const { getByLabelText } = render(<GroupChatWindow group={group} />);
    expect(getByLabelText(UNMUTE)).toBeTruthy();
  });

  // Desktop keeps the window mounted while the selection changes, so for a
  // moment it holds the last chat's detail.
  it('does not read another chat\'s detail as this one\'s', () => {
    (useGroupDetail as jest.Mock).mockReturnValue({
      group: { ...group, id: 'someone-else', muted: true }, loading: false, refetch: jest.fn(),
    });
    const { getByLabelText } = render(<GroupChatWindow group={group} />);
    expect(getByLabelText(MUTE)).toBeTruthy();
  });

  it('puts the bell back when the server refuses', async () => {
    (setGroupMuted as jest.Mock).mockRejectedValueOnce({
      response: { data: { error: 'You are not a member of this group' } },
    });
    const onMuteChanged = jest.fn();
    const { getByLabelText } = render(
      <GroupChatWindow group={group} onMuteChanged={onMuteChanged} />
    );

    fireEvent.press(getByLabelText(MUTE));

    await waitFor(() => expect(setGroupMuted).toHaveBeenCalled());
    await waitFor(() => expect(getByLabelText(MUTE)).toBeTruthy());
    expect(onMuteChanged).not.toHaveBeenCalled();
  });
});

describe('the list row', () => {
  const renderList = (groups: any[]) => render(
    <ConversationList
      contacts={[]}
      groups={groups}
      conversations={[]}
      selected={null}
      onSelect={jest.fn()}
      onCreateGroup={jest.fn()}
      loading={false}
      canCreateGroups={false}
      isMobile
    />
  );

  // The list reads which child sections are folded from storage after it
  // mounts; let that settle so it does not land outside the test.
  const settle = () => act(async () => {});

  it('marks a muted group, and only a muted group', async () => {
    const { getAllByTestId, getByText } = renderList([
      createMockGroup({ id: 'g1', name: 'Theater JR', muted: true, unread_count: 3 }),
      createMockGroup({ id: 'g2', name: 'Lego Lab', muted: false }),
    ]);
    await settle();

    expect(getByText('Lego Lab')).toBeTruthy();
    expect(getAllByTestId('icon-notifications-off-outline')).toHaveLength(1);
    // Muting silences the bell, not the list: the unread badge is still there.
    expect(getByText('3')).toBeTruthy();
  });

  // The rows are memoized on the fields they paint; `muted` has to be one of
  // them or the icon waits for some other field to change.
  it('repaints a row when only its mute changes', async () => {
    const before = [createMockGroup({ id: 'g1', name: 'Theater JR', muted: false })];
    const { queryByTestId, rerender } = renderList(before);
    await settle();
    expect(queryByTestId('icon-notifications-off-outline')).toBeNull();

    rerender(
      <ConversationList
        contacts={[]}
        groups={[{ ...before[0], muted: true }]}
        conversations={[]}
        selected={null}
        onSelect={jest.fn()}
        onCreateGroup={jest.fn()}
        loading={false}
        canCreateGroups={false}
        isMobile
      />
    );
    await settle();
    expect(queryByTestId('icon-notifications-off-outline')).toBeTruthy();
  });
});

describe('setGroupMuted', () => {
  it('posts the mute and returns what the server saved', async () => {
    const { realSetGroupMuted } = jest.requireMock('@/src/hooks/useMessages');
    (groupAPI.mute as jest.Mock).mockResolvedValueOnce({ data: { success: true, data: { muted: true } } });

    await expect(realSetGroupMuted('g1', true)).resolves.toEqual({ muted: true });
    expect(groupAPI.mute).toHaveBeenCalledWith('g1', true);
  });
});
