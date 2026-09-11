"""Who may say a student's work can be shown, and recording that they did.

The rules, in order of who is asking:

  the student, for themselves     only as an adult. A minor cannot consent to
                                  their own promotion; unknown age is a minor.
  a parent                        yes, by any of the three linking mechanisms.
  an org admin over the student   only when the student has no parent on the
                                  platform; a parent outranks the school.
  a superadmin                    records on the family's behalf, naming the
                                  approver find_approver() would have chosen,
                                  and must cite where the consent came from.

The database trigger enforces the first rule again. This module is the one
that says no with a reason the UI can show.

Revocation is symmetric with approval and always available to the same
people. It takes every published NAMED story about the student down; an
anonymized story never depended on the consent and stays.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from utils.access_logger import AccessLogger
from utils.logger import get_logger
from utils.portfolio_access import find_approver, is_minor, is_org_admin_over, is_parent_of
from utils.timestamps import now_iso

logger = get_logger(__name__)

SCOPE_KEYS = ('work', 'first_name', 'image_voice', 'age')
SOURCES = ('academy_agreement', 'org_registration', 'parent_account', 'written')


class ConsentRefused(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _repo(repo=None):
    if repo is not None:
        return repo
    from repositories.promotional_consent_repository import PromotionalConsentRepository
    return PromotionalConsentRepository()


def _source_repo(source_repo=None):
    if source_repo is not None:
        return source_repo
    from repositories.story_source_repository import StorySourceRepository
    return StorySourceRepository()


def scope_of(consent: Optional[Dict[str, Any]]) -> Dict[str, bool]:
    consent = consent or {}
    return {key: bool(consent.get(f'scope_{key}')) for key in SCOPE_KEYS}


def tier_for(consent: Optional[Dict[str, Any]]) -> str:
    """named only when a live consent covers the work itself."""
    return 'named' if consent and consent.get('scope_work') else 'anonymized'


def status_for(student_id: str, *, repo=None) -> Dict[str, Any]:
    repo = _repo(repo)
    active = repo.active_for_student(student_id)
    return {
        'student_user_id': student_id,
        'active': active,
        'scope': scope_of(active),
        'tier': tier_for(active),
        'history': repo.list_for_student(student_id),
    }


def _normalize_scope(scope: Any) -> Dict[str, bool]:
    scope = scope if isinstance(scope, dict) else {}
    out = {key: bool(scope.get(key)) for key in SCOPE_KEYS}
    if not any(out.values()):
        raise ConsentRefused('empty_scope', 'Pick at least one thing the consent covers.')
    return out


def _decide_approver(*, student: Dict[str, Any], caller: Dict[str, Any],
                     caller_id: str) -> Dict[str, Any]:
    """{'approver_kind', 'granted_by'} or ConsentRefused."""
    student_id = student['id']
    if caller.get('role') == 'superadmin':
        approver = find_approver(student_id)
        if approver:
            return {'approver_kind': approver['kind'], 'granted_by': approver['user_id']}
        if not is_minor(student):
            return {'approver_kind': 'self_adult', 'granted_by': student_id}
        raise ConsentRefused('no_approver',
                             'Nobody on the platform can consent for this student: no parent '
                             'is linked and the student is a minor.')

    if caller_id == student_id:
        if is_minor(student):
            raise ConsentRefused('minor_self_grant',
                                 'A minor cannot consent to their own promotion. A parent or '
                                 'guardian must.')
        return {'approver_kind': 'self_adult', 'granted_by': student_id}

    if is_parent_of(caller_id, student_id):
        return {'approver_kind': 'parent', 'granted_by': caller_id}

    if is_org_admin_over(caller, student):
        approver = find_approver(student_id)
        if approver and approver.get('kind') == 'parent':
            raise ConsentRefused('parent_outranks_org',
                                 'This student has a parent on the platform; the parent decides.')
        return {'approver_kind': 'org_admin', 'granted_by': caller_id}

    raise ConsentRefused('not_authorized', 'You cannot consent on behalf of this student.')


def grant(*, student_id: str, caller_id: str, scope: Any, source: str,
          source_ref: Optional[str] = None, notes: Optional[str] = None,
          repo=None, source_repo=None) -> Dict[str, Any]:
    """Record a consent. Raises ConsentRefused with a code the UI can show."""
    repo = _repo(repo)
    source_repo = _source_repo(source_repo)

    if source not in SOURCES:
        raise ConsentRefused('bad_source', f'source must be one of {", ".join(SOURCES)}.')
    normalized = _normalize_scope(scope)

    student = source_repo.student(student_id)
    if not student:
        raise ConsentRefused('student_not_found', 'Student not found.')
    caller = source_repo.student(caller_id)
    if not caller:
        raise ConsentRefused('not_authorized', 'Caller not found.')

    if repo.active_for_student(student_id):
        raise ConsentRefused('already_active',
                             'A consent is already on file. Revoke it before recording another.')

    decided = _decide_approver(student=student, caller=caller, caller_id=caller_id)
    on_behalf = caller.get('role') == 'superadmin' and decided['granted_by'] != caller_id
    if on_behalf and not (source_ref or '').strip():
        raise ConsentRefused('source_ref_required',
                             'Say where this consent came from (a form, an email, a signed '
                             'agreement) when recording it for a family.')

    row = repo.create({
        'student_user_id': student_id,
        'granted_by_user_id': decided['granted_by'],
        'recorded_by_user_id': caller_id,
        'approver_kind': decided['approver_kind'],
        'scope_work': normalized['work'],
        'scope_first_name': normalized['first_name'],
        'scope_image_voice': normalized['image_voice'],
        'scope_age': normalized['age'],
        'source': source,
        'source_ref': (source_ref or '').strip() or None,
        'notes': (notes or '').strip() or None,
        'granted_at': now_iso(),
    })
    AccessLogger.log_student_data_access(
        student_id, caller_id, 'promotional_consent', purpose='consent_granted',
        fields=[k for k, v in normalized.items() if v])
    logger.info(f'Promotional consent recorded for student {student_id[:8]} '
                f'({decided["approver_kind"]}, via {source})')
    return row


def _may_revoke(consent: Dict[str, Any], caller: Dict[str, Any], caller_id: str,
                student: Dict[str, Any]) -> bool:
    if caller.get('role') == 'superadmin':
        return True
    if caller_id in (consent.get('granted_by_user_id'), consent.get('recorded_by_user_id')):
        return True
    if is_parent_of(caller_id, student['id']):
        return True
    return is_org_admin_over(caller, student)


def revoke(consent_id: str, *, caller_id: str, repo=None, source_repo=None,
           admin=None) -> Dict[str, Any]:
    """Withdraw a consent and take every named story about the student down."""
    from services.stories import publish

    repo = _repo(repo)
    source_repo = _source_repo(source_repo)
    consent = repo.get(consent_id)
    if not consent:
        raise ConsentRefused('not_found', 'Consent not found.')
    if consent.get('revoked_at'):
        return consent

    student = source_repo.student(consent['student_user_id'])
    caller = source_repo.student(caller_id)
    if not student or not caller or not _may_revoke(consent, caller, caller_id, student):
        raise ConsentRefused('not_authorized', 'You cannot revoke this consent.')

    revoked = repo.revoke(consent_id, revoked_by=caller_id, revoked_at=now_iso()) or {
        **consent, 'revoked_at': now_iso(), 'revoked_by_user_id': caller_id}
    taken_down = publish.unpublish_all_for_student(
        consent['student_user_id'], reason='consent_revoked', tier='named', admin=admin)
    AccessLogger.log_student_data_access(
        consent['student_user_id'], caller_id, 'promotional_consent',
        purpose='consent_revoked', fields=[f'stories_unpublished:{taken_down}'])
    logger.info(f'Promotional consent {consent_id[:8]} revoked; {taken_down} named '
                f'stor{"y" if taken_down == 1 else "ies"} unpublished')
    return {**revoked, 'stories_unpublished': taken_down}


def history_summary(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The editor's consent panel: no notes, no free text, just the record."""
    return [{
        'id': r.get('id'),
        'approver_kind': r.get('approver_kind'),
        'scope': scope_of(r),
        'source': r.get('source'),
        'granted_at': r.get('granted_at'),
        'revoked_at': r.get('revoked_at'),
    } for r in rows or []]
