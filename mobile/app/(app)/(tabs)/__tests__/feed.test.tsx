/**
 * Feed screen tests - renders FlatList of feed items.
 */

import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
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

      expect(useFeed).toHaveBeenCalledWith(expect.objectContaining({ studentId: undefined }));
      expect(useFeed).not.toHaveBeenCalledWith(expect.objectContaining({ studentId: 'kid-1' }));
    });
  });
});
