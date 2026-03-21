/**
 * Parent hooks - fetch children, dashboard data, engagement.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { EngagementData } from './useDashboard';

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
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const { data } = await api.get('/api/dependents/my-dependents');
        const deps = data.dependents || data || [];
        setChildren(deps);
      } catch {
        setChildren([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated]);

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
