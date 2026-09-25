/**
 * What the task creator and task editor must enforce for this learner.
 *
 * GET /api/tasks/authoring-rules answers against the LEARNER's school. That is
 * the point: in parent mode the signed-in user is the parent, so anything read
 * off the local user (useCanEditXp reads the parent's organization) answers
 * for the wrong school. Pass `studentId` in parent mode and the server resolves
 * the child; pass `taskId` to also learn whether that task's Definition of Done
 * is locked because it was sent for credit.
 *
 * The server enforces every one of these rules on write. This hook only keeps
 * the form from offering something the server will refuse.
 */

import { useEffect, useState } from 'react';
import api from '@/src/services/api';
import { useCanEditXp } from '@/src/hooks/useCanEditXp';

export interface TaskAuthoringRules {
  requiresSuccessCriteria: boolean;
  canEditXp: boolean;
  criteriaLocked: boolean;
  /** Only the diploma subject picker in the task creator: the learner is 13+
   *  or their school hides the pillars. The server derives the pillar. */
  hidePillars: boolean;
}

interface ServerRules {
  requires_success_criteria?: boolean;
  can_edit_xp?: boolean;
  criteria_locked?: boolean;
  hide_pillars?: boolean;
}

interface Options {
  studentId?: string | null;
  taskId?: string | null;
  /** Only fetch while the form that needs the answer is on screen. */
  enabled?: boolean;
}

export function useTaskAuthoringRules({ studentId = null, taskId = null, enabled = true }: Options = {}) {
  const localCanEditXp = useCanEditXp();
  // Keyed by the request it answers, so a sheet reopened on another task never
  // shows the previous task's lock while the new answer is in flight.
  const key = `${studentId || ''}|${taskId || ''}`;
  const [answer, setAnswer] = useState<{ key: string; data: ServerRules | null } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const params: Record<string, string> = {};
    if (studentId) params.student_id = studentId;
    if (taskId) params.task_id = taskId;
    api.get('/api/tasks/authoring-rules', { params })
      .then(({ data }) => { if (!cancelled) setAnswer({ key, data: data || {} }); })
      // A backend without the endpoint, or a network blip: fall back below.
      // The server still refuses a write that breaks its rules.
      .catch(() => { if (!cancelled) setAnswer({ key, data: null }); });
    return () => { cancelled = true; };
  }, [enabled, key, studentId, taskId]);

  const server = answer?.key === key ? answer.data : null;
  const loading = enabled && answer?.key !== key;

  // Until the server answers, the local answer is only trustworthy for the
  // signed-in learner. A parent's own org says nothing about the child's, so
  // parent mode hides the XP control rather than guess.
  const fallbackCanEditXp = studentId ? false : localCanEditXp;

  const rules: TaskAuthoringRules = {
    requiresSuccessCriteria: Boolean(server?.requires_success_criteria),
    canEditXp: typeof server?.can_edit_xp === 'boolean' ? server.can_edit_xp : fallbackCanEditXp,
    criteriaLocked: Boolean(server?.criteria_locked),
    hidePillars: Boolean(server?.hide_pillars),
  };

  return { rules, loading };
}

export default useTaskAuthoringRules;
