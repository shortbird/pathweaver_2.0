"""Turn a reviewer's disagreement with the AI into a suggested worked example.

When Optio's final approval awards a different XP than the AI recommended, or a
subject split that differs from the one the AI suggested, the approval saves the
reviewer's answer as a 'suggested' example. It reaches no prompt until a person
approves it in the grader's Tune AI XP popup: an override is sometimes about
this one student (work done offline, a conversation the evidence does not show),
and learning from those automatically would teach the AI rules nobody meant.

The work is described by the AI's own "work" line from the review -- a short
description of the evidence with no names -- or the task title for a review
that predates it. The reviewer can edit it before approving.

Best effort. The approval has already happened; nothing here may fail it.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from config.constants import TASK_XP_SIZES
from utils.logger import get_logger

from services.credit_ai_review.subject_mix import differs, to_percent

logger = get_logger(__name__)


def capture_from_approval(admin, *, completion_id: str, task: Dict[str, Any],
                          final_xp: int, approved_subjects: Any,
                          reviewer_id: str) -> Optional[Dict[str, Any]]:
    """Save a suggested example if the approval disagreed with the AI. Never raises."""
    try:
        return _capture(admin, completion_id=completion_id, task=task,
                        final_xp=final_xp, approved_subjects=approved_subjects,
                        reviewer_id=reviewer_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not save a suggested XP example for {str(completion_id)[:8]}: {e}')
        return None


def _capture(admin, *, completion_id: str, task: Dict[str, Any], final_xp: int,
             approved_subjects: Any, reviewer_id: str) -> Optional[Dict[str, Any]]:
    from repositories.credit_review_xp_example_repository import CreditReviewXpExampleRepository
    from services.credit_ai_review import store

    try:
        final_xp = int(final_xp)
    except (TypeError, ValueError):
        return None
    if final_xp not in TASK_XP_SIZES:
        # A legacy claim kept as it was. Not a size, so not an example.
        return None

    row = store.latest_for_completions(admin, [completion_id]).get(completion_id)
    review = (row or {}).get('review') if (row or {}).get('status') == 'complete' else None
    if not isinstance(review, dict):
        # Nothing the AI said, so nothing to disagree with.
        return None

    ai_xp = _int_or_none((review.get('xp') or {}).get('recommended'))
    # A review from before the AI suggested subjects is compared with the
    # task's own split, which is what the grader showed beside it.
    ai_subjects = to_percent(review.get('subjects')) or _task_split(task)
    final_subjects = to_percent(approved_subjects)

    xp_changed = ai_xp is not None and final_xp != ai_xp
    subjects_changed = bool(final_subjects and ai_subjects and differs(final_subjects, ai_subjects))
    if not (xp_changed or subjects_changed):
        return None

    repo = CreditReviewXpExampleRepository(client=admin)
    if repo.exists_for_completion(completion_id):
        # The reviewer already saved this one by hand.
        return None

    work = ' '.join(str(review.get('work') or task.get('title') or '').split())[:300]
    if len(work) < 3:
        return None

    return repo.add(
        work=work, xp=final_xp, subjects=final_subjects or None,
        status='suggested', ai_xp=ai_xp, ai_subjects=ai_subjects or None,
        completion_id=completion_id, created_by=reviewer_id)


def _task_split(task: Dict[str, Any]) -> Dict[str, int]:
    from utils.subject_xp import get_subject_xp_distribution
    return to_percent(get_subject_xp_distribution(task, int(task.get('xp_value') or 100)))


def _int_or_none(value: Any) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
