"""
Adding a parent to a family from the SIS, when that parent has no account yet.

The family record's "+ Add member" connects a person the school already has,
and its email lookup is students-only. The parent invitation that could make a
new account lives on the older org People tab, and accepting it only writes
parent links -- the parent never joins the family, so the SIS family view,
family messages and billing do not know them. On 2026-09-30 iCreate had a
father (Andrew Larson) who wanted his own login next to his wife's, and the
office had no door for it, so the request came to Optio by email.

This is that door, shaped like the office's "Add a child"
(family_student_service.add_child_to_household) and the teacher invite
(sis_service.create_org_teacher): the account is made now, unconfirmed, with a
throwaway password; the parent joins the family through the one attach path
(sis_attach_service.attach_guardian), which also links them to every child
already in it; and they get one email whose link sets their password and
confirms the address in a single click (utils/invite_tokens.py).

Refuses rather than guesses on an email that already has an account:
  - a grown-up already at this school is connected to the family, no email;
  - a student at this school is refused -- a child is not a guardian;
  - an account anywhere else is refused. Claiming it would move a person
    between schools or rewrite a platform parent's role, which is the same line
    the partner enrollment door holds.
"""

import secrets
from typing import Any, Dict

from utils.logger import get_logger

logger = get_logger(__name__)

# admin client justified: creates an auth user + profile for a parent on behalf
# of the school's office; no session exists for the person being made.
from utils.admin_client import admin_client as _admin


def send_guardian_invite(user_id: str, email: str, first_name: str,
                         org_id: str, household_name: str, admin=None) -> bool:
    """Email the parent a link that sets their password and confirms their email."""
    from urllib.parse import quote

    from app_config import Config
    from services.email_service import email_service
    from services.sis_service import _org_name
    from utils.invite_tokens import INVITE_EXPIRY_DAYS, mint_invite_token

    admin = admin or _admin()
    token = mint_invite_token(user_id, admin=admin)
    if not token:
        return False
    link = f'{Config.FRONTEND_URL}/reset-password?token={token}&email={quote(email)}'
    try:
        return email_service.send_guardian_account_invite_email(
            user_email=email,
            user_name=first_name or 'there',
            org_name=_org_name(org_id),
            family_name=household_name or '',
            invite_link=link,
            expiry_days=INVITE_EXPIRY_DAYS,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f'send_guardian_invite: email failed for {email}: {e}')
        return False


def _create_org_parent(admin, org_id: str, email: str, first: str, last: str) -> str:
    """The auth user, unconfirmed with a password nobody knows, and the
    org_managed/parent profile. The invite email is what makes it usable."""
    from services.family_student_service import _insert_profile_with_retry

    auth = admin.auth.admin.create_user({
        'email': email,
        'password': secrets.token_urlsafe(18),
        'email_confirm': False,
        'user_metadata': {'first_name': first, 'last_name': last},
    })
    if not auth or not auth.user:
        raise RuntimeError('Failed to create the parent account')
    uid = auth.user.id
    _insert_profile_with_retry(admin, {
        'id': uid,
        'email': email,
        'first_name': first,
        'last_name': last,
        'display_name': f'{first} {last}'.strip(),
        'role': 'org_managed',
        'org_role': 'parent',
        'org_roles': ['parent'],
        'organization_id': org_id,
    })
    return uid


def add_guardian_to_household(org_id: str, household_id: str, actor_id: str,
                              data: Dict[str, Any]) -> Dict[str, Any]:
    """The office's "Add a parent" on a family. See the module docstring.

    Returns {'kind': 'invited'|'connected', 'member', 'invite_sent'} or
    {'error', 'status'}.
    """
    from repositories.household_repository import HouseholdRepository
    from repositories.user_repository import UserRepository
    from services import sis_attach_service, sis_person_service

    admin = _admin()
    household = HouseholdRepository(client=admin).find_by_id(household_id)
    if not household or household.get('organization_id') != org_id:
        return {'error': 'Household not found', 'status': 404}

    first_name = (data.get('first_name') or '').strip()
    last_name = (data.get('last_name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    if not first_name or not last_name:
        return {'error': 'First and last name are required', 'status': 400}
    if not email or '@' not in email or '.' not in email.split('@')[-1]:
        return {'error': 'A valid email address is required', 'status': 400}

    user = UserRepository(client=admin).find_by_email(email)
    if user:
        if user.get('organization_id') != org_id:
            return {'error': 'An Optio account already uses that email outside this '
                             'school. Email support@optioeducation.com and we will '
                             'connect it.',
                    'code': 'email_taken', 'status': 409}
        if user.get('org_role') == 'student' or 'student' in (user.get('org_roles') or []):
            return {'error': 'That email belongs to a student at this school.',
                    'code': 'is_student', 'status': 409}
        rows = sis_attach_service.attach_guardian(
            org_id, user['id'], household_id, source='add_parent')
        sis_person_service.audit_removal(
            org_id, actor_id, 'sis_household_guardian_added', 'household', household_id,
            {'household_name': household.get('name'), 'guardian_user_id': user['id'],
             'kind': 'connected'})
        return {'kind': 'connected', 'member': rows[0] if rows else None,
                'invite_sent': False}

    try:
        uid = _create_org_parent(admin, org_id, email, first_name, last_name)
    except Exception as e:  # noqa: BLE001
        logger.error(f'sis add-parent: create failed for household {household_id}: {e}')
        return {'error': 'Could not create the account. Please try again.', 'status': 400}

    rows = sis_attach_service.attach_guardian(org_id, uid, household_id, source='add_parent')
    invite_sent = send_guardian_invite(uid, email, first_name, org_id,
                                       household.get('name') or '', admin=admin)
    sis_person_service.audit_removal(
        org_id, actor_id, 'sis_household_guardian_added', 'household', household_id,
        {'household_name': household.get('name'), 'guardian_user_id': uid,
         'kind': 'invited'})
    logger.info(f'sis add-parent: {uid[:8]} joined household {household_id[:8]} '
                f'at org {org_id[:8]} (invite_sent={invite_sent})')
    return {'kind': 'invited', 'member': rows[0] if rows else None,
            'invite_sent': invite_sent}
