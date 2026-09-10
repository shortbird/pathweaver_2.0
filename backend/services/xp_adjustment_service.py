"""Changing what a completed task is worth, after it has already paid out.

This is harder than writing a new number to a column, because by the time anyone
wants to change it the XP has already gone three places:

  ``user_quest_tasks.xp_value``   what the task says it is worth
  ``user_skill_xp``               pillar XP, credited the moment the task was completed
  ``users.total_xp``              a denormalized sum of the above
  ``user_subject_xp``             diploma credit, if the student requested it

Writing only the first leaves a student's profile showing XP for work that was
re-valued, and the totals never reconcile. So every adjustment applies the delta
to the pillar the task belongs to, re-derives the subject split at the new total,
and leaves an audit row saying who changed it and why.

Extracted from routes/sis/engagement.py when the credit dashboard needed the same
operation. Authorization stays in the routes -- a teacher adjusting XP for a
student in their class and a superadmin trimming an over-asked credit request are
answerable to completely different checks, and only the arithmetic is shared.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from config.constants import MIN_TASK_XP
from utils.error_reporting import report_error
from utils.logger import get_logger
from utils.subject_xp import get_subject_xp_distribution

logger = get_logger(__name__)


class XPAdjustmentError(ValueError):
    """The requested value is not one we will write."""


@dataclass
class XPAdjustmentResult:
    task_id: str
    student_id: str
    xp_before: int
    xp_after: int
    pillar: Optional[str] = None
    pillar_delta: int = 0
    subjects_before: Dict[str, int] = field(default_factory=dict)
    subjects_after: Dict[str, int] = field(default_factory=dict)
    audit_written: bool = False


def adjust_task_xp(admin, *, task: Dict[str, Any], student_id: str, new_xp: int,
                   adjusted_by: str, reason: str,
                   organization_id: Optional[str] = None,
                   source: str = 'manual',
                   completion_id: Optional[str] = None,
                   quest_id: Optional[str] = None,
                   min_xp: int = MIN_TASK_XP) -> XPAdjustmentResult:
    """Set a completed task's XP to ``new_xp`` and reconcile everything it fed.

    Args:
        task: The ``user_quest_tasks`` row. Needs id, pillar, xp_value, and the
            subject columns.
        student_id: Whose XP this is.
        new_xp: The new value. Must be an int at or above the platform floor.
        reason: Free text, stored on the audit row. Required -- an adjustment
            with no recorded reason is indistinguishable from a data bug when
            somebody asks about it in six months.
        organization_id: None for a platform student, who has no org.
        source: Which surface made the change ('sis_teacher', 'credit_review').
        min_xp: The lowest value this caller may set. Defaults to the platform
            floor, which is what a reviewer trimming an over-asked credit
            request is held to -- a task is either worth crediting or it is not.
            The SIS teacher override passes 0, because it has always allowed a
            teacher to zero out a task entered by mistake, and taking that away
            while extracting shared arithmetic would be a behaviour change
            smuggled in as a refactor.

    Raises:
        XPAdjustmentError: the value is not an integer at or above ``min_xp``.
    """
    task_id = task.get('id')
    if not task_id:
        raise XPAdjustmentError('Cannot adjust XP without a task')
    if isinstance(new_xp, bool) or not isinstance(new_xp, int):
        raise XPAdjustmentError('xp_value must be an integer')
    if new_xp < min_xp:
        raise XPAdjustmentError(f'xp_value must be at least {min_xp}')
    if not (reason or '').strip():
        raise XPAdjustmentError('A reason is required')

    xp_before = int(task.get('xp_value') or 0)
    delta = new_xp - xp_before
    subjects_before = get_subject_xp_distribution(task, xp_before) if xp_before else {}
    subjects_after = rescale_subjects(subjects_before, new_xp)

    result = XPAdjustmentResult(
        task_id=str(task_id), student_id=student_id,
        xp_before=xp_before, xp_after=new_xp,
        subjects_before=subjects_before, subjects_after=subjects_after,
    )

    # The authoritative write. Everything after this is reconciliation, and each
    # step is individually non-fatal: a failure there leaves a number to repair,
    # while raising would leave the caller believing nothing happened at all.
    update: Dict[str, Any] = {'xp_value': new_xp}
    if subjects_after:
        update['subject_xp_distribution'] = subjects_after
    admin.table('user_quest_tasks').update(update).eq('id', task_id).execute()

    if delta:
        result.pillar, result.pillar_delta = _apply_pillar_delta(
            admin, student_id, task.get('pillar'), delta)

    result.audit_written = _write_audit(admin, {
        'organization_id': organization_id,
        'student_user_id': student_id,
        'task_id': task_id,
        'quest_id': quest_id or task.get('quest_id'),
        'adjusted_by': adjusted_by,
        'xp_before': xp_before,
        'xp_after': new_xp,
        'reason': reason.strip()[:1000],
        'source': source,
        'completion_id': completion_id,
    })

    logger.info(f'XP adjusted by {str(adjusted_by)[:8]} via {source}: task '
                f'{str(task_id)[:8]} {xp_before} -> {new_xp} ({reason.strip()[:60]})')
    return result


def rescale_subjects(subjects: Dict[str, int], new_total: int) -> Dict[str, int]:
    """The same subject split, re-weighted to a new total.

    Passed back through get_subject_xp_distribution so the result obeys the same
    rules as every other split in the platform: multiples of 5, summing exactly
    to the total. Doing the arithmetic here instead would produce a split that
    looks right and disagrees with what the rest of the system would compute.
    """
    if not subjects or new_total <= 0:
        return {}
    total = sum(int(v or 0) for v in subjects.values())
    if total <= 0:
        return {}
    scaled = {
        subject: max(1, int(round(int(xp or 0) * new_total / total)))
        for subject, xp in subjects.items() if int(xp or 0) > 0
    }
    return get_subject_xp_distribution({'subject_xp_distribution': scaled}, new_total)


def _apply_pillar_delta(admin, student_id: str, pillar: Optional[str],
                        delta: int) -> tuple:
    """Move the student's pillar XP by ``delta``, then resync their total.

    The task is already complete, so its XP is already sitting in user_skill_xp.
    Floored at zero for the same reason quest_lifecycle_service floors its
    reversals: a negative row is worse than a slightly generous one.
    """
    resolved = pillar or 'stem'
    try:
        from utils.pillar_utils import normalize_pillar_name
        resolved = normalize_pillar_name(resolved) or resolved
    except Exception:  # noqa: BLE001 - keep the stored value if unmappable
        pass

    try:
        current = admin.table('user_skill_xp').select('id, xp_amount').eq(
            'user_id', student_id).eq('pillar', resolved).execute().data
        if current:
            new_amount = max(0, int(current[0].get('xp_amount') or 0) + delta)
            admin.table('user_skill_xp').update(
                {'xp_amount': new_amount}).eq('id', current[0]['id']).execute()
        elif delta > 0:
            admin.table('user_skill_xp').insert({
                'user_id': student_id, 'pillar': resolved, 'xp_amount': delta,
            }).execute()
    except Exception as e:  # noqa: BLE001
        report_error(e, 'XP adjustment could not update pillar XP',
                     student_id=student_id, pillar=resolved, delta=delta)
        return resolved, 0

    try:
        from services.xp_service import XPService
        XPService().update_user_mastery(student_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'XP adjustment: total_xp sync failed for {str(student_id)[:8]}: {e}')

    return resolved, delta


def _write_audit(admin, row: Dict[str, Any]) -> bool:
    """Record the change. The adjustment already happened, so log loudly and go on."""
    try:
        admin.table('sis_xp_adjustments').insert(row).execute()
        return True
    except Exception as e:  # noqa: BLE001
        logger.error(f'XP adjustment audit insert failed for task '
                     f'{str(row.get("task_id"))[:8]}: {e}')
        return False
