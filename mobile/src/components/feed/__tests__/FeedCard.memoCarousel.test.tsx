/**
 * FeedCard: memo by value for reactions, and the carousel position indicator.
 *
 * Ticket 2c34704a (/feed): "Reopening the app after it had been running in
 * background for a while made the feed very choppy." The foreground refetch
 * gave every item a fresh `reactions` object and the memo compared it by
 * reference, so every mounted card re-rendered at once.
 *
 * Ticket dceb708c (/feed): "Dots go across whole screen with many images."
 * The carousel drew one dot per image with no cap.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { FeedCard, CarouselPosition, CAROUSEL_MAX_DOTS } from '../FeedCard';
import { createMockFeedItem } from '@/src/__tests__/utils/mockFactories';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: {
    restore: jest.fn(),
    setTokens: jest.fn().mockResolvedValue(undefined),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
  },
}));
jest.mock('@/src/hooks/useFeed', () => ({
  getViewers: jest.fn().mockResolvedValue({ viewers: [], total: 0 }),
  createShareLink: jest.fn(),
  toggleVisibility: jest.fn(),
  toggleFeedHighlight: jest.fn(),
  toggleStoryCandidate: jest.fn(),
}));
jest.mock('../VideoPlayer', () => ({ VideoPlayer: () => null }));
jest.mock('../DocumentViewer', () => ({ DocumentViewer: () => null }));
jest.mock('../MediaModal', () => ({ MediaModal: () => null }));
jest.mock('../CommentSheet', () => ({ CommentSheet: () => null }));
jest.mock('@/src/services/imageUrl', () => ({
  displayImageUrl: (url: string | null) => url,
  isHeicUrl: () => false,
}));

beforeEach(() => setAuthAsStudent());
afterEach(() => clearAuthState());

// React.memo keeps its comparator on the returned object; a `true` result
// means "props equal, skip the render".
const propsEqual = (FeedCard as unknown as { compare: (a: any, b: any) => boolean }).compare;

describe('FeedCard memo compares reactions by value (ticket 2c34704a)', () => {
  const base = createMockFeedItem({
    reactions: { by_key: { proud: 2, curious: 1 }, mine: 'proud' },
  });
  const props = (item: typeof base) => ({ item, showStudent: true });

  it('"made the feed very choppy": a refetched item with equal reactions does not re-render', () => {
    const refetched = { ...base, reactions: { by_key: { proud: 2, curious: 1 }, mine: 'proud' as const } };
    expect(refetched.reactions).not.toBe(base.reactions);
    expect(propsEqual(props(base), props(refetched))).toBe(true);
  });

  it('re-renders when a reaction count changes', () => {
    const changed = { ...base, reactions: { by_key: { proud: 3, curious: 1 }, mine: 'proud' as const } };
    expect(propsEqual(props(base), props(changed))).toBe(false);
  });

  it("re-renders when the viewer's own reaction changes", () => {
    const changed = { ...base, reactions: { by_key: { proud: 2, curious: 1 }, mine: null } };
    expect(propsEqual(props(base), props(changed))).toBe(false);
  });

  it('re-renders when reactions appear or disappear', () => {
    const none = { ...base, reactions: undefined };
    expect(propsEqual(props(base), props(none))).toBe(false);
    expect(propsEqual(props(none), props(base))).toBe(false);
  });
});

describe('Carousel position indicator (ticket dceb708c, "Dots go across whole screen with many images")', () => {
  it('shows nothing for one image', () => {
    const { queryByTestId, queryAllByTestId } = render(<CarouselPosition count={1} index={0} />);
    expect(queryAllByTestId('carousel-dot')).toHaveLength(0);
    expect(queryByTestId('carousel-counter')).toBeNull();
  });

  it('shows one dot per image from 2 up to the cap', () => {
    for (const n of [2, CAROUSEL_MAX_DOTS]) {
      const { queryAllByTestId, queryByTestId, unmount } = render(<CarouselPosition count={n} index={0} />);
      expect(queryAllByTestId('carousel-dot')).toHaveLength(n);
      expect(queryByTestId('carousel-counter')).toBeNull();
      unmount();
    }
    expect(CAROUSEL_MAX_DOTS).toBe(5);
  });

  it('shows a "3/12" counter instead of dots above the cap', () => {
    const { queryAllByTestId, getByTestId } = render(<CarouselPosition count={12} index={2} />);
    expect(queryAllByTestId('carousel-dot')).toHaveLength(0);
    expect(getByTestId('carousel-counter')).toHaveTextContent('3/12');
  });

  it('a feed card with 12 photos shows the counter, not 12 dots', () => {
    const item = createMockFeedItem({
      media: Array.from({ length: 12 }, (_, i) => ({ type: 'image', url: `https://img.test/${i}.jpg` })) as any,
    });
    const { queryAllByTestId, getByTestId } = render(<FeedCard item={item} />);
    expect(queryAllByTestId('carousel-dot')).toHaveLength(0);
    expect(getByTestId('carousel-counter')).toHaveTextContent('1/12');
  });

  it('a feed card with 3 photos shows 3 dots', () => {
    const item = createMockFeedItem({
      media: Array.from({ length: 3 }, (_, i) => ({ type: 'image', url: `https://img.test/${i}.jpg` })) as any,
    });
    const { queryAllByTestId, queryByTestId } = render(<FeedCard item={item} />);
    expect(queryAllByTestId('carousel-dot')).toHaveLength(3);
    expect(queryByTestId('carousel-counter')).toBeNull();
  });
});
