/**
 * Unified Feed hook - fetches feed items based on user role.
 *
 * Students see their own activity (scope=personal).
 * Parents/advisors/observers see linked students (scope=students).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { extractApiError } from '../services/apiError';
import { captureException } from '../services/sentry';

export interface FeedStudent {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface FeedEvidence {
  type: 'document_blocks' | 'link' | 'text' | 'image' | 'video';
  blocks?: Array<{ type: string; content?: string; url?: string; title?: string }>;
  url?: string;
  preview_text?: string;
  title?: string;
}

export interface FeedMedia {
  type: 'image' | 'video' | 'audio';
  preview?: string;
  url?: string;
  title?: string;
  duration_ms?: number;
}

export interface FeedItem {
  type: 'task_completed' | 'learning_moment';
  id: string;
  completion_id?: string;
  /** Set for task-attached evidence items that don't yet have a completion
   *  (e.g. helper-evidence blocks the parent added while the kid still
   *  hasn't marked the task done). Used as the canonical handle for
   *  block-scoped actions like privacy toggling. */
  block_id?: string;
  /** Set on learning_moment items so the toggle endpoint can address the
   *  underlying learning_events row directly. */
  learning_event_id?: string;
  timestamp: string;
  student: FeedStudent;
  task?: {
    id: string;
    title: string;
    pillar: string;
    xp_value: number;
    quest_id: string;
    quest_title: string;
  };
  moment?: {
    title: string;
    description: string;
    pillars: string[];
    topic_name?: string;
    source_type?: string;
  };
  evidence: FeedEvidence;
  media?: FeedMedia[];
  views_count: number;
  comments_count: number;
  is_confidential: boolean;
  /** Whether the current viewer is allowed to create a public share link for
   *  this post. Set by the backend feed endpoint. Undefined from older
   *  responses — treated as shareable to avoid hiding the button on version
   *  skew (see FeedCard). */
  can_share?: boolean;
}

interface UseFeedOptions {
  studentId?: string;
  limit?: number;
}

export function useFeed(options: UseFeedOptions = {}) {
  const { isAuthenticated, user } = useAuthStore();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  // P5: dedupe recordViews — each feed item's view should only be recorded once
  // per session. Without this, pagination + polling send the same ids repeatedly.
  const recordedViewsRef = useRef<Set<string>>(new Set());

  const fetchFeed = useCallback(async (cursor?: string) => {
    if (!isAuthenticated) return;

    const isLoadMore = !!cursor;
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      // Single unified feed endpoint for all roles and contexts.
      // /api/observers/feed returns task completions + learning moments,
      // scoped by permissions (own activity, dependents, linked students, etc.)
      const endpoint = '/api/observers/feed';
      const params: Record<string, string> = {};

      if (options.studentId) {
        params.student_id = options.studentId;
      }

      if (cursor) params.cursor = cursor;
      if (options.limit) params.limit = String(options.limit);

      const { data } = await api.get(endpoint, { params });

      const newItems = data.items || data.activities || [];
      const nextCursor = data.next_cursor || null;
      const more = data.has_more || false;

      if (isLoadMore) {
        setItems((prev) => [...prev, ...newItems]);
      } else {
        setItems(newItems);
      }

      cursorRef.current = nextCursor;
      setHasMore(more);
      setError(null);

      // Record views for loaded items, skipping ids we've already sent.
      if (newItems.length > 0) {
        const unseen = newItems.filter((i: FeedItem) => {
          const key = `${i.type}:${i.id}`;
          if (recordedViewsRef.current.has(key)) return false;
          recordedViewsRef.current.add(key);
          return true;
        });
        if (unseen.length > 0) {
          recordViews(unseen.map((i: FeedItem) => ({ type: i.type, id: i.id }))).catch((e: unknown) => {
            captureException(e, { where: 'useFeed.recordViews' });
          });
        }
      }
    } catch (err: unknown) {
      if (!isLoadMore) {
        const { message } = extractApiError(err, 'Failed to load feed');
        setError(message);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [isAuthenticated, user?.id, options.studentId, options.limit]);

  useEffect(() => {
    cursorRef.current = null;
    fetchFeed();
  }, [fetchFeed]);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && cursorRef.current) {
      fetchFeed(cursorRef.current);
    }
  }, [loadingMore, hasMore, fetchFeed]);

  const refetch = useCallback(() => {
    cursorRef.current = null;
    fetchFeed();
  }, [fetchFeed]);

  // Optimistically drop a learning-moment item (matched by its learning_event_id)
  // so a deleted moment also vanishes from the journal's "Recent activity" feed
  // immediately, not just from the moments list.
  const removeByLearningEventId = useCallback((learningEventId: string) => {
    setItems((prev) => prev.filter(
      (it) => it.learning_event_id !== learningEventId && it.id !== learningEventId,
    ));
  }, []);

  return { items, loading, loadingMore, hasMore, error, loadMore, refetch, removeByLearningEventId };
}

export async function recordViews(items: Array<{ type: string; id: string }>) {
  const { data } = await api.post('/api/observers/feed/record-views', { items });
  return data;
}

export async function getViewers(type: 'task_completed' | 'learning_moment', id: string) {
  const cleanId = id.replace(/^(tc_|le_)/, '');
  // Strip block suffix from composite IDs
  const dbId = cleanId.includes('_') ? cleanId.split('_')[0] : cleanId;
  const targetType = type === 'task_completed' ? 'completion' : 'learning_event';
  const { data } = await api.get(`/api/observers/views/${targetType}/${dbId}`);
  return data as { viewers: Array<{ id: string; display_name: string; avatar_url: string | null; viewed_at: string }>; total: number };
}

export async function postComment(
  completionId: string | null,
  learningEventId: string | null,
  text: string,
) {
  const { data } = await api.post('/api/observers/comments', {
    completion_id: completionId,
    learning_event_id: learningEventId,
    comment_text: text,
  });
  return data;
}

export async function getComments(type: 'task_completed' | 'learning_moment', id: string) {
  const cleanId = id.replace(/^(tc_|le_)/, '');
  const endpoint = type === 'task_completed'
    ? `/api/observers/completions/${cleanId}/comments`
    : `/api/observers/learning-events/${cleanId}/comments`;
  const { data } = await api.get(endpoint);
  return data.comments || data || [];
}

export class NotShareableError extends Error {
  constructor() {
    super('NOT_SHAREABLE');
    this.name = 'NotShareableError';
  }
}

/**
 * Create a public share link for a feed item.
 *
 * Task-evidence feed items carry a composite `id` ("<docOrCompletionId>_<blockId>")
 * that is NOT a valid completion id, so we must address the underlying record via
 * the explicit `completionId`/`learningEventId` handles the feed provides — same
 * pattern as getViewers/toggleVisibility. Sending the composite id was the cause
 * of spurious "Failed to share" errors.
 */
export async function createShareLink(args: {
  type: 'task_completed' | 'learning_moment';
  completionId?: string | null;
  learningEventId?: string | null;
  /** Composite feed item id, used only as a fallback for clean (non-composite) ids. */
  id: string;
}) {
  let body: { completion_id: string } | { learning_event_id: string };

  if (args.type === 'task_completed') {
    // Prefer the explicit completion id. Fall back to the raw id only when it's
    // a clean (non-composite) value — a composite id has no shareable completion.
    let completionId = args.completionId || null;
    if (!completionId) {
      const cleanId = args.id.replace(/^tc_/, '');
      completionId = cleanId.includes('_') ? null : cleanId;
    }
    if (!completionId) throw new NotShareableError();
    body = { completion_id: completionId };
  } else {
    const learningEventId = args.learningEventId || args.id.replace(/^le_/, '');
    body = { learning_event_id: learningEventId };
  }

  const { data } = await api.post('/api/observers/feed/share', body);
  return data as { share_url: string; token: string };
}

export interface ToggleVisibilityArgs {
  type: 'task_completed' | 'learning_moment';
  /** The composite feed item id (e.g. "docId_blockId"). Used as a last
   *  resort when no canonical id was passed through. */
  id: string;
  hidden: boolean;
  /** Preferred handle for completed-task items (true `quest_task_completions.id`). */
  completionId?: string;
  /** Preferred handle for draft helper-evidence items — addresses the
   *  underlying `evidence_document_blocks` row so we toggle block.is_private,
   *  not a non-existent completion. */
  blockId?: string;
  /** Preferred handle for learning_moment items. */
  learningEventId?: string;
}

export async function toggleVisibility(
  typeOrArgs: 'task_completed' | 'learning_moment' | ToggleVisibilityArgs,
  id?: string,
  hidden?: boolean,
  completionId?: string,
) {
  // Back-compat: original positional signature was
  //   toggleVisibility(type, id, hidden, completionId)
  // The new signature takes a single args object. Both work.
  const args: ToggleVisibilityArgs = typeof typeOrArgs === 'string'
    ? { type: typeOrArgs, id: id!, hidden: hidden!, completionId }
    : typeOrArgs;

  // Pick the most specific handle the caller gave us. Order:
  //   block_id (draft evidence) > completion_id (real completion)
  //     > learning_event_id (moment) > composite id (fallback).
  let body: Record<string, unknown> = { hidden: args.hidden };
  if (args.blockId) {
    body.block_id = args.blockId;
  } else if (args.completionId) {
    body.completion_id = args.completionId;
  } else if (args.learningEventId) {
    body.learning_event_id = args.learningEventId;
  } else {
    // Last-ditch fallback parses the composite id. Strip optional source
    // prefix and any trailing block suffix to get a uuid.
    const cleanId = args.id.replace(/^(tc_|le_|bounty_)/, '');
    const dbId = cleanId.includes('_') ? cleanId.split('_')[0] : cleanId;
    body = args.type === 'task_completed'
      ? { completion_id: dbId, hidden: args.hidden }
      : { learning_event_id: dbId, hidden: args.hidden };
  }

  const { data } = await api.post('/api/observers/feed-item/toggle-visibility', body);
  return data as { status: string; hidden: boolean };
}
