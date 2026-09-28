/**
 * Diploma credit for one completed task: its status, and the request.
 *
 * The web has had "Request Credit" on a finished task since the credit
 * dashboard shipped (web/src/components/quest/TaskWorkspace.jsx); the app could
 * only show a request in the Diploma Credit Tracker, never make one. This is
 * the web's flow against the same three endpoints in
 * backend/routes/tasks/credit.py:
 *
 *   GET  /api/tasks/<id>/credit-status    where the task stands
 *   POST /api/tasks/<id>/credit-precheck  the reviewer's AI, as a preview
 *   POST /api/tasks/<id>/request-credit   the request itself (or a resubmit)
 *
 * All three are @student_scope, so a parent passes `student_id` and the request
 * is filed as the child's, exactly as completing a task on their behalf is.
 *
 * The precheck always runs first. The web decides from the viewer's own AI flag
 * whether to skip it; the app has no copy of that flag, and does not need one:
 * the server answers `ai_disabled` for a student with AI off, and that answer
 * submits straight away, which is what the web's skip does.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/src/services/api';
import { extractApiError } from '@/src/services/apiError';
import { scopedTo } from '@/src/hooks/useDashboard';
import { effectiveRoleOf } from '@/src/utils/effectiveRole';

export type DiplomaStatus =
  | 'none' | 'pending_review' | 'pending_org_approval' | 'grow_this' | 'finalized';

/** The precheck endpoint's data (services/credit_ai_review/precheck.py
 *  student_view), or `{ available: false, reason }` when there is no answer. */
export interface CreditPrecheck {
  available: boolean;
  reason?: string;
  likelihood?: 'likely' | 'needs_work' | 'uncertain';
  criteria?: { criterion: string; verdict: string }[];
  suggestion?: string | null;
  unread?: { label?: string | null; reason?: string | null }[];
  criteria_source?: string | null;
}

/**
 * Whether this task row offers per-task credit at all. Mirrors the web's
 * three gates, each for the reason the web gives:
 *
 * - A class quest is credited once, as a class, so its tasks carry no button.
 *   An own-curriculum course is the exception: its credit is per task.
 * - A parent on their OWN quest has no diploma; requesting would file "a
 *   student requested credit" for someone who is not one. A parent looking at
 *   a child's quest requests for the child.
 * - A journal moment is not a completion row and never carries credit.
 */
export function offersTaskCredit(args: {
  task: { id: string; is_moment?: boolean };
  quest: { quest_type?: string; metadata?: { course_format?: string } | null } | null;
  viewer: Parameters<typeof effectiveRoleOf>[0] | null;
  studentId?: string | null;
}): boolean {
  const { task, quest, viewer, studentId } = args;
  if (task.is_moment || String(task.id).startsWith('moment-')) return false;
  const ownCurriculum = quest?.metadata?.course_format === 'own_curriculum';
  if (quest?.quest_type === 'class' && !ownCurriculum) return false;
  if (!studentId && viewer && effectiveRoleOf(viewer) === 'parent') return false;
  return true;
}

/** Mount it only where credit is on offer (offersTaskCredit) and the task is
 *  complete: the status read runs on mount. A caller showing a different task
 *  remounts it (TaskItem is keyed by task id) rather than reusing the state. */
export function useTaskCredit(taskId: string, opts: { studentId?: string | null } = {}) {
  const { studentId = null } = opts;
  const [status, setStatus] = useState<DiplomaStatus | null>(null);
  const [precheckOpen, setPrecheckOpen] = useState(false);
  const [precheck, setPrecheck] = useState<CreditPrecheck | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which task an in-flight precheck belongs to. Closing the sheet clears it,
  // so a slow answer arriving afterwards cannot reopen or submit anything.
  const precheckFor = useRef<string | null>(null);

  const scope = studentId ? { student_id: studentId } : {};

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/api/tasks/${taskId}/credit-status`,
          studentId ? { params: { student_id: studentId } } : undefined);
        // A backend that ignored student_id would answer with the PARENT's
        // row; show nothing rather than the wrong person's status.
        if (cancelled || !scopedTo(data, studentId)) return;
        if (data?.data?.has_completion) setStatus(data.data.diploma_status);
      } catch {
        // Not critical: with no status the row simply offers no credit control.
      }
    })();
    return () => { cancelled = true; };
  }, [taskId, studentId]);

  const closePrecheck = useCallback(() => {
    precheckFor.current = null;
    setPrecheckOpen(false);
    setPrecheck(null);
  }, []);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post(`/api/tasks/${taskId}/request-credit`, scope);
      const res = data?.data || data;
      setStatus(res?.diploma_status || 'pending_review');
      closePrecheck();
    } catch (err) {
      const message = extractApiError(err, "The request didn't go through. Try again.").message;
      // Shown in the sheet while it is open, and on the row once it is not.
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const requestCredit = async () => {
    setError(null);
    precheckFor.current = taskId;
    setPrecheck(null);
    setPrecheckOpen(true);
    let answer: CreditPrecheck;
    try {
      const { data } = await api.post(`/api/tasks/${taskId}/credit-precheck`, scope);
      answer = data?.data || data;
    } catch (err) {
      const status = extractApiError(err).status;
      answer = { available: false, reason: status === 429 ? 'rate_limited' : 'error' };
    }
    if (precheckFor.current !== taskId) return;
    // AI is off for this student: there is nothing to preview, so the button
    // does what it did before the precheck existed.
    if (!answer?.available && ['ai_disabled', 'disabled'].includes(answer?.reason || '')) {
      closePrecheck();
      await submit();
      return;
    }
    setPrecheck(answer);
  };

  return { status, precheckOpen, precheck, submitting, error, requestCredit, submit, closePrecheck };
}
