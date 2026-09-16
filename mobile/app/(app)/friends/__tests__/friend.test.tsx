/**
 * A friend's page (2026-09-16): since when and the classes shared, the
 * friend's quests with the shared ones marked, their work filtered to them,
 * and Collaborate sending the invite for the picked quest. A student who is
 * not a friend meets a dead end.
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import FriendScreen from '../[id]';
import api from '@/src/services/api';
import { useFeed } from '@/src/hooks/useFeed';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/hooks/useFeed', () => ({ useFeed: jest.fn() }));
jest.mock('@/src/components/feed/FeedCard', () => ({
  FeedCard: ({ item }: any) => {
    const { Text } = require('react-native');
    return <Text>{item.title}</Text>;
  },
}));
jest.mock('@/src/components/ui/bottom-sheet', () => ({
  BottomSheet: ({ visible, children }: any) => (visible ? children : null),
}));
jest.mock('@/src/utils/alerts', () => ({ showAlert: jest.fn(), confirmAlert: jest.fn() }));

const PAGE = {
  peer: { id: 'p1', display_name: 'Ada', avatar_url: null },
  connection_id: 'c1',
  friends_since: '2026-09-16T12:00:00Z',
  can_message: true,
  shared_classes: ['Algebra 1'],
  quests: [
    { id: 'q2', title: 'Class project', image_url: null, shared: true },
    { id: 'q1', title: 'Explore a zoo', image_url: null, shared: false },
  ],
  my_quests: [{ id: 'q2', title: 'Class project', shared: true }, { id: 'q3', title: 'Build a kite', shared: false }],
};

const feedWith = (items: any[]) => (useFeed as jest.Mock).mockReturnValue({
  items, loading: false, loadingMore: false, hasMore: false, error: null, loadMore: jest.fn(), refetch: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
  setAuthAsStudent();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'p1' });
});
afterEach(() => clearAuthState());

describe('a friend\'s page', () => {
  it('shows the context, the quests with shared ones marked, and their work', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: PAGE } });
    feedWith([{ id: 'f1', title: 'Built a kite' }]);
    const { findByText, getByText, getByTestId, queryByText } = render(<FriendScreen />);
    await findByText('Ada');
    expect(getByText(/In Algebra 1 with you/)).toBeTruthy();
    expect(getByText(/Friends since/)).toBeTruthy();
    expect(getByText('Class project')).toBeTruthy();
    expect(getByText('You are both on this')).toBeTruthy();
    expect(getByText('Built a kite')).toBeTruthy();
    expect(getByTestId('friend-message-button')).toBeTruthy();
    expect(queryByText('Explore a zoo')).toBeTruthy();
    expect(useFeed).toHaveBeenCalledWith({ studentId: 'p1' });
  });

  it('invites the friend to the picked quest', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: PAGE } });
    (api.post as jest.Mock).mockResolvedValue({ data: { data: { invited: true, already_on_quest: false } } });
    feedWith([]);
    const { findByTestId, getByTestId } = render(<FriendScreen />);
    fireEvent.press(await findByTestId('friend-collaborate-button'));
    await findByTestId('collaborate-sheet');
    await act(async () => { fireEvent.press(getByTestId('collaborate-q3')); });
    expect(api.post).toHaveBeenCalledWith('/api/connections/friends/p1/collaborate', { quest_id: 'q3' });
  });

  it('is a dead end for a student who is not a friend', async () => {
    (api.get as jest.Mock).mockRejectedValue({ response: { status: 400, data: { error: 'You are not friends with this student.' } } });
    feedWith([]);
    const { findByText } = render(<FriendScreen />);
    expect(await findByText('You are not friends with this student.')).toBeTruthy();
  });
});
