/**
 * useFeed hook tests - role-based feed routing, like/comment actions.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

import { renderHook, waitFor } from '@testing-library/react-native';
import { useFeed, toggleLike, postComment } from '../useFeed';
import api from '@/src/services/api';
import {
  setAuthAsStudent, setAuthAsParent, setAuthAsObserver, clearAuthState,
} from '@/src/__tests__/utils/authStoreHelper';
import { createMockFeedItem } from '@/src/__tests__/utils/mockFactories';

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  clearAuthState();
});

describe('useFeed', () => {
  it('parent role: fetches from /api/observers/feed', async () => {
    setAuthAsParent();
    const items = [createMockFeedItem()];
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { items, has_more: false, next_cursor: null },
    });

    const { result } = renderHook(() => useFeed());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith('/api/observers/feed', { params: {} });
    expect(result.current.items).toHaveLength(1);
  });

  it('student role: fetches from /api/observers/feed', async () => {
    setAuthAsStudent();
    const items = [createMockFeedItem()];
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { items, has_more: false, next_cursor: null },
    });

    const { result } = renderHook(() => useFeed());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith(
      '/api/observers/feed',
      { params: {} }
    );
  });

  it('observer role: fetches from /api/observers/feed', async () => {
    setAuthAsObserver();
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { items: [], has_more: false },
    });

    const { result } = renderHook(() => useFeed());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith('/api/observers/feed', { params: {} });
  });
});

describe('toggleLike', () => {
  it('POST to correct endpoint for task_completed', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { liked: true } });

    await toggleLike('task_completed', 'tc_123');

    expect(api.post).toHaveBeenCalledWith('/api/observers/completions/123/like', {});
  });

  it('POST to correct endpoint for learning_moment', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { liked: true } });

    await toggleLike('learning_moment', 'le_456');

    expect(api.post).toHaveBeenCalledWith('/api/observers/learning-events/456/like', {});
  });
});

describe('postComment', () => {
  it('POST /api/observers/comments with correct payload', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { comment: { id: 'c1' } } });

    await postComment('completion-123', null, 'Great work!');

    expect(api.post).toHaveBeenCalledWith('/api/observers/comments', {
      completion_id: 'completion-123',
      learning_event_id: null,
      comment_text: 'Great work!',
    });
  });
});
