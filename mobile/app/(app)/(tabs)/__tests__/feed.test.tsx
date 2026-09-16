/**
 * Feed screen tests - renders FlatList of feed items.
 */

import React from 'react';
import { render, waitFor, act, fireEvent } from '@testing-library/react-native';
import FeedScreen from '../feed';
import { useFeed } from '@/src/hooks/useFeed';
import { setAuthAsStudent, setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { createMockFeedItem } from '@/src/__tests__/utils/mockFactories';
import { useFamilyStore } from '@/src/stores/familyStore';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

jest.mock('@/src/hooks/useFeed', () => ({
  useFeed: jest.fn(),
}));
jest.mock('@/src/components/feed/FeedCard', () => ({
  FeedCard: ({ item }: any) => {
    const { Text } = require('react-native');
    return <Text>{item.task?.title || item.moment?.title}</Text>;
  },
}));
jest.mock('@/src/components/layouts/MobileHeader', () => ({
  PageHeader: () => null,
}));
// The screen reads the kid list through this hook; the family store is
// seeded by hand in the scope tests below, so the fetch must not run and
// re-reconcile it after render.
jest.mock('@/src/hooks/useParent', () => ({
  useMyChildren: () => ({ children: [], loading: false }),
}));

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
});

afterEach(() => {
  clearAuthState();
});

describe('FeedScreen', () => {
  it('renders FlatList of FeedCard items', async () => {
    const items = [
      createMockFeedItem(),
      createMockFeedItem({ id: 'tc_feed-2', task: { id: 't2', title: 'Science Report', pillar: 'stem', xp_value: 75 } }),
    ];
    (useFeed as jest.Mock).mockReturnValue({
      items, loading: false, loadingMore: false, hasMore: false, error: null,
      loadMore: jest.fn(), refetch: jest.fn(),
    });

    const { getByText } = render(<FeedScreen />);

    await waitFor(() => {
      expect(getByText('Completed Math Quiz')).toBeTruthy();
      expect(getByText('Science Report')).toBeTruthy();
    });
  });

  it('shows empty state when no feed items', () => {
    (useFeed as jest.Mock).mockReturnValue({
      items: [], loading: false, loadingMore: false, hasMore: false, error: null,
      loadMore: jest.fn(), refetch: jest.fn(),
    });

    const { getByText } = render(<FeedScreen />);

    expect(getByText('No activity yet')).toBeTruthy();
  });

  // The All / Mine / Friends bar appears once there is a friend to filter by,
  // and Friends asks the server for scope=friends rather than filtering a
  // page of everyone's. The badge on the Friends button counts requests
  // waiting on the student.
  describe('whose work', () => {
    const empty = {
      items: [], loading: false, loadingMore: false, hasMore: false, error: null,
      loadMore: jest.fn(), refetch: jest.fn(),
    };
    const api = require('@/src/services/api').default as { get: jest.Mock };
    const friendsListing = (active: unknown[], incoming: unknown[] = []) => {
      api.get.mockImplementation((url: string) => {
        if (url.includes('eligibility')) return Promise.resolve({ data: { data: { state: 'eligible' } } });
        if (url === '/api/connections') return Promise.resolve({ data: { data: { active, incoming, outgoing: [], awaiting_approval: [] } } });
        return Promise.resolve({ data: {} });
      });
    };

    it('offers no filter to a student with no friends', async () => {
      (useFeed as jest.Mock).mockReturnValue(empty);
      friendsListing([]);
      const { queryByText } = render(<FeedScreen />);
      await act(async () => {});
      expect(queryByText('Mine')).toBeNull();
    });

    it('filters to friends through the server scope, and counts waiting requests', async () => {
      (useFeed as jest.Mock).mockReturnValue(empty);
      friendsListing(
        [{ id: 'c1', status: 'active', peer: { id: 'p1', display_name: 'Ada' } }],
        [{ id: 'c2', status: 'pending_addressee', peer: { id: 'p2', display_name: 'Bo' } }],
      );
      const { findByTestId, getByTestId } = render(<FeedScreen />);
      const friendsTab = await findByTestId('feed-segment-friends');
      expect(getByTestId('feed-friends-badge')).toHaveTextContent('1');
      await act(async () => { fireEvent.press(friendsTab); });
      const calls = (useFeed as jest.Mock).mock.calls.map((c) => c[0]);
      expect(calls.at(-1)).toEqual(expect.objectContaining({ scope: 'friends' }));
    });
  });

  // The family store picks a child on its own. A parent's feed starts on that
  // child; a superadmin's feed is the global one and must not.
  describe('starting scope', () => {
    const empty = {
      items: [], loading: false, loadingMore: false, hasMore: false, error: null,
      loadMore: jest.fn(), refetch: jest.fn(),
    };
    const kid = { id: 'kid-1', display_name: 'Sam', first_name: 'Sam' } as any;

    afterEach(() => {
      act(() => useFamilyStore.getState().clear());
    });

    // The parent welcome reads a stored flag after mount; flush it so the
    // state update lands inside act.
    const flush = () => act(async () => {});

    it('a parent starts on the child the family store selected', async () => {
      (useFeed as jest.Mock).mockReturnValue(empty);
      setAuthAsParent({ has_linked_students: true } as any);
      useFamilyStore.setState({ parentId: 'parent-1', children: [kid], selectedChildId: 'kid-1' });

      render(<FeedScreen />);
      await flush();

      expect(useFeed).toHaveBeenCalledWith(expect.objectContaining({ studentId: 'kid-1' }));
    });

    it('a superadmin who is also a parent starts on the global feed', async () => {
      (useFeed as jest.Mock).mockReturnValue(empty);
      setAuthAsParent({ role: 'superadmin', has_linked_students: true } as any);
      useFamilyStore.setState({ parentId: 'admin-1', children: [kid], selectedChildId: 'kid-1' });

      render(<FeedScreen />);
      await flush();

      // The global feed: no studentId at all (StudentFeed, not ParentFeed).
      const calls = (useFeed as jest.Mock).mock.calls.map(([opts]) => opts);
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((opts) => !opts.studentId)).toBe(true);
    });
  });
});
