/**
 * The friends strip at the top of a student's feed: Add first in the row,
 * the friends after it, the waiting requests counted on the See all door;
 * an invitation card when there are no friends yet; the ask itself when a
 * parent holds the switch; one line when Friends is off with nobody to ask
 * or a birthday is still owed; nothing when the school has the module off.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { FriendsStrip } from '../FriendsStrip';
import { askParent, type Connections, type Eligibility } from '@/src/hooks/useFriends';

jest.mock('@/src/hooks/useFriends', () => ({ askParent: jest.fn() }));
jest.mock('@/src/utils/alerts', () => ({ showAlert: jest.fn() }));

const none: Connections = { active: [], incoming: [], outgoing: [], awaiting_approval: [] };
const eligible: Eligibility = { state: 'eligible', reason: null, who_can_enable: null, policy: null };
const friend = (id: string, display_name: string) => ({
  id: `c-${id}`, status: 'active', peer: { id, display_name, avatar_url: null }, created_at: '2026-09-01',
});

beforeEach(() => jest.clearAllMocks());

describe('FriendsStrip', () => {
  it('shows nothing while loading, and nothing when the school has Friends off', () => {
    render(<FriendsStrip eligibility={null} connections={none} loading isDesktop={false} />);
    expect(screen.toJSON()).toBeNull();
    render(<FriendsStrip eligibility={{ ...eligible, state: 'module_off' }} connections={none} loading={false} isDesktop={false} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('invites a student with no friends yet, with the two ways in, and Add a friend goes straight to adding', () => {
    render(<FriendsStrip eligibility={eligible} connections={none} loading={false} isDesktop={false} />);
    expect(screen.getByText('Add friends to see their work here')).toBeTruthy();
    expect(screen.getByText('Add a classmate, or share your code with a friend.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('friends-strip-add'));
    expect(router.push).toHaveBeenCalledWith('/(app)/friends/add');
    fireEvent.press(screen.getByTestId('feed-friends-button'));
    expect(router.push).toHaveBeenCalledWith('/(app)/friends');
  });

  it('puts Add first in the row, then each friend by first name, opening their page', () => {
    const connections = { ...none, active: [friend('p1', 'Ada Lovelace'), friend('p2', 'Bo')] };
    render(<FriendsStrip eligibility={eligible} connections={connections} loading={false} isDesktop={false} />);
    expect(screen.queryByTestId('friends-strip-empty')).toBeNull();
    expect(screen.getByText('Add')).toBeTruthy();
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('Bo')).toBeTruthy();
    fireEvent.press(screen.getByTestId('friends-strip-p1'));
    expect(router.push).toHaveBeenCalledWith('/(app)/friends/p1');
    fireEvent.press(screen.getByTestId('friends-strip-add'));
    expect(router.push).toHaveBeenCalledWith('/(app)/friends/add');
  });

  it('counts the requests waiting on the student on the door to Friends', () => {
    const connections = {
      ...none,
      active: [friend('p1', 'Ada')],
      incoming: [friend('p2', 'Bo'), friend('p3', 'Cy')],
    };
    render(<FriendsStrip eligibility={eligible} connections={connections} loading={false} isDesktop={false} />);
    expect(screen.getByTestId('feed-friends-badge')).toHaveTextContent('2');
    expect(screen.getByText('2 requests')).toBeTruthy();
    expect(screen.getByLabelText('See all friends, 2 requests waiting for you')).toBeTruthy();
  });

  it('lets a kid whose parent holds the switch ask them from right here', async () => {
    // The ask is the server's ask_parent: a push (and an email) to every
    // guardian, whose link opens the child's Friends settings on the
    // parent's phone. The card says so once it is sent, and the button goes.
    (askParent as jest.Mock).mockResolvedValue({ asked: 1 });
    render(<FriendsStrip
      eligibility={{ state: 'friends_off', reason: 'Ask Lynette to turn on Friends for you.', who_can_enable: 'parent', policy: null }}
      connections={none} loading={false} isDesktop={false}
    />);
    expect(screen.getByText('Ask Lynette to turn on Friends for you.')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId('friends-strip-ask-button')); });
    expect(askParent).toHaveBeenCalled();
    expect(screen.getByText('Asked. Your parent will get a notification and an email.')).toBeTruthy();
    expect(screen.queryByTestId('friends-strip-ask-button')).toBeNull();
  });

  it('is one line to the Friends screen while Friends is off with nobody to ask, or a birthday is owed', () => {
    render(<FriendsStrip
      eligibility={{ state: 'friends_off', reason: 'Ask your school to turn on Friends.', who_can_enable: 'org_admin', policy: null }}
      connections={none} loading={false} isDesktop={false}
    />);
    expect(screen.getByText('Ask your school to turn on Friends.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('friends-strip-off'));
    expect(router.push).toHaveBeenCalledWith('/(app)/friends');

    // Nobody to ask: the server's two sentences would wrap; the short form.
    render(<FriendsStrip
      eligibility={{ state: 'friends_off', reason: 'Connecting with other students needs a parent or guardian to turn it on. Ask an adult to link their account to yours.', who_can_enable: 'nobody', policy: null }}
      connections={none} loading={false} isDesktop={false}
    />);
    expect(screen.getByText('Friends is off for you')).toBeTruthy();

    render(<FriendsStrip
      eligibility={{ state: 'needs_dob', reason: null, who_can_enable: 'self', policy: null }}
      connections={none} loading={false} isDesktop={false}
    />);
    expect(screen.getByText('Turn on Friends')).toBeTruthy();
  });
});
