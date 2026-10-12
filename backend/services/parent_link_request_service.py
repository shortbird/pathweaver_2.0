"""A platform student asks for a parent to be linked to their account.

Before 2026-10-12 a superadmin was the only way to link a parent to a student
account that already existed, and nothing in the app said so. A parent and her
15-year-old each made an account and spent a day looking for the button
(bounty report, 2026-09-09).

The flow, in three steps, each by a different person:

  1. The STUDENT names a parent email (create). Optio emails that address a
     single-use link.
  2. The PARENT opens the link and signs in, or makes an account, with that
     same address (accept). That proves the address; it does not prove the
     relationship.
  3. A SUPERADMIN approves or declines (decide). Only an approval writes a
     parent_student_links row.

Why a person decides: a linked parent approves the child's friends and the
publishing of their portfolio (utils/portfolio_access.find_approver). If the
student's invite alone made the link, a 14-year-old could name a friend's
address as "parent" and approve their own requests. Step 3 is what stops that,
so it is not an optional review.

A request is one row in parent_link_requests for its whole life
(invited -> accepted -> approved | declined, or cancelled | expired). Nothing
pending is ever written to parent_student_links, so no reader of that table has
to know this feature exists.

Only platform students use this. A school links its own families (the SIS
household), and a dependent already has the parent who made them.
"""

import hashlib
import re
import secrets
from datetime import timedelta
from typing import Any, Dict, List, Optional

from app_config import Config
from utils.logger import get_logger
from utils.timestamps import utcnow as _now

# admin client justified: a request joins a student and an adult who are not
#   yet linked, so neither can read the other's row; every entry point here is
#   gated first (student-only route, a single-use token proved by its hash, or
#   a superadmin route)
from utils.admin_client import admin_client as _admin
from repositories.parent_link_request_repository import ParentLinkRequestRepository

logger = get_logger(__name__)

EXPIRY_DAYS = 14
_EMAIL = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

STATE_AVAILABLE = 'available'
STATE_HAS_PARENT = 'has_parent'
STATE_SCHOOL = 'school'
STATE_NOT_STUDENT = 'not_student'


class ParentLinkRequestError(Exception):
    """A rule in this module said no. The message is user-facing."""


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def _name(user: Optional[Dict[str, Any]], fallback: str) -> str:
    if not user:
        return fallback
    full = f"{user.get('first_name') or ''} {user.get('last_name') or ''}".strip()
    return user.get('display_name') or full or fallback


def _first_name(user: Optional[Dict[str, Any]], fallback: str) -> str:
    if not user:
        return fallback
    return user.get('first_name') or _name(user, fallback).split(' ')[0]


def _repo() -> ParentLinkRequestRepository:
    return ParentLinkRequestRepository(client=_admin())


def _user(user_id: str, columns: str) -> Optional[Dict[str, Any]]:
    return _repo().user(user_id, columns)


def _parents_of(student: Dict[str, Any]) -> List[str]:
    """Approved parent ids, by either link. Households are a school's, and a
    platform student has none."""
    ids = []
    if student.get('managed_by_parent_id'):
        ids.append(student['managed_by_parent_id'])
    ids.extend(pid for pid in _repo().approved_parent_ids(student['id']) if pid not in ids)
    return ids


def _open_request(student_id: str) -> Optional[Dict[str, Any]]:
    row = _repo().open_for_student(student_id)
    if not row:
        return None
    if row['status'] == 'invited' and row['expires_at'] < _now().isoformat():
        _repo().update_request(row['id'], {'status': 'expired'})
        return None
    return row


def status_for_student(student_id: str) -> Dict[str, Any]:
    """What the student's "Parent or guardian" card should show."""
    student = _user(student_id, 'id, role, organization_id, is_dependent, managed_by_parent_id')
    if not student:
        raise ParentLinkRequestError('Account not found.')
    if student.get('organization_id'):
        return {'state': STATE_SCHOOL, 'parents': [], 'request': None}
    if student.get('role') != 'student':
        return {'state': STATE_NOT_STUDENT, 'parents': [], 'request': None}

    parent_ids = _parents_of(student)
    if parent_ids or student.get('is_dependent'):
        parents = _repo().users(parent_ids, 'id, first_name, last_name, display_name')
        return {
            'state': STATE_HAS_PARENT,
            'parents': [{'id': p['id'], 'name': _name(p, 'Your parent')} for p in parents],
            'request': None,
        }
    return {'state': STATE_AVAILABLE, 'parents': [], 'request': _open_request(student_id)}


def create(student_id: str, parent_email: str) -> Dict[str, Any]:
    """The student names a parent email. Replaces any open request."""
    current = status_for_student(student_id)
    if current['state'] == STATE_HAS_PARENT:
        raise ParentLinkRequestError('A parent is already linked to your account.')
    if current['state'] == STATE_SCHOOL:
        raise ParentLinkRequestError('Your school links parents to your account. Ask your school office.')
    if current['state'] != STATE_AVAILABLE:
        raise ParentLinkRequestError('Only a student account can ask for a parent.')

    email = (parent_email or '').strip().lower()
    if not _EMAIL.match(email):
        raise ParentLinkRequestError("Please enter your parent's email address.")
    student = _user(student_id, 'id, email, first_name, last_name, display_name') or {}
    if (student.get('email') or '').strip().lower() == email:
        raise ParentLinkRequestError("That is your own email. Please enter your parent's email address.")

    repo = _repo()
    repo.cancel_open(student_id)

    token = secrets.token_urlsafe(32)
    row = repo.insert({
        'student_id': student_id,
        'parent_email': email,
        'code_hash': _hash(token),
        'status': 'invited',
        'expires_at': (_now() + timedelta(days=EXPIRY_DAYS)).isoformat(),
    })

    from services.email_service import email_service
    sent = email_service.send_parent_link_request_email(
        parent_email=email,
        student_name=_name(student, 'Your student'),
        accept_url=f"{Config.FRONTEND_URL}/parent-link/{token}",
        expiry_days=EXPIRY_DAYS,
    )
    if not sent:
        logger.warning("[parent-link] invite email failed for request %s", row['id'][:8])
        # A dev machine has no SendGrid key, so the link would exist nowhere
        # and the accept page could not be tested. Never in production: the
        # token is the parent's credential.
        if Config.FLASK_ENV == 'development':
            logger.info("[parent-link] dev accept link: %s/parent-link/%s", Config.FRONTEND_URL, token)

    logger.info("[parent-link] student %s asked for a parent link", student_id[:8])
    return {key: row[key] for key in ('id', 'parent_email', 'status', 'expires_at', 'created_at')}


def cancel(student_id: str) -> None:
    _repo().cancel_open(student_id)


def _by_token(token: str) -> Dict[str, Any]:
    row = _repo().by_hash(_hash(token or ''))
    if not row:
        raise ParentLinkRequestError('This link is not valid. Ask your student to send a new one.')
    return row


def preview(token: str) -> Dict[str, Any]:
    """What the parent's landing page shows before they sign in."""
    row = _by_token(token)
    student = _user(row['student_id'], 'first_name, last_name, display_name')
    expired = row['status'] == 'invited' and row['expires_at'] < _now().isoformat()
    return {
        'student_name': _first_name(student, 'Your student'),
        'parent_email': row['parent_email'],
        'status': 'expired' if expired else row['status'],
    }


def accept(token: str, user_id: str) -> Dict[str, Any]:
    """The parent, signed in, accepts. Their address must be the one invited."""
    row = _by_token(token)
    if row['status'] == 'accepted' and row.get('parent_user_id') == user_id:
        return {'status': 'accepted'}
    if row['status'] != 'invited':
        raise ParentLinkRequestError('This link has already been used or was cancelled.')
    if row['expires_at'] < _now().isoformat():
        raise ParentLinkRequestError('This link has expired. Ask your student to send a new one.')

    user = _user(user_id, 'id, email, first_name, last_name, display_name')
    if not user:
        raise ParentLinkRequestError('Account not found.')
    if user_id == row['student_id']:
        raise ParentLinkRequestError('This link is for your parent. Please send it to them.')
    if (user.get('email') or '').strip().lower() != row['parent_email']:
        raise ParentLinkRequestError(
            f"This link is for {row['parent_email']}. Sign out and sign in with that email address."
        )

    # Conditional on status so two clicks cannot both accept.
    claimed = _repo().update_request(row['id'], {
        'status': 'accepted',
        'parent_user_id': user_id,
        'accepted_at': _now().isoformat(),
    }, only_if_status='invited')
    if not claimed:
        raise ParentLinkRequestError('This link has already been used.')

    student = _user(row['student_id'], 'id, first_name, last_name, display_name')
    _notify_superadmins(_name(user, row['parent_email']), _name(student, 'A student'))
    _notify(row['student_id'], 'Your parent accepted',
            f"{_first_name(user, 'Your parent')} accepted your request. Optio will confirm the link soon.")
    logger.info("[parent-link] request %s accepted by %s", row['id'][:8], user_id[:8])
    return {'status': 'accepted'}


def _notify(user_id: str, title: str, message: str, link: Optional[str] = None) -> None:
    try:
        from services.notification_service import NotificationService
        NotificationService().create_notification(
            user_id=user_id, notification_type='announcement',
            title=title, message=message, link=link,
        )
    except Exception as e:  # a lost notice must not undo the request
        logger.warning("[parent-link] notification to %s failed: %s", user_id[:8], e)


def _notify_superadmins(parent_name: str, student_name: str) -> None:
    """Every superadmin, in the bell and by push. The request waits on them,
    and a bounty report once waited a month because nobody was told."""
    from services.notification_service import NotificationService
    ns = NotificationService()
    for admin_id in _repo().superadmin_ids():
        try:
            ns.create_notification(
                user_id=admin_id,
                notification_type='system_alert',
                title='Parent link request',
                message=f'{parent_name} accepted the request to be linked as {student_name}\'s parent. Approve or decline it.',
                link='/admin/parent-links',
            )
        except Exception as e:
            logger.warning("[parent-link] superadmin notice failed: %s", e)


def list_for_admin() -> Dict[str, List[Dict[str, Any]]]:
    """Waiting requests first, then the last 30 days of everything else."""
    repo = _repo()
    rows = repo.created_since((_now() - timedelta(days=30)).isoformat())
    waiting = repo.waiting()
    by_id = {r['id']: r for r in waiting + rows}

    people_ids = {r['student_id'] for r in by_id.values()} | \
        {r['parent_user_id'] for r in by_id.values() if r.get('parent_user_id')}
    people = {p['id']: p for p in repo.users(
        people_ids, 'id, email, first_name, last_name, display_name, role, organization_id, date_of_birth'
    )}

    def shape(r):
        student = people.get(r['student_id'])
        parent = people.get(r.get('parent_user_id'))
        return {
            'id': r['id'],
            'status': r['status'],
            'parent_email': r['parent_email'],
            'created_at': r['created_at'],
            'accepted_at': r.get('accepted_at'),
            'decided_at': r.get('decided_at'),
            'student': student and {
                'id': student['id'], 'name': _name(student, ''), 'email': student.get('email'),
                'date_of_birth': student.get('date_of_birth'),
            },
            'parent': parent and {
                'id': parent['id'], 'name': _name(parent, ''), 'email': parent.get('email'),
                'role': parent.get('role'), 'organization_id': parent.get('organization_id'),
            },
        }

    shaped = [shape(r) for r in by_id.values()]
    return {
        'waiting': [r for r in shaped if r['status'] == 'accepted'],
        'recent': [r for r in shaped if r['status'] != 'accepted'],
    }


def decide(admin_id: str, request_id: str, approve: bool) -> Dict[str, Any]:
    """A superadmin approves (writes the link) or declines."""
    repo = _repo()
    row = repo.by_id(request_id)
    if not row:
        raise ParentLinkRequestError('Request not found.')
    if row['status'] != 'accepted':
        raise ParentLinkRequestError('Only a request the parent has accepted can be decided.')

    update = {'decided_at': _now().isoformat(), 'decided_by': admin_id}
    parent_id = row['parent_user_id']
    student = _user(row['student_id'], 'id, first_name, last_name, display_name')
    parent = _user(parent_id, 'id, first_name, last_name, display_name')
    if not parent:
        raise ParentLinkRequestError('The parent account no longer exists.')

    if not approve:
        update['status'] = 'declined'
        repo.update_request(request_id, update)
        _notify(row['student_id'], 'Parent link not approved',
                'Optio could not confirm the parent link. Contact support@optioeducation.com if this is a mistake.')
        return {'status': 'declined'}

    # The parent's role is left alone. Many adults here hold 'student'
    # (Google sign-in creates one) and use Optio for their own learning; the
    # parent role would move their home to the family dashboard and away from
    # their own quests. The link alone opens the family pages
    # (verify_family_access, userHasFamily). A parent's role was changed by
    # hand on 2026-10-12 and had to be put back for exactly this reason.
    link_id = repo.create_verified_link(
        parent_id, row['student_id'], admin_id,
        f"Student request {request_id}, accepted by the parent's email",
    )

    update.update({'status': 'approved', 'link_id': link_id})
    repo.update_request(request_id, update)

    _notify(row['student_id'], 'Your parent is linked',
            f"{_first_name(parent, 'Your parent')} is now linked to your account as your parent.")
    _notify(parent_id, 'Your account is linked',
            f"You are now linked to {_first_name(student, 'your student')} as their parent.",
            link='/family')
    logger.info("[parent-link] request %s approved by %s", request_id[:8], admin_id[:8])
    return {'status': 'approved', 'link_id': link_id}
