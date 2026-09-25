"""
The rules a family-written task must follow: whether it needs a Definition of
Done, and when that Definition of Done stops being editable.

A Definition of Done (``user_quest_tasks.success_criteria``) is the checklist the
credit reviewer, and the AI review before them, judge the evidence against.
Without one the review falls back to the description, which is where inflated
tasks hide: "write a research paper" reads as big whatever turns up.

Two rules live here so every create and edit path asks the same question:

  * Required. An org with ``feature_flags.require_success_criteria`` (Optio
    Academy, migration 20260925180000) refuses a family- or student-written
    task with no Definition of Done. Everywhere else it stays optional.
    Resolved against the LEARNER's org, never the caller's, so a parent acting
    for a child is judged by the child's school -- the same rule
    utils/xp_permissions.py follows for the XP lock.

  * Locked at submission. Once a task has ever been sent for credit, its
    Definition of Done is what the work was judged against, so the family can no
    longer change it. That includes a task sent back with "Grow This": moving
    the goalposts after feedback is exactly what the lock prevents. Teachers and
    reviewers (XP guides) are not locked.

Teachers and reviewers are never required to write one either: they author
quests and review work, and the requirement is about what families submit.
"""

from datetime import date
from typing import Optional

from utils.logger import get_logger
from utils.org_features import user_org_has_feature

logger = get_logger(__name__)

# feature_flags key. Absent = optional, the platform default.
REQUIRE_CRITERIA_FLAG = 'require_success_criteria'

# Written for the family; these reach the UI verbatim.
CRITERIA_REQUIRED_MESSAGE = (
    'Add a Definition of Done: a short list of what finished looks like. '
    'Use "Help me finish this" if you want a suggestion.'
)
CRITERIA_LOCKED_MESSAGE = (
    "This task's Definition of Done can't change after it has been sent for "
    'credit, because it is what the work is reviewed against.'
)


#: From this age a learner writes tasks against diploma subjects only: the task
#: creator shows the subject picker and no pillar picker, and the pillar is
#: derived from the subject server-side (utils/school_subjects.pillar_for_subject).
#: Younger learners keep the pillars, which is the platform's own taxonomy.
HIGH_SCHOOL_AGE = 13


def learner_age(learner_id: Optional[str], today: Optional[date] = None) -> Optional[int]:
    """The learner's age in whole years today, or None when there is no usable
    date_of_birth (optional at registration). Never raises.

    Today, not the school-year age sis_age uses: this is about which form a
    learner sees right now, the question sis_eligibility.age_on answers.
    """
    if not learner_id:
        return None
    try:
        from repositories.user_repository import UserRepository
        from services.sis_eligibility import age_on
        row = UserRepository().find_by_id(learner_id) or {}
        if not row.get('date_of_birth'):
            return None
        return age_on(row['date_of_birth'], today or date.today())
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not read age for {str(learner_id)[:8]}: {e}')
        return None


def pillars_hidden_by_age(learner_id: Optional[str]) -> bool:
    """True for a learner 13 or older. An unknown age keeps the pillars, which
    is how the form behaved before this rule."""
    age = learner_age(learner_id)
    return age is not None and age >= HIGH_SCHOOL_AGE


def requires_success_criteria(learner_id: Optional[str]) -> bool:
    """True when the learner's org requires a Definition of Done on their tasks.

    Fails open (False) on error, like the XP lock: a database blip should not
    stop a family from adding a task.
    """
    if not learner_id:
        return False
    return user_org_has_feature(learner_id, REQUIRE_CRITERIA_FLAG)


def missing_criteria_response(tasks, learner_id: Optional[str], caller_role: Optional[str]):
    """A 400 response when the learner's school requires a Definition of Done and
    any of `tasks` has none; None when the batch may be written.

    Guides (teachers, reviewers) are never refused. Criteria are judged after
    sanitizing, so a list of blank strings counts as none.
    """
    from flask import jsonify
    from utils.personalization_helpers import sanitize_success_criteria
    from utils.xp_permissions import is_xp_guide

    if is_xp_guide(caller_role):
        return None
    missing = [
        t for t in (tasks or [])
        if not sanitize_success_criteria((t or {}).get('success_criteria'))
    ]
    if not missing or not requires_success_criteria(learner_id):
        return None
    return jsonify({
        'success': False,
        'error': CRITERIA_REQUIRED_MESSAGE,
        'code': 'success_criteria_required',
    }), 400


def criteria_locked(task_id: Optional[str]) -> bool:
    """True once this task has ever been sent for credit.

    Any completion whose diploma_status has left 'none' counts: pending review,
    sent back (grow_this), approved or finalized. Fails open on error.
    """
    if not task_id:
        return False
    try:
        from repositories.task_repository import TaskRepository
        return TaskRepository().has_credit_submission(task_id)
    except Exception as e:
        logger.warning(f'Could not resolve criteria lock for task {task_id}: {e}')
        return False
