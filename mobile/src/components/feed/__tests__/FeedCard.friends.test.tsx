/**
 * FeedCard, a friend's item (Friends phase 2, 2026-09-16).
 *
 * What would be unsafe or misleading if it broke: a peer never gets a share
 * button (seeing a friend's work is not licence to publish it); no reaction
 * chips appear for anyone (the canned phrases were dropped 2026-09-16; a
 * friend comments instead); the comment sheet is told which audience it
 * serves; the menu offers "Remove friend" and says "Block", not "Unfollow".
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FeedCard } from '../FeedCard';
import { createMockFeedItem } from '@/src/__tests__/utils/mockFactories';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: { restore: jest.fn(), setTokens: jest.fn(), clearTokens: jest.fn(), getAccessToken: jest.fn(), getRefreshToken: jest.fn() },
}));
jest.mock('@/src/hooks/useFeed', () => ({
  getViewers: jest.fn().mockResolvedValue({ viewers: [], total: 0 }),
  createShareLink: jest.fn(),
  toggleVisibility: jest.fn(),
  toggleFeedHighlight: jest.fn(),
  toggleStoryCandidate: jest.fn(),
}));
jest.mock('@/src/hooks/useFriends', () => ({
  ...jest.requireActual('@/src/hooks/useFriends'),
  setReaction: jest.fn().mockResolvedValue(undefined),
  clearReaction: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../VideoPlayer', () => ({ VideoPlayer: () => null }));
jest.mock('../DocumentViewer', () => ({ DocumentViewer: () => null }));
jest.mock('../MediaModal', () => ({ MediaModal: () => null }));
const mockCommentSheet = jest.fn();
jest.mock('../CommentSheet', () => ({ CommentSheet: (props: any) => { mockCommentSheet(props); return null; } }));
jest.mock('@/src/services/imageUrl', () => ({ displayImageUrl: (u: string | null) => u, isHeicUrl: () => false }));

beforeEach(() => { setAuthAsStudent(); jest.clearAllMocks(); });
afterEach(() => clearAuthState());

const peerItem = (overrides = {}) => createMockFeedItem({
  student: { id: 'friend-1', display_name: 'Ada', avatar_url: null },
  // A real completion: a draft evidence block has nothing to react to yet.
  completion_id: 'tc-1',
  viewer_relationship: 'peer',
  can_share: false,
  reactions: { by_key: { proud: 2 }, mine: null },
  ...overrides,
} as any);

describe('a friend\'s item', () => {
  it('never shows a share button to a peer, whatever can_share says', () => {
    const { queryByLabelText } = render(<FeedCard item={peerItem({ can_share: true })} />);
    expect(queryByLabelText('Share')).toBeNull();
  });

  it('shows no reaction chips, even where the server reports reactions', () => {
    const { queryByTestId, queryByText } = render(<FeedCard item={peerItem()} />);
    expect(queryByText(/Proud of you/)).toBeNull();
    expect(queryByTestId('reaction-keep_going')).toBeNull();
  });

  it('hands the comment sheet the peer audience', () => {
    const { getByLabelText } = render(<FeedCard item={peerItem()} />);
    fireEvent.press(getByLabelText('Comments'));
    expect(mockCommentSheet).toHaveBeenCalledWith(expect.objectContaining({ audience: 'peer' }));
  });
});

describe('the owner\'s own item', () => {
  it('shows no reaction chips on the owner\'s own item either', () => {
    const item = createMockFeedItem({
      student: { id: 'user-1', display_name: 'Me', avatar_url: null },
      viewer_relationship: 'self',
      reactions: { by_key: { thanks: 3 }, mine: null },
    } as any);
    const { queryByText, queryByTestId } = render(<FeedCard item={item} />);
    expect(queryByText(/Thanks for sharing/)).toBeNull();
    expect(queryByTestId('reaction-thanks')).toBeNull();
  });

  it('hands the comment sheet the adult audience', () => {
    const item = createMockFeedItem({ viewer_relationship: 'adult' } as any);
    const { getByLabelText } = render(<FeedCard item={item} />);
    fireEvent.press(getByLabelText('Comments'));
    expect(mockCommentSheet).toHaveBeenCalledWith(expect.objectContaining({ audience: 'adult' }));
  });
});
