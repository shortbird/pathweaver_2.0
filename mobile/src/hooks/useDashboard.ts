/**
 * Dashboard data hooks - fetches quest, engagement, and user data.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useRefetchOnForeground } from './useRefetchOnForeground';

export interface EngagementDay {
  date: string;
  activity_count: number;
  intensity: number;
  activities: string[];
}

export interface RhythmState {
  state: string;
  state_display: string;
  message: string;
  pattern_description: string;
}

export interface EngagementData {
  calendar: {
    first_activity_date: string;
    weeks_active: number;
    days: EngagementDay[];
  };
  rhythm: RhythmState;
  summary: {
    active_days_last_week: number;
    active_days_last_month: number;
    last_activity_date: string;
    total_activities: number;
  };
}

export interface DashboardData {
  active_quests: any[];
  /** Quests assigned via org classes that the student hasn't started yet.
   *  Shape: { class_id, class_name, due_date, quest: {...} } */
  assigned_class_quests?: any[];
  enrolled_courses: any[];
  recent_completed_quests: any[];
  stats: {
    total_xp: number;
    completed_quests_count: number;
    completed_tasks_count: number;
    level: any;
  };
}

/**
 * Did a delegated read come back as the CHILD's rows?
 *
 * A parent's scoped read carries `?student_id=`, and the backend's
 * @student_scope answers with the child's payload plus a `scope` marker
 * naming the student. An app that ships before the backend it talks to (a
 * preview OTA against a stale dev backend) would get the PARENT's rows from a
 * backend that ignored the parameter, with nothing in the shape to say so.
 * So a scoped read is trusted only when the marker names the child asked for.
 */
export function scopedTo(payload: unknown, studentId: string | null | undefined): boolean {
  if (!studentId) return true;
  const scope = (payload as { scope?: { delegated?: boolean; student_id?: string } } | null)?.scope;
  return scope?.delegated === true && scope?.student_id === studentId;
}

/**
 * @param studentId Family scope: read this child's dashboard from the same
 *  route the child uses. `unsupported` is true when the backend ignored the
 *  scope (see scopedTo); the screen then shows nothing rather than the
 *  parent's own rows under the child's name.
 */
export function useDashboard(studentId?: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const { data: result } = await api.get('/api/users/dashboard', {
        params: studentId ? { student_id: studentId } : undefined,
      });
      if (!scopedTo(result, studentId)) {
        setUnsupported(true);
        setData(null);
      } else {
        setUnsupported(false);
        setData(result);
      }
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, studentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useRefetchOnForeground(fetchData);

  return { data, loading, error, unsupported, refetch: fetchData };
}

/**
 * @param studentId Family scope: the child's rhythm across all quests. Read
 *  from the child's own route; against a backend that ignores the scope, fall
 *  back to the parent-shaped endpoint, which answers the same shape. (That
 *  fallback was its own hook, useChildEngagement, until 2026-09-15.)
 */
export function useGlobalEngagement(studentId?: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [data, setData] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    (async () => {
      try {
        // 30s timeout: non-critical widget, cold-start tolerant (see note on
        // useQuestEngagement). Failure stays silent via the catch below.
        let { data: result } = await api.get('/api/users/me/engagement', {
          timeout: 30000,
          params: studentId ? { student_id: studentId } : undefined,
        });
        if (!scopedTo(result, studentId)) {
          ({ data: result } = await api.get(`/api/parent/${studentId}/engagement`, { timeout: 30000 }));
        }
        setData(result.engagement || result);
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, studentId]);

  return { data, loading };
}

/** @param studentId Parent mode: read this child's rhythm on the quest, not the
 *  caller's. The endpoint takes `?student_id=` for verified guardians. */
export function useQuestEngagement(questId: string | null, studentId?: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [data, setData] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !questId) { setLoading(false); return; }
    (async () => {
      try {
        // Longer timeout than the 15s global default: engagement is a
        // non-critical dashboard widget and is the first call to hit a cold
        // Render backend, which can take >15s to wake (the "timeout of 15000ms
        // exceeded" reports). 30s lets it load after a cold start instead of
        // erroring; the catch below keeps any failure silent regardless.
        const { data: result } = await api.get(`/api/quests/${questId}/engagement`, {
          timeout: 30000,
          params: studentId ? { student_id: studentId } : undefined,
        });
        setData(result.engagement || result);
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, questId, studentId]);

  return { data, loading };
}
