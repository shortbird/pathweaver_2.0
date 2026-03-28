/**
 * Feed screen tests - renders FlatList of feed items.
 */

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

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import FeedScreen from '../feed';
import { useFeed } from '@/src/hooks/useFeed';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { createMockFeedItem } from '@/src/__tests__/utils/mockFactories';

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
      createMockFeedItem({ id: 'tc_feed-2', task: { id: 't2', title: 'Science Report', pillar: 'stem', xp_value: 75, quest_id: 'q1', quest_title: 'Q' } }),
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
});
