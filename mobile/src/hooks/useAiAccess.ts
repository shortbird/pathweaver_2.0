/**
 * Whether AI task generation is allowed for whoever the screen is about.
 *
 * GET /api/ai-access/status answers for the signed-in user, or -- with
 * `?student_id=<child>` -- for a child the caller is guardian of
 * (backend/routes/ai_access.py, @student_scope). Parent mode MUST pass the
 * child: every AI call the quest screen makes in parent mode carries the
 * child's student_id, and the backend checks the CHILD's switches. Asking
 * about the parent showed "Generate task ideas" for a child whose AI was off,
 * and the call behind it came back 403 ai_disabled (Sentry 64448412 /
 * e7429a56 on web; the mobile screens had the same gap).
 *
 * Hidden while loading and on error: showing the button and then refusing is
 * the bug this exists to prevent. The server still enforces the rule.
 */

import { useEffect, useState } from 'react';
import api from '@/src/services/api';

interface StatusPayload {
  has_access?: boolean;
  hasAccess?: boolean;
  features?: { task_generation?: boolean };
}

interface Options {
  /** Parent mode: the child the AI would act for. Omit for the signed-in user. */
  studentId?: string | null;
  /** Only fetch while something that needs the answer is on screen. */
  enabled?: boolean;
}

export interface AiAccess {
  canGenerateTasks: boolean;
  loading: boolean;
}

export function canGenerateTasksFrom(data: StatusPayload | null | undefined): boolean {
  if (!data) return false;
  const hasAccess = data.has_access ?? data.hasAccess ?? false;
  const feature = data.features?.task_generation ?? true;
  return !!hasAccess && !!feature;
}

export function useAiAccess({ studentId = null, enabled = true }: Options = {}): AiAccess {
  // Keyed by the subject it answers, so switching child never shows the
  // previous child's answer while the new one is in flight.
  const key = studentId || '';
  const [answer, setAnswer] = useState<{ key: string; allowed: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const request = studentId
      ? api.get('/api/ai-access/status', { params: { student_id: studentId } })
      : api.get('/api/ai-access/status');
    request
      .then(({ data }) => { if (alive) setAnswer({ key, allowed: canGenerateTasksFrom(data) }); })
      .catch(() => { if (alive) setAnswer({ key, allowed: false }); });
    return () => { alive = false; };
  }, [enabled, key, studentId]);

  const current = answer?.key === key ? answer : null;
  return {
    canGenerateTasks: !!current?.allowed,
    loading: enabled && !current,
  };
}

export default useAiAccess;
