/**
 * Unified Feed hook - fetches feed items based on user role.
 *
 * Students see their own activity (scope=personal).
 * Parents/advisors/observers see linked students (scope=students).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

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
  type: 'image' | 'video';
  preview: string;
  url?: string;
  title?: string;
}

export interface FeedItem {
  type: 'task_completed' | 'learning_moment';
  id: string;
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
  likes_count: number;
  comments_count: number;
  user_has_liked: boolean;
  is_confidential: boolean;
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

  // Determine if user should see the aggregated observer feed
  // Check role, org_role, AND backend flags for superadmin/parent with dependents
  const canSeeStudents = user?.role === 'parent' || user?.role === 'advisor' ||
    user?.role === 'observer' || user?.role === 'superadmin' ||
    user?.org_role === 'parent' || user?.org_role === 'advisor' ||
    user?.org_role === 'observer' || user?.org_role === 'org_admin' ||
    (user as any)?.has_dependents || (user as any)?.has_linked_students ||
    (user as any)?.has_advisor_assignments;

  const fetchFeed = useCallback(async (cursor?: string) => {
    if (!isAuthenticated) return;

    const isLoadMore = !!cursor;
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      // Route to appropriate endpoint based on role
      let endpoint: string;
      const params: Record<string, string> = {};

      if (options.studentId) {
        // Viewing specific student's activity
        endpoint = `/api/observers/student/${options.studentId}/activity`;
      } else if (canSeeStudents) {
        // Parent/advisor/observer/superadmin sees linked students
        endpoint = '/api/observers/feed';
      } else {
        // Student sees own activity
        endpoint = `/api/observers/student/${user?.id}/activity`;
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
    } catch (err: any) {
      if (!isLoadMore) {
        setError(err.response?.data?.error?.message || 'Failed to load feed');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [isAuthenticated, user?.id, options.studentId, canSeeStudents, options.limit]);

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

  return { items, loading, loadingMore, hasMore, error, loadMore, refetch };
}

export async function toggleLike(type: 'task_completed' | 'learning_moment', id: string) {
  const cleanId = id.replace(/^(tc_|le_)/, '');
  const endpoint = type === 'task_completed'
    ? `/api/observers/completions/${cleanId}/like`
    : `/api/observers/learning-events/${cleanId}/like`;
  const { data } = await api.post(endpoint, {});
  return data;
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
