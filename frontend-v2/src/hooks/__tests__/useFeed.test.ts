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

describe('useFeed — multi-kid moment grouping survives loadMore', () => {
  // A parent captured one moment for two kids -> two sibling learning_moment
  // events that dedupe into a single card listing both. Regression: a later
  // loadMore re-ran dedupe over [...prev, ...newPage]; the already-merged card
  // got its `students` reset to just the primary kid because the sibling raw
  // event wasn't in the new page to re-accumulate. The card then showed only
  // the primary kid (visible on Android, where FlatList remounts the cell).
  const sibling = (id: string, studentId: string, name: string) =>
    createMockFeedItem({
      type: 'learning_moment',
      id,
      learning_event_id: id.replace('le_', ''),
      // Same 5-minute bucket + same capturer/title/description -> one group.
      timestamp: '2026-06-17T08:06:32Z',
      student: { id: studentId, display_name: name, avatar_url: null },
      moment: {
        title: 'Phase change',
        description: 'Talked about gas storage in tanks',
        pillars: [],
        posted_by: { id: 'parent-tyler', display_name: 'Tyler', avatar_url: null },
      },
      evidence: { type: 'image', url: 'https://example.com/img.jpg' },
    } as any);

  it('keeps every tagged kid after paginating to an older page', async () => {
    setAuthAsParent();
    const marcus = sibling('le_marcus', 'kid-marcus', 'Marcus');
    const james = sibling('le_james', 'kid-james', 'James');

    // Page 1: both sibling events -> one combined card.
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { items: [marcus, james], has_more: true, next_cursor: '2026-06-17T08:06:32Z' },
    });
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true } });

    const { result } = renderHook(() => useFeed());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].students).toHaveLength(2);

    // Page 2: an older, unrelated item (no sibling to re-accumulate from).
    const older = createMockFeedItem({ id: 'tc_old', type: 'task_completed' });
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { items: [older], has_more: false, next_cursor: null },
    });

    result.current.loadMore();
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    // The combined card must still list BOTH kids.
    const combined = result.current.items.find((i) => i.id === 'le_marcus')!;
    expect(combined.students).toHaveLength(2);
    expect((combined.students || []).map((s) => s.id).sort()).toEqual(['kid-james', 'kid-marcus']);
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

    await postComment({ studentId: 'student-1', completionId: 'completion-123', text: 'Great work!' });

    expect(api.post).toHaveBeenCalledWith('/api/observers/comments', {
      student_id: 'student-1',
      task_completion_id: 'completion-123',
      learning_event_id: null,
      comment_text: 'Great work!',
    });
  });
});
