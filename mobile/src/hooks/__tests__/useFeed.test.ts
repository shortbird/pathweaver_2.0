/**
 * useFeed hook tests - role-based feed routing, views, comment actions.
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import { useFeed, recordViews, getViewers, postComment, dedupeMerge, computeFeedKey, reconcileRefetch, type FeedItem } from '../useFeed';
import api from '@/src/services/api';
import {
  setAuthAsStudent, setAuthAsParent, setAuthAsObserver, clearAuthState,
} from '@/src/__tests__/utils/authStoreHelper';
import { createMockFeedItem } from '@/src/__tests__/utils/mockFactories';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

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

describe('dedupeMerge — identity preservation', () => {
  // Why this matters: this runs on the JS thread the moment onEndReached fires.
  // The old implementation re-derived the list from [...prev, ...newItems] and
  // cloned every item, so the work grew with scroll depth AND every mounted
  // card lost its memo and re-rendered. Both are what made the feed choppier
  // the longer you scrolled, so identity is the thing to assert.
  const item = (id: string) => createMockFeedItem({ id, type: 'task_completed' }) as any;

  it('keeps the exact object identity of items already in the list', () => {
    const prev = [item('tc_1'), item('tc_2')];
    const next = dedupeMerge(prev, [item('tc_3')]);

    expect(next).toHaveLength(3);
    expect(next[0]).toBe(prev[0]);
    expect(next[1]).toBe(prev[1]);
  });

  it('returns the previous array itself when the page adds nothing', () => {
    const prev = dedupeMerge([], [item('tc_1'), item('tc_2')]);
    // A duplicate page must not produce a new array — that makes setItems a no-op.
    expect(dedupeMerge(prev, [item('tc_1'), item('tc_2')])).toBe(prev);
    expect(dedupeMerge(prev, [])).toBe(prev);
  });

  it('collapses duplicates inside a single incoming page', () => {
    const next = dedupeMerge([], [item('tc_1'), item('tc_1'), item('tc_2')]);
    expect(next.map((i) => i.id)).toEqual(['tc_1', 'tc_2']);
  });

  it('seeds students on first insert', () => {
    const next = dedupeMerge([], [item('tc_1')]);
    expect(next[0].students).toHaveLength(1);
    expect(next[0].students![0].id).toBe(item('tc_1').student.id);
  });

  it('replaces only the merged index when a new kid is tagged, never mutating', () => {
    const moment = (studentId: string, name: string) =>
      createMockFeedItem({
        type: 'learning_moment',
        id: `le_${studentId}`,
        timestamp: '2026-06-17T08:06:32Z',
        student: { id: studentId, display_name: name, avatar_url: null },
        moment: {
          title: 'Phase change',
          description: 'Talked about gas storage in tanks',
          pillars: [],
          posted_by: { id: 'parent-tyler', display_name: 'Tyler', avatar_url: null },
        },
        evidence: { type: 'image', url: 'https://example.com/img.jpg' },
      }) as any;

    const prev = dedupeMerge([], [item('tc_1'), moment('kid-marcus', 'Marcus')]);
    const before = prev[1];
    const next = dedupeMerge(prev, [moment('kid-james', 'James')]);

    // Same card, now listing both kids...
    expect(next).toHaveLength(2);
    expect(next[1].students!.map((s: any) => s.id).sort()).toEqual(['kid-james', 'kid-marcus']);
    // ...as a NEW object (mounted cards hold the old reference)...
    expect(next[1]).not.toBe(before);
    expect(before.students).toHaveLength(1);
    // ...and the untouched neighbour keeps its identity.
    expect(next[0]).toBe(prev[0]);
  });
});

describe('reconcileRefetch — ticket 2c34704a', () => {
  // "Reopening the app after it had been running in background for a while
  // made the feed very choppy." The foreground refetch rebuilt every item, so
  // every mounted card re-rendered. Unchanged items must keep their identity.
  const mk = (id: string, extra: Partial<FeedItem> = {}): FeedItem =>
    ({
      type: 'task_completed',
      id,
      timestamp: '2026-10-01T00:00:00Z',
      student: { id: 's1', display_name: 'S', avatar_url: null },
      views_count: 1,
      comments_count: 0,
      is_confidential: false,
      reactions: { by_key: { proud: 1 }, mine: null },
      ...extra,
    }) as FeedItem;
  // A fresh JSON copy, as the network would hand back.
  const wire = (it: FeedItem) => JSON.parse(JSON.stringify(it)) as FeedItem;

  it('"made the feed very choppy": unchanged items keep their object identity, changed ones are replaced', () => {
    const prev = dedupeMerge([], [mk('a'), mk('b'), mk('c')]);
    const fresh = [wire(prev[0]), { ...wire(prev[1]), comments_count: 4 }, wire(prev[2])];
    const { items } = reconcileRefetch(prev, fresh);
    expect(items[0]).toBe(prev[0]);
    expect(items[1]).not.toBe(prev[1]);
    expect(items[1].comments_count).toBe(4);
    expect(items[2]).toBe(prev[2]);
  });

  it('returns the previous array itself when nothing changed', () => {
    const prev = dedupeMerge([], [mk('a'), mk('b')]);
    const { items } = reconcileRefetch(prev, prev.map(wire));
    expect(items).toBe(prev);
  });

  it('puts new items on top and keeps the older pages already loaded below', () => {
    const prev = dedupeMerge([], [mk('a'), mk('b'), mk('c'), mk('d')]);
    const { items, keptTail } = reconcileRefetch(prev, [mk('new'), wire(prev[0]), wire(prev[1])]);
    expect(items.map((i) => i.id)).toEqual(['new', 'a', 'b', 'c', 'd']);
    expect(items[1]).toBe(prev[0]);
    expect(items[3]).toBe(prev[2]);
    expect(keptTail).toBe(true);
  });

  it('replaces the list when the fresh page shares nothing with it', () => {
    const prev = dedupeMerge([], [mk('a'), mk('b')]);
    const { items, keptTail } = reconcileRefetch(prev, [mk('x'), mk('y')]);
    expect(items.map((i) => i.id)).toEqual(['x', 'y']);
    expect(keptTail).toBe(false);
  });
});

describe('useFeed refetch — ticket 2c34704a', () => {
  it('"Reopening the app after it had been running in background for a while made the feed very choppy": a foreground refetch keeps unchanged items and the loaded pages', async () => {
    setAuthAsStudent();
    const a = createMockFeedItem({ id: 'tc_a' });
    const b = createMockFeedItem({ id: 'tc_b' });
    const c = createMockFeedItem({ id: 'tc_c' });
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true } });
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { items: [a, b], has_more: true, next_cursor: 'cursor-page-2' },
    });

    const { result } = renderHook(() => useFeed());
    await waitFor(() => expect(result.current.loading).toBe(false));

    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { items: [c], has_more: false, next_cursor: null },
    });
    result.current.loadMore();
    await waitFor(() => expect(result.current.items).toHaveLength(3));
    const before = result.current.items;

    // Same page 1 again, as fresh JSON objects from the network.
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { items: JSON.parse(JSON.stringify([a, b])), has_more: true, next_cursor: 'cursor-page-2' },
    });
    result.current.refetch();
    await waitFor(() => expect((api.get as jest.Mock).mock.calls.length).toBe(3));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toHaveLength(3);
    result.current.items.forEach((it, i) => expect(it).toBe(before[i]));
  });
});

describe('computeFeedKey', () => {
  it('buckets sibling moments captured seconds apart into one key', () => {
    const sib = (id: string, ts: string) =>
      createMockFeedItem({
        type: 'learning_moment',
        id,
        timestamp: ts,
        moment: {
          title: 'Phase change', description: 'd', pillars: [],
          posted_by: { id: 'parent-tyler', display_name: 'Tyler', avatar_url: null },
        },
      }) as any;

    // Straddling a minute boundary inside the same 5-minute bucket.
    expect(computeFeedKey(sib('le_a', '2026-06-17T08:05:59Z')))
      .toBe(computeFeedKey(sib('le_b', '2026-06-17T08:06:02Z')));
    // A capture well outside the bucket stays its own card.
    expect(computeFeedKey(sib('le_a', '2026-06-17T08:05:59Z')))
      .not.toBe(computeFeedKey(sib('le_c', '2026-06-17T09:30:00Z')));
  });

  it('keys task completions by type and id', () => {
    expect(computeFeedKey(createMockFeedItem({ id: 'tc_9', type: 'task_completed' }) as any))
      .toBe('task_completed:tc_9');
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
