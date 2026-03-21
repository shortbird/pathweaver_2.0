/**
 * Dashboard data hooks - fetches quest, engagement, and user data.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

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
  enrolled_courses: any[];
  recent_completed_quests: any[];
  stats: {
    total_xp: number;
    completed_quests_count: number;
    completed_tasks_count: number;
    level: any;
  };
}

export function useDashboard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const { data: result } = await api.get('/api/users/dashboard');
      setData(result);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useGlobalEngagement() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [data, setData] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const { data: result } = await api.get('/api/users/me/engagement');
        setData(result.engagement || result);
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated]);

  return { data, loading };
}

export function useQuestEngagement(questId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [data, setData] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !questId) { setLoading(false); return; }
    (async () => {
      try {
        const { data: result } = await api.get(`/api/quests/${questId}/engagement`);
        setData(result.engagement || result);
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, questId]);

  return { data, loading };
}
