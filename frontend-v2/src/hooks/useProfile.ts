/**
 * Profile hooks - user profile, XP breakdown, achievements, subject XP.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

export interface PillarXP {
  pillar: string;
  xp: number;
  questCount?: number;
}

export interface EvidenceBlock {
  block_type: string;
  content: any;
  order_index?: number;
}

export interface TaskEvidence {
  evidence_type: string;
  evidence_blocks?: EvidenceBlock[];
  evidence_content?: string;
  evidence_text?: string;
  evidence_url?: string;
  xp_awarded: number;
  completed_at: string;
  pillar: string;
  is_collaborative?: boolean;
}

export interface AchievementQuest {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  header_image_url?: string;
}

export interface Achievement {
  quest: AchievementQuest;
  completed_at?: string;
  started_at?: string;
  task_evidence: Record<string, TaskEvidence>;
  total_xp_earned: number;
  status: 'completed' | 'in_progress';
  course?: { course_id: string; course_title: string } | null;
  progress?: {
    completed_tasks: number;
    total_tasks: number;
    percentage: number;
  };
}

export interface SubjectXP {
  school_subject: string;
  xp_amount: number;
  pending_xp: number;
}

export interface Viewer {
  type: 'platform' | 'parent' | 'advisor' | 'observer';
  name: string;
  detail: string;
  removable: boolean;
  link_id?: string;
}

export interface DeletionStatus {
  deletion_status: 'none' | 'pending';
  deletion_requested_at?: string;
  deletion_scheduled_for?: string;
  days_remaining?: number;
}

export function useProfile() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const [pillarXP, setPillarXP] = useState<PillarXP[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [subjectXP, setSubjectXP] = useState<SubjectXP[]>([]);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [deletionStatus, setDeletionStatus] = useState<DeletionStatus>({ deletion_status: 'none' });
  const [loading, setLoading] = useState(true);

  const isStudent = user?.role === 'student' || (user as any)?.org_role === 'student';

  const fetchProfile = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const requests: Promise<any>[] = [
        api.get('/api/users/dashboard'),
        api.get('/api/quests/completed'),
        api.get('/api/users/subject-xp'),
        api.get('/api/users/deletion-status'),
      ];
      if (isStudent) {
        requests.push(api.get('/api/observers/my-observers'));
      }

      const results = await Promise.allSettled(requests);
      const [dashRes, achieveRes, subjectRes, deletionRes, observerRes] = results;

      if (dashRes.status === 'fulfilled') {
        const d = dashRes.value.data;
        const xpByCategory = d.xp_by_category || {};
        setPillarXP(
          Object.entries(xpByCategory).map(([pillar, xp]) => ({
            pillar,
            xp: xp as number,
          }))
        );
      }

      if (achieveRes.status === 'fulfilled') {
        const a = achieveRes.value.data;
        setAchievements(a.achievements || []);
      }

      if (subjectRes.status === 'fulfilled') {
        const s = subjectRes.value.data;
        setSubjectXP(s.subjects || s.subject_xp || s || []);
      }

      if (deletionRes.status === 'fulfilled') {
        setDeletionStatus(deletionRes.value.data);
      }

      if (observerRes && observerRes.status === 'fulfilled') {
        setViewers(observerRes.value.data.viewers || []);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isStudent]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  return { user, pillarXP, achievements, subjectXP, viewers, deletionStatus, loading, refetch: fetchProfile };
}
