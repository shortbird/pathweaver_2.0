"""Applying what a reviewer took from the AI, on approve and on Grow This.

Two small things that both approve endpoints need and neither should own:

``apply_reviewer_xp`` turns an ``xp_value`` in the request body into a real
adjustment -- the task's value, the pillar XP already credited at completion, the
subject split, and an audit row. It runs BEFORE the subject split is computed,
because the split is derived from the task's XP.

``record_ai_outcome`` writes down which draft the reviewer actually used. That is
the only honest measure of whether the AI is earning its cost, and it has to come
from the approve call because nothing else knows what the reviewer clicked.

Both are superadmin-only paths by the time they are reached. Org admins cannot
send ``xp_value``: their stage is the first of two, the final XP is Optio's call,
and letting a partner trim a student's XP on the way through would make the
second reviewer's number a surprise.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

from utils.api_response_v1 import error_response
from utils.logger import get_logger

logger = get_logger(__name__)


def apply_reviewer_xp(admin, data: Dict[str, Any], *, completion: Dict[str, Any],
                      task: Dict[str, Any], student_id: str,
                      reviewer_id: str) -> Tuple[Optional[Any], Optional[Tuple]]:
    """Apply an accepted XP change, if the body carries one.

    Returns ``(result, error_response)``. Both None means the body asked for no
    change, which is the common case: a reviewer who agrees with the student's
    XP sends nothing.
    """
    raw = data.get('xp_value')
    if raw is None:
        return None, None

    try:
        new_xp = int(raw)
    except (TypeError, ValueError):
        return None, error_response(code='VALIDATION_ERROR',
                                    message='xp_value must be a whole number',
                                    status=400)

    current_xp = int(task.get('xp_value') or 0)
    if new_xp == current_xp:
        return None, None

    reason = (data.get('xp_reason') or '').strip()
    if not reason:
        # An adjustment with no recorded reason is indistinguishable from a data
        # bug when somebody asks about it later. The UI sends the AI's rationale.
        reason = 'Adjusted during credit review'

    subjects = data.get('subjects')
    if subjects and isinstance(subjects, dict):
        total = sum(int(v or 0) for v in subjects.values())
        if total != new_xp:
            return None, error_response(
                code='XP_MISMATCH',
                message=f'The subject split totals {total} XP but the task is being '
                        f'set to {new_xp} XP.',
                status=400)

    from services.xp_adjustment_service import XPAdjustmentError, adjust_task_xp
    try:
        result = adjust_task_xp(
            admin,
            task=task,
            student_id=student_id,
            new_xp=new_xp,
            adjusted_by=reviewer_id,
            reason=reason,
            organization_id=_org_of(admin, student_id),
            source='credit_review',
            completion_id=completion.get('id'),
            quest_id=completion.get('quest_id'),
        )
    except XPAdjustmentError as e:
        return None, error_response(code='VALIDATION_ERROR', message=str(e), status=400)

    return result, None


def _org_of(admin, student_id: str) -> Optional[str]:
    """The student's org, or None. Platform students have none, and the audit
    table's organization_id is nullable for exactly that reason."""
    try:
        rows = admin.table('users').select('organization_id').eq(
            'id', student_id).limit(1).execute().data
        return (rows[0] if rows else {}).get('organization_id')
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not resolve org for an XP audit row: {e}')
        return None


def record_ai_outcome(admin, completion_id: str, data: Dict[str, Any],
                      xp_result: Optional[Any]) -> None:
    """Note which AI draft the reviewer used, and whether they took its XP.

    Best effort in every sense: the approval has already happened, and losing a
    telemetry write must never turn a successful decision into an error.
    """
    accepted = data.get('ai_accepted')
    if not isinstance(accepted, dict) and xp_result is None:
        return

    accepted = accepted if isinstance(accepted, dict) else {}
    feedback_used = accepted.get('feedback')
    if feedback_used not in ('celebrate', 'grow_this', None):
        feedback_used = None

    accepted_xp = accepted.get('xp')
    if accepted_xp is None and xp_result is not None:
        accepted_xp = True

    try:
        from services.credit_ai_review import store

        rounds = admin.table('diploma_review_rounds').select('id').eq(
            'completion_id', completion_id).order(
            'round_number', desc=True).limit(1).execute().data
        if not rounds:
            return
        store.mark_reviewer_outcome(
            admin, round_id=rounds[0]['id'],
            accepted_feedback=feedback_used,
            accepted_xp=None if accepted_xp is None else bool(accepted_xp))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not record the AI review outcome for {completion_id}: {e}')
