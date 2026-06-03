/**
 * Parent hooks - fetch children, dashboard data, engagement.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { usePreviewRoleStore } from '../stores/previewRoleStore';
import { useAddKidStore } from '../stores/addKidStore';
import type { EngagementData } from './useDashboard';
import type { LearningEvent, UnifiedTopic } from './useJournal';

export interface Child {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  total_xp: number;
  is_dependent: boolean;
  date_of_birth: string | null;
  role: string;
}

export interface ParentDashboardData {
  student: Child;
  active_quests: any[];
  completed_quests: any[];
  stats: {
    total_xp: number;
    completed_quests_count: number;
    active_quests_count: number;
    completed_tasks_count: number;
  };
  recent_activity: any[];
}

export function useMyChildren() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // Key on user id so masquerade swaps (superadmin → demo parent → back)
  // trigger a refetch; otherwise the list stays frozen to whichever account
  // was active on mount.
  const userId = useAuthStore((s) => s.user?.id);
  const user = useAuthStore((s) => s.user);
  const previewRole = usePreviewRoleStore((s) => s.previewRole);
  // Bumped when a kid is created (AddKidSheet) so the list refetches immediately.
  const childrenVersion = useAddKidStore((s) => s.version);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  // Resolve effective role the same way the rest of the app does (org_managed
  // users use org_role; superadmin previewing-as honors the preview).
  const effectiveRole = (() => {
    if (user?.role === 'superadmin' && previewRole) return previewRole;
    if (user?.org_role && user?.role === 'org_managed') return user.org_role;
    return user?.role;
  })();

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setLoading(true);
    // Source-of-truth per role, so a superadmin/advisor's advisee list
    // doesn't leak into parent surfaces (CaptureSheet, Family tab, bounty
    // creation, Manage Observers). The `/api/observers/my-students` endpoint
    // bundles parent + observer + advisor links into one response, so we
    // can't union it blindly — we'd pick up advisor assignments as "kids."
    //
    // - Observer:  observer_student_links via /api/observers/my-students.
    //              (For pure observers, that endpoint returns only observer
    //              links + dependents — no advisor noise.)
    // - Everyone else (parent, advisor-who-is-also-a-parent, superadmin):
    //              dependents + parent_student_links via my-dependents.
    (async () => {
      const merged: Child[] = [];
      const seen = new Set<string>();

      if (effectiveRole === 'observer') {
        try {
          const { data } = await api.get('/api/observers/my-students');
          for (const link of (data?.students || [])) {
            const kidId = link.student_id || link.id;
            const info = link.student || {};
            if (kidId && !seen.has(kidId)) {
              merged.push({
                id: kidId,
                display_name: info.display_name
                  || `${info.first_name || ''} ${info.last_name || ''}`.trim()
                  || 'Student',
                first_name: info.first_name || '',
                last_name: info.last_name || '',
                avatar_url: info.avatar_url || null,
                total_xp: info.total_xp || 0,
                is_dependent: false,
                date_of_birth: info.date_of_birth || null,
                role: info.role || 'student',
              });
              seen.add(kidId);
            }
          }
        } catch {
          // No observer links — leave empty.
        }
      } else {
        try {
          const { data } = await api.get('/api/dependents/my-dependents');
          for (const kid of (data.dependents || data || [])) {
            if (kid?.id && !seen.has(kid.id)) {
              merged.push(kid);
              seen.add(kid.id);
            }
          }
        } catch {
          // Not a parent / no dependents — empty list is the correct state.
        }
      }

      if (!cancelled) {
        setChildren(merged);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, userId, effectiveRole, childrenVersion]);

  return { children, loading };
}

export function useChildDashboard(studentId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [data, setData] = useState<ParentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!isAuthenticated || !studentId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data: result } = await api.get(`/api/parent/dashboard/${studentId}`);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, studentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, refetch: fetchData };
}

/**
 * Full read-only overview for one child (parent scope): profile, pillar XP,
 * engagement, portfolio. Mirrors the advisor `useStudentOverview` hook against
 * the parent-scoped /api/parent/child-overview endpoint so the kid profile
 * screen can reuse the same rendering.
 */
export function useChildOverview(studentId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    if (!isAuthenticated || !studentId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await api.get(`/api/parent/child-overview/${studentId}`);
      setOverview(data);
    } catch {
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, studentId]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  return { overview, loading, refetch: fetchOverview };
}

export function useChildEngagement(studentId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [data, setData] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !studentId) { setLoading(false); return; }
    (async () => {
      try {
        const { data: result } = await api.get(`/api/parent/${studentId}/engagement`);
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

/**
 * useChildJournal - a parent's view of one child's learning journal: every
 * moment (self- and parent-captured) plus the child's topics, fetched through
 * the parent-scoped endpoints. Editing/deleting is permission-gated by the
 * backend to moments the parent captured; the screen decides per-moment.
 */
export function useChildJournal(studentId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [moments, setMoments] = useState<LearningEvent[]>([]);
  const [topics, setTopics] = useState<UnifiedTopic[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJournal = useCallback(async () => {
    if (!isAuthenticated || !studentId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [momentsRes, topicsRes] = await Promise.all([
        api.get(`/api/parent/children/${studentId}/learning-moments`, { params: { limit: 100 } }),
        api.get(`/api/parent/children/${studentId}/topics`),
      ]);
      setMoments(momentsRes.data?.moments || []);
      const t = topicsRes.data || {};
      setTopics([
        ...(t.topics || []),
        ...(t.course_topics || []).map((c: any) => ({ ...c, type: 'course' })),
      ]);
    } catch {
      setMoments([]);
      setTopics([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, studentId]);

  useEffect(() => { fetchJournal(); }, [fetchJournal]);

  return { moments, topics, loading, refetch: fetchJournal };
}
