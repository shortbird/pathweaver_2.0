/**
 * Advisor hooks - students, caseload, check-ins, student overview.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

export interface AdvisorStudent {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  total_xp: number;
  rhythm_state?: string;
  last_activity_date?: string;
  active_quests_count?: number;
}

export interface CaseloadSummary {
  total_students: number;
  rhythm_counts: Record<string, number>;
  per_student_rhythm: Record<string, { state: string; last_activity: string }>;
}

export function useAdvisorStudents() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [students, setStudents] = useState<AdvisorStudent[]>([]);
  const [caseload, setCaseload] = useState<CaseloadSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const [studentsRes, caseloadRes] = await Promise.allSettled([
        api.get('/api/advisor/students'),
        api.get('/api/advisor/caseload-summary'),
      ]);
      if (studentsRes.status === 'fulfilled') {
        setStudents(studentsRes.value.data.students || studentsRes.value.data || []);
      }
      if (caseloadRes.status === 'fulfilled') {
        setCaseload(caseloadRes.value.data);
      }
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { students, caseload, loading, refetch: fetchData };
}

export function useStudentOverview(studentId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    if (!isAuthenticated || !studentId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await api.get(`/api/advisor/student-overview/${studentId}`);
      setOverview(data);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, studentId]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  return { overview, loading, refetch: fetchOverview };
}

export function useStudentCheckins(studentId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !studentId) { setLoading(false); return; }
    (async () => {
      try {
        const { data } = await api.get(`/api/advisor/students/${studentId}/checkins`);
        setCheckins(data.checkins || data || []);
      } catch {
        // Error
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, studentId]);

  return { checkins, loading };
}

export async function createCheckin(data: {
  student_id: string;
  checkin_date: string;
  quest_notes?: Record<string, string>;
  reading_notes?: string;
  writing_notes?: string;
  math_notes?: string;
  additional_notes?: string;
}) {
  const res = await api.post('/api/advisor/checkins', data);
  return res.data;
}

export async function inviteToQuest(studentIds: string[], questId: string) {
  const res = await api.post('/api/advisor/invite-to-quest', { student_ids: studentIds, quest_id: questId });
  return res.data;
}

export async function enrollInCourse(studentIds: string[], courseId: string) {
  const res = await api.post('/api/advisor/enroll-in-course', { student_ids: studentIds, course_id: courseId });
  return res.data;
}
