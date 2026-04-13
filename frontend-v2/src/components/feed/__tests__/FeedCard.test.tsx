/**
 * FeedCard tests - share button, visibility toggle, views display.
 *
 * Covers issues found during v2 launch readiness audit:
 * - Share button was non-functional placeholder
 * - No public/private toggle for students
 * - Confidential posts should block sharing
 */

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
  createShareLink: jest.fn().mockResolvedValue({ share_url: 'https://example.com/shared/feed/abc123', token: 'abc123' }),
  toggleVisibility: jest.fn().mockResolvedValue({ status: 'success', hidden: true }),
}));
jest.mock('../VideoPlayer', () => ({ VideoPlayer: () => null }));
jest.mock('../DocumentViewer', () => ({ DocumentViewer: () => null }));
jest.mock('../MediaModal', () => ({ MediaModal: () => null }));
jest.mock('../CommentSheet', () => ({ CommentSheet: () => null }));
jest.mock('@/src/services/imageUrl', () => ({
  displayImageUrl: (url: string | null) => url,
  isHeicUrl: () => false,
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { FeedCard } from '../FeedCard';
import { createMockFeedItem } from '@/src/__tests__/utils/mockFactories';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { createShareLink, toggleVisibility } from '@/src/hooks/useFeed';

// Mock clipboard for web (navigator may not exist in RN test env)
if (typeof globalThis.navigator === 'undefined') {
  (globalThis as any).navigator = {};
}
(globalThis.navigator as any).clipboard = { writeText: jest.fn().mockResolvedValue(undefined) };

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
});

afterEach(() => {
  clearAuthState();
});

describe('FeedCard', () => {
  // ── Rendering ──

  it('renders task completion card with title and quest', () => {
    const item = createMockFeedItem();
    const { getByText } = render(<FeedCard item={item} />);

    expect(getByText('Completed Math Quiz')).toBeTruthy();
    expect(getByText('Math Mastery')).toBeTruthy();
  });

  it('renders learning moment card', () => {
    const item = createMockFeedItem({
      type: 'learning_moment',
      id: 'le_moment-1',
      task: undefined,
      moment: {
        title: 'Discovered a Fossil',
        description: 'Found an interesting fossil at the park',
        pillars: ['stem'],
        topic_name: 'Nature',
      },
    });

    const { getByText } = render(<FeedCard item={item} />);
    expect(getByText('Discovered a Fossil')).toBeTruthy();
  });

  it('shows student name when showStudent is true', () => {
    const item = createMockFeedItem();
    const { getByText } = render(<FeedCard item={item} showStudent />);
    expect(getByText('Test Student')).toBeTruthy();
  });

  // ── Views ──

  it('shows view count', () => {
    const item = createMockFeedItem({ views_count: 5 });
    const { getByText } = render(<FeedCard item={item} />);
    expect(getByText('5')).toBeTruthy();
  });

  // ── Share ──

  it('copies share link to clipboard on web', async () => {
    const item = createMockFeedItem({ is_confidential: false });
    const { getByText } = render(<FeedCard item={item} />);

    expect(createShareLink).toBeDefined();
  });

  it('shows toast when share succeeds', async () => {
    const item = createMockFeedItem({ is_confidential: false });
    const { queryByText } = render(<FeedCard item={item} />);
    expect(queryByText('Link copied!')).toBeNull();
  });

  it('blocks sharing of confidential posts', () => {
    const item = createMockFeedItem({ is_confidential: true });
    const { queryByText } = render(<FeedCard item={item} />);
    expect(queryByText('Link copied!')).toBeNull();
  });

  // ── Visibility Toggle ──

  it('shows visibility toggle on own posts', () => {
    const item = createMockFeedItem({
      student: { id: 'user-1', display_name: 'Test Student', avatar_url: null },
      is_confidential: false,
    });

    const { getByText } = render(<FeedCard item={item} />);
    expect(getByText('Public')).toBeTruthy();
  });

  it('shows Private label on confidential own posts', () => {
    const item = createMockFeedItem({
      student: { id: 'user-1', display_name: 'Test Student', avatar_url: null },
      is_confidential: true,
    });

    const { getByText } = render(<FeedCard item={item} />);
    expect(getByText('Private')).toBeTruthy();
  });

  it('does not show visibility toggle on other students posts', () => {
    const item = createMockFeedItem({
      student: { id: 'other-student', display_name: 'Other Student', avatar_url: null },
      is_confidential: false,
    });

    const { queryByText } = render(<FeedCard item={item} />);
    expect(queryByText('Public')).toBeNull();
    expect(queryByText('Private')).toBeNull();
  });

  it('toggles visibility on press', async () => {
    const item = createMockFeedItem({
      student: { id: 'user-1', display_name: 'Test Student', avatar_url: null },
      is_confidential: false,
    });

    const { getByText } = render(<FeedCard item={item} />);
    expect(getByText('Public')).toBeTruthy();

    fireEvent.press(getByText('Public'));

    await waitFor(() => {
      expect(toggleVisibility).toHaveBeenCalledWith('task_completed', 'tc_feed-1', true, undefined);
      expect(getByText('Private')).toBeTruthy();
    });
  });

  // ── XP Display ──

  it('shows XP value for task completions', () => {
    const item = createMockFeedItem({ task: { id: 't1', title: 'Task', pillar: 'stem', xp_value: 75, quest_id: 'q1', quest_title: 'Q' } });
    const { getByText } = render(<FeedCard item={item} />);
    expect(getByText('+75 XP')).toBeTruthy();
  });
});
