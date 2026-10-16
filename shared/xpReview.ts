/**
 * Task XP that waits for a teacher's accept.
 *
 * Ticket 536a3018, Jackie Hill (Arete Academy): "have the xp not be awarded
 * until it's approved". A school that turns on
 * sis_settings.require_teacher_acceptance holds a finished task's XP until a
 * teacher accepts the work in SIS Submissions. The completion response then
 * carries `xp_pending_review: true` and `xp_awarded: 0`, and the quest detail
 * marks each such task `xp_pending_review: true`.
 *
 * The backend sends the same sentence (services/teacher_acceptance.py,
 * PENDING_REVIEW_MESSAGE); backend/tests/test_teacher_acceptance.py checks the
 * two agree.
 */

export const XP_PENDING_REVIEW_MESSAGE = 'Sent to your teacher. You get the XP when they accept it.'

/** Did this completion response hold the XP for a teacher? Reads the body
 *  of either completion endpoint, enveloped ({data: {...}}) or not. */
export function xpPendingReview(response: unknown): boolean {
  if (!response || typeof response !== 'object') return false
  const body = response as { xp_pending_review?: unknown; data?: { xp_pending_review?: unknown } }
  return body.xp_pending_review === true || body.data?.xp_pending_review === true
}

/** XP a list of tasks has earned: completed tasks only, and not those whose
 *  XP still waits for a teacher. */
export function earnedTaskXp(
  tasks: Array<{ is_completed?: boolean; xp_pending_review?: boolean; xp_value?: number; xp_amount?: number }>,
): number {
  return tasks
    .filter((t) => t.is_completed && !t.xp_pending_review)
    .reduce((sum, t) => sum + (t.xp_value || t.xp_amount || 0), 0)
}
