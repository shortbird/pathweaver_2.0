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

export interface Achievement {
  id: string;
  quest_id: string;
  title: string;
  completed_at: string;
  image_url?: string;
}

export interface SubjectXP {
  school_subject: string;
  xp_amount: number;
  pending_xp: number;
}

export function useProfile() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const [pillarXP, setPillarXP] = useState<PillarXP[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [subjectXP, setSubjectXP] = useState<SubjectXP[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const [dashRes, achieveRes, subjectRes] = await Promise.allSettled([
        api.get('/api/users/dashboard'),
        api.get('/api/quests/completed'),
        api.get('/api/users/subject-xp'),
      ]);

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
        setAchievements(a.achievements || a.quests || a || []);
      }

      if (subjectRes.status === 'fulfilled') {
        const s = subjectRes.value.data;
        setSubjectXP(s.subjects || s.subject_xp || s || []);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  return { user, pillarXP, achievements, subjectXP, loading, refetch: fetchProfile };
}
