"""
Credit Dashboard - the school stage: who may review, and who makes the final call.

Since 2026-10-15 (Tanner) the school stage is not always the first of two:

- **Who reviews.** Org admins, campus coordinators and teachers (advisors)
  approve or send back their school's credit requests, as well as superadmins.
  Admins and coordinators see the whole school. A teacher sees only the
  students they teach: the roster of every class they teach
  (utils.class_membership.students_taught_by -- primary instructor, assistant
  instructors and class_advisors, the SIS's one definition) plus their formal
  advisor_student_assignments rows, intersected with their own school.

- **Who makes the final call.** It follows the student's transcript
  (utils.accreditation.resolve_transcript_accreditation). A transcript issued
  under Optio's accreditation ('optio' -- an Optio Academy enrollment, or an
  org that is an Academy extension) needs Optio's stamp, so the school's
  approval hands the request to the Optio queue. Any other transcript ('self',
  'none') is the school's own: the school's approval is the final stamp and the
  credit goes straight on the transcript.

``finalize_credit`` is that final stamp, shared by the superadmin one-click
approve and the school-finalize path in org_admin_actions. The superadmin
approve route in superadmin_actions.py keeps its own copy: it retries its reads,
inserts a review round for legacy requests, records approved_subjects on the
round and captures XP calibration examples, so folding it in would change what
it does.
"""

from typing import Any, Dict, Iterable, Optional, Set, Tuple

from utils.accreditation import resolve_transcript_accreditation
from utils.auth.org_scope import caller_roles_and_org
from utils.logger import get_logger
from utils.sis_roles import ADMIN_ROLES, STAFF_ROLES

from .reviewer_xp import apply_reviewer_xp, record_ai_outcome

logger = get_logger(__name__)

#: Who makes the final call on a student's credit request.
FINAL_SCHOOL = 'school'
FINAL_OPTIO = 'optio'


def _repo(admin):
    from repositories.credit_school_review_repository import CreditSchoolReviewRepository
    return CreditSchoolReviewRepository(client=admin)


# ── who makes the final call ─────────────────────────────────────────────────

def _final_from_source(source: str) -> str:
    return FINAL_OPTIO if source == 'optio' else FINAL_SCHOOL


def final_reviewer_for(admin, student_id: str, student_org_id: Optional[str]) -> str:
    """FINAL_OPTIO when the student's transcript is issued under Optio's
    accreditation, else FINAL_SCHOOL."""
    from services import academy_enrollment_service as academy_enrollment
    org_row = _repo(admin).org_accreditation_rows([student_org_id]).get(student_org_id) \
        if student_org_id else None
    accreditation = resolve_transcript_accreditation(
        student_org_id, org_row,
        academy_enrolled=academy_enrollment.is_academy_student(student_id, client=admin),
    )
    return _final_from_source(accreditation.get('source'))


def final_reviewers_for(admin, student_orgs: Dict[str, Optional[str]]) -> Dict[str, str]:
    """{student_id: FINAL_*} for a page of students, in two reads.

    ``student_orgs`` maps each student id to their organization_id.
    """
    if not student_orgs:
        return {}
    repo = _repo(admin)
    orgs = repo.org_accreditation_rows(o for o in student_orgs.values() if o)
    enrolled = repo.academy_enrolled_ids(student_orgs.keys())
    return {
        sid: _final_from_source(resolve_transcript_accreditation(
            org_id, orgs.get(org_id), academy_enrolled=sid in enrolled).get('source'))
        for sid, org_id in student_orgs.items()
    }


# ── who may review ───────────────────────────────────────────────────────────

def reviews_whole_school(roles: Iterable[str]) -> bool:
    """Admins and coordinators review every student in their school."""
    return bool(set(roles or ()) & set(ADMIN_ROLES))


def teacher_student_ids(admin, teacher_id: str, org_id: Optional[str]) -> list:
    """The students this teacher reviews: their class rosters plus their
    formal advisor assignments, limited to the teacher's own school."""
    if not teacher_id or not org_id:
        return []
    from utils.class_membership import students_taught_by
    repo = _repo(admin)
    mine: Set[str] = set(students_taught_by(teacher_id))
    mine.update(repo.advisor_assigned_student_ids(teacher_id))
    mine.discard(teacher_id)
    return repo.org_member_ids_among(org_id, sorted(mine))


def verify_org_scope(admin, reviewer_id: str, student_id: str) -> Optional[str]:
    """May this reviewer act on this student's credit request?

    Superadmins review every org (returns None). Everyone else must be staff
    of the student's own organization; a teacher who is neither an admin nor
    a coordinator must also teach the student. Returns the student's
    organization_id. Raises PermissionError to refuse and ValueError when the
    student does not exist.
    """
    roles, reviewer_org, is_super = caller_roles_and_org(admin, reviewer_id)
    if is_super:
        return None
    if not roles and not reviewer_org:
        raise PermissionError('Reviewer not found')
    if not roles & set(STAFF_ROLES):
        raise PermissionError('Not authorized to review credit requests')

    student = admin.table('users') \
        .select('organization_id') \
        .eq('id', student_id) \
        .single() \
        .execute()
    if not student.data:
        raise ValueError('Student not found')
    student_org = student.data.get('organization_id')

    if not reviewer_org or not student_org or reviewer_org != student_org:
        raise PermissionError('Not authorized to review students outside your organization')

    if not reviews_whole_school(roles) \
            and student_id not in teacher_student_ids(admin, reviewer_id, reviewer_org):
        raise PermissionError('You can review credit only for students you teach')

    return student_org


def caller_may_review_student(admin, caller_id: str, student_id: str) -> bool:
    """verify_org_scope as a yes/no, for the read endpoints."""
    try:
        verify_org_scope(admin, caller_id, student_id)
        return True
    except (PermissionError, ValueError):
        return False


# ── the final stamp ──────────────────────────────────────────────────────────

def finalize_credit(admin, *, completion: Dict[str, Any], reviewer_id: str,
                    data: Dict[str, Any], feedback: str,
                    override_subjects: Optional[Dict[str, Any]],
                    now: str) -> Tuple[Optional[Dict[str, Any]], Optional[Any]]:
    """Put a credit request on the student's transcript.

    Applies an accepted XP change first (the subject split is derived from the
    task's XP, so computing it first would credit the old number), moves the
    subject XP from pending to finalized, marks the completion finalized, and
    leaves the approval on the task's latest_feedback.

    Deliberately no student notification: credit review happens in batches,
    and one "Diploma Credit Approved" ping per task used to land on the same
    student a dozen times in a row. latest_feedback carries the approval.

    Returns ``(result, error_response)``.
    """
    from routes.tasks import (
        finalize_subject_xp,
        get_subject_xp_distribution,
        pending_subjects_for_completion,
        remove_pending_subject_xp,
    )

    completion_id = completion['id']
    student_id = completion['user_id']

    task_result = admin.table('user_quest_tasks') \
        .select('id, quest_id, pillar, title, diploma_subjects, '
                'subject_xp_distribution, xp_value') \
        .eq('id', completion['user_quest_task_id']) \
        .single() \
        .execute()
    task_data = task_result.data or {}
    xp_value = task_data.get('xp_value', 0)

    xp_result, xp_error = apply_reviewer_xp(
        admin, data,
        completion=completion, task=task_data,
        student_id=student_id, reviewer_id=reviewer_id)
    if xp_error:
        return None, xp_error
    if xp_result:
        xp_value = xp_result.xp_after
        task_data = {**task_data, 'xp_value': xp_value,
                     'subject_xp_distribution': xp_result.subjects_after}

    approved_subjects = (
        override_subjects
        if override_subjects and isinstance(override_subjects, dict)
        else get_subject_xp_distribution(task_data, xp_value)
    )
    original_subjects = pending_subjects_for_completion(
        admin, completion_id, task_data, xp_value)
    try:
        remove_pending_subject_xp(admin, student_id, original_subjects)
    except Exception as xp_err:
        logger.warning(f"Could not remove pending XP before finalize: {xp_err}")
    total_xp_finalized = finalize_subject_xp(admin, student_id, approved_subjects)

    admin.table('quest_task_completions').update({
        'diploma_status': 'finalized',
        'org_reviewer_id': reviewer_id,
        'credit_reviewer_id': reviewer_id,
        'finalized_at': now,
    }).eq('id', completion_id).execute()

    if completion.get('user_quest_task_id'):
        admin.table('user_quest_tasks').update({
            'latest_feedback': feedback if feedback else 'Diploma credit approved!',
            'feedback_at': now,
        }).eq('id', completion['user_quest_task_id']).execute()

    record_ai_outcome(admin, completion_id, data, xp_result)

    return {
        'approved_subjects': approved_subjects,
        'xp_finalized': total_xp_finalized,
    }, None
