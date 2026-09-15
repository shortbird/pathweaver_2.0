/**
 * A student's weekly XP goal (/api/xp-goals/student/:id).
 *
 * The API answers `{enabled: false}` for every org that has not opted in
 * and every platform student, and the caller renders nothing then; a 403 or
 * a transient failure is treated the same way, because a goal line is
 * decoration on somebody else's card and must not break the card it sits
 * on. `met`, `remaining_xp` and `percent` come from the server so the web
 * app, this app and any digest agree on what "met" means.
 */

import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';

export interface WeeklyXpGoal {
  enabled: boolean;
  target_xp: number | null;
  xp_earned: number;
  percent: number | null;
  met: boolean;
  remaining_xp: number | null;
  note: string | null;
  can_edit: boolean;
}

export const XP_GOAL_PRESETS = [250, 500, 750, 1000];

export function useWeeklyXpGoal(studentId: string | null | undefined) {
  const [goal, setGoal] = useState<WeeklyXpGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    if (!studentId) { setLoading(false); return; }
    try {
      const { data } = await api.get(`/api/xp-goals/student/${studentId}`);
      setGoal(data?.goal || null);
    } catch {
      setGoal(null);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { refetch(); }, [refetch]);

  /** Whole XP between 1 and 10,000; anything else is refused before the call. */
  const save = useCallback(async (target: number, note: string | null) => {
    if (!studentId) return;
    if (!Number.isInteger(target) || target < 1 || target > 10000) {
      throw new Error('Pick a whole number of XP between 1 and 10,000');
    }
    setSaving(true);
    try {
      const { data } = await api.put(`/api/xp-goals/student/${studentId}`, { target_xp: target, note });
      setGoal(data?.goal || null);
    } finally {
      setSaving(false);
    }
  }, [studentId]);

  const clear = useCallback(async () => {
    if (!studentId) return;
    setSaving(true);
    try {
      const { data } = await api.delete(`/api/xp-goals/student/${studentId}`);
      setGoal(data?.goal || null);
    } finally {
      setSaving(false);
    }
  }, [studentId]);

  return { goal, loading, saving, save, clear, refetch };
}
