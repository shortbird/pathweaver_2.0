"""
What a school's registration answers say about a family, for its welcome
emails (2026-10-12).

Optio Academy's welcome funnel went to every family with the same copy: the
diploma-credit email reached the parent of an 8th grader, and the day-8
check-in pitched the $500 teacher to a family that had asked about one the
day before and been answered. Step content can now carry conditional blocks
(crm_funnel_engine.render_step_content), and this module supplies the
answers they test, read from the family's newest registration with the
funnel's school.

Segments are plain booleans plus `student_names`. A family can sit in two
grade bands at once (a 7th grader and a 10th grader), so the bands are not
exclusive; copy that needs "only K-8" writes {{#unless high_school}}.
"""
from typing import Any, Dict, List, Optional

from repositories.registration_repository import RegistrationRepository
from services.registration_teacher_interest import (
    ADD_ON_KEY, _join, interested_students)
from utils.logger import get_logger

logger = get_logger(__name__)

HIGH_SCHOOL_GRADES = ('9th', '10th', '11th', '12th')

# Every segment name a step may test. The editor lists them; an unknown name
# in copy reads as false, so a typo drops a block rather than leaking it.
SEGMENTS = {
    'high_school': 'A student is in grade 9 to 12',
    'k8': 'A student is in kindergarten to 8th grade',
    'teacher_interest': 'Ticked "interested in an Optio teacher" and did not buy it',
    'teacher_added': 'Bought the Optio teacher add-on',
    'prior_school': 'Named a current or most recent school',
    'teacher_none': 'Neither asked about nor bought an Optio teacher',
    'own_login': 'A student signs in with their own email',
    'managed_login': 'A student has no login of their own (parent-managed)',
    'several_students': 'Registered more than one student',
    # OpenEd families buy through OpenEd and OpenEd pays Optio, so they are
    # never shown a price (Tanner, 2026-10-13). Copy that quotes one wraps it
    # in {{#unless opened}}.
    'opened': 'The family is funded by OpenEd (household funding source)',
}


def _name(kid: Dict[str, Any]) -> str:
    return (kid.get('preferred_name') or kid.get('first_name')
            or (kid.get('name') or '').split(' ')[0] or 'your student')


def _per_kid(answer: Any, kid_id: Optional[str]) -> Any:
    """One student's answer: per-student questions store {kid_id: value},
    family-wide ones a single value."""
    return answer.get(kid_id) if isinstance(answer, dict) else answer


def segments_for_registration(reg: Dict[str, Any],
                              kid_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    """The segments for this registration, or for only the students in
    `kid_ids` (a student's own welcome is about that student alone)."""
    raw = reg.get('answers')
    answers: Dict[str, Any] = raw if isinstance(raw, dict) else {}
    kids = [k for k in (reg.get('kids') or [])
            if kid_ids is None or k.get('user_id') in kid_ids]
    grades = [str(_per_kid(answers.get('grade_level'), k.get('user_id')) or '') for k in kids]
    schools = [str(_per_kid(answers.get('prior_school'), k.get('user_id')) or '').strip()
               for k in kids]
    interested = bool(interested_students({**reg, 'kids': kids}))
    added = any(ADD_ON_KEY in (k.get('add_ons') or []) for k in kids)
    return {
        'high_school': any(g in HIGH_SCHOOL_GRADES for g in grades),
        'k8': any(g and g not in HIGH_SCHOOL_GRADES for g in grades),
        'teacher_interest': interested,
        'teacher_added': added,
        'teacher_none': not (interested or added),
        'own_login': any((k.get('email') or '').strip() for k in kids),
        'managed_login': any(not (k.get('email') or '').strip() for k in kids),
        'prior_school': any(schools),
        'several_students': len(kids) > 1,
        'student_names': _join([_name(k) for k in kids]) or 'your student',
    }


def segments_for_email(db, email: str, org_slug: str) -> Optional[Dict[str, Any]]:
    """Segments for the person at this address: a parent's newest
    registration with the school, or, for a student, the newest one naming
    them. {} when there is none (every block then reads false); None when the
    lookup failed, so the sweep retries instead of sending generic copy."""
    try:
        repo = RegistrationRepository(client=db)
        org_id = repo.org_id_for_slug(org_slug)
        user_id = repo.user_id_for_email(email)
        if not org_id or not user_id:
            return {}
        opened = {'opened': 'opened' in repo.household_funding_sources(org_id, user_id)}
        reg = repo.newest_full_for_parent(org_id, user_id)
        if reg:
            return {**segments_for_registration(reg), **opened}
        reg = repo.newest_full_naming_child(org_id, user_id)
        if reg:
            return {**segments_for_registration(reg, kid_ids=[user_id]), **opened}
        return opened
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM segments: registration lookup failed: {e}')
        return None
