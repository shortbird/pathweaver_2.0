/**
 * useFeed hook tests - role-based feed routing, views, comment actions.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

import { renderHook, waitFor } from '@testing-library/react-native';
import { useFeed, recordViews, getViewers, postComment } from '../useFeed';
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
    // Mock the recordViews call that happens after fetching
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

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
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

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

describe('useFeed — P5 recordViews dedupe', () => {
  it('does not re-record ids already sent in a previous fetch', async () => {
    setAuthAsStudent();
    const itemA = createMockFeedItem({ id: 'tc_1', type: 'task_completed' });
    const itemB = createMockFeedItem({ id: 'tc_2', type: 'task_completed' });
    // First fetch returns A + B.
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { items: [itemA, itemB], has_more: false, next_cursor: null },
    });
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true } });

    const { result } = renderHook(() => useFeed());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Exactly one recordViews POST for both ids.
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/api/observers/feed/record-views', {
      items: [
        { type: 'task_completed', id: 'tc_1' },
        { type: 'task_completed', id: 'tc_2' },
      ],
    });

    // Second fetch returns the same pair + a new one.
    const itemC = createMockFeedItem({ id: 'tc_3', type: 'task_completed' });
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { items: [itemA, itemB, itemC], has_more: false, next_cursor: null },
    });

    await result.current.refetch();
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Only itemC is sent on the second call — A and B are deduped.
    expect(api.post).toHaveBeenCalledTimes(2);
    expect((api.post as jest.Mock).mock.calls[1][1]).toEqual({
      items: [{ type: 'task_completed', id: 'tc_3' }],
    });
  });
});

describe('recordViews', () => {
  it('POST to correct endpoint', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { success: true, recorded: 1 } });

    await recordViews([{ type: 'task_completed', id: 'tc_123' }]);

    expect(api.post).toHaveBeenCalledWith('/api/observers/feed/record-views', {
      items: [{ type: 'task_completed', id: 'tc_123' }],
    });
  });
});

describe('getViewers', () => {
  it('GET correct endpoint for task_completed', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { viewers: [], total: 0 } });

    await getViewers('task_completed', 'tc_123');

    expect(api.get).toHaveBeenCalledWith('/api/observers/views/completion/123');
  });

  it('GET correct endpoint for learning_moment', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { viewers: [], total: 0 } });

    await getViewers('learning_moment', 'le_456');

    expect(api.get).toHaveBeenCalledWith('/api/observers/views/learning_event/456');
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
