"""
Parent-created student accounts for teens (13+).

The under-13 case is COPPA-shaped and already lives in DependentRepository:
no email, no login, parent manages everything. This module is its sibling for
teens — a real account the teen logs into with their own email, created BY the
parent and linked to them, so a family never depends on the teen to sign
themselves up.

Mirrors what the registration funnel does for a 13+ kid
(routes/icreate_registration.py::_create_org_student): create the auth user
unconfirmed with a throwaway password, insert the profile, send the
set-password/verification email, and link the parent. Org parents produce org
students (organization_id inherited, org_managed/student); platform parents
produce platform students.

Refuses rather than guesses: under-13 goes to the dependent path, an email that
already has an account is reported back so the caller can tell the parent to use
the school's connect flow instead of silently claiming a stranger's account.
"""

import secrets
import time
from datetime import date, datetime
from typing import Any, Dict, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

# Matches the staff invite window: long enough that a teen who ignores the mail
# for a week can still use it, short enough that a stale link isn't a live key.
INVITE_EXPIRY_DAYS = 14


def _admin():
    # admin client justified: creates an auth user + profile for a teen on behalf
    # of their verified parent; no user session exists for the child being made.
    return get_supabase_admin_client()


def calculate_age(dob: date, today: Optional[date] = None) -> int:
    today = today or datetime.utcnow().date()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _insert_profile_with_retry(admin, profile: Dict[str, Any], attempts: int = 3) -> None:
    """The auth user isn't always visible to PostgREST immediately, so a FK
    violation here is usually a race, not a bad row."""
    delay = 0.5
    for attempt in range(attempts):
        try:
            admin.table('users').upsert(profile, on_conflict='id').execute()
            return
        except Exception as e:  # noqa: BLE001
            err = str(e).lower()
            is_fk = 'foreign key' in err or '23503' in err
            if is_fk and attempt < attempts - 1:
                time.sleep(delay)
                delay *= 2
                continue
            raise


def create_teen_student(parent: Dict[str, Any], first_name: str, last_name: str,
                        email: str, date_of_birth: date) -> Dict[str, Any]:
    """Create a 13+ student account owned by the teen but made by the parent.

    `parent` is the parent's users row (needs id and organization_id).
    Returns {'student': {...}} or {'error': str, 'code': str}.
    """
    email = (email or '').strip().lower()
    first_name = (first_name or '').strip()
    last_name = (last_name or '').strip()

    if not first_name or not last_name:
        return {'error': 'First and last name are required', 'code': 'name_required'}
    if not email:
        return {'error': 'An email address is required for students 13 and older',
                'code': 'email_required'}

    age = calculate_age(date_of_birth)
    if age < 13:
        return {'error': 'Children under 13 get a managed child profile, not their own login',
                'code': 'under_13'}

    admin = _admin()

    existing = (admin.table('users').select('id, email')
                .eq('email', email).limit(1).execute()).data or []
    if existing:
        # Never claim an account that already exists — it may be a stranger's,
        # or the teen's own account that should be connected, not recreated.
        return {'error': 'An Optio account already uses that email. Ask your school to '
                         'connect it to your family instead.',
                'code': 'email_taken'}

    org_id = parent.get('organization_id')
    auth_user = admin.auth.admin.create_user({
        'email': email,
        # Placeholder: the teen sets their own password from the email below.
        'password': secrets.token_urlsafe(18),
        'email_confirm': False,
        'user_metadata': {'first_name': first_name, 'last_name': last_name},
    })
    if not auth_user or not auth_user.user:
        return {'error': 'Failed to create the student account', 'code': 'auth_failed'}

    student_id = auth_user.user.id
    profile: Dict[str, Any] = {
        'id': student_id,
        'email': email,
        'first_name': first_name,
        'last_name': last_name,
        'display_name': f'{first_name} {last_name}'.strip(),
        'date_of_birth': str(date_of_birth),
    }
    if org_id:
        profile.update({'role': 'org_managed', 'org_role': 'student',
                        'org_roles': ['student'], 'organization_id': org_id})
    else:
        profile['role'] = 'student'

    try:
        _insert_profile_with_retry(admin, profile)
    except Exception as e:  # noqa: BLE001
        logger.error(f'create_teen_student: profile insert failed for {student_id[:8]}: {e}')
        return {'error': 'Could not finish creating the account. Please try again.',
                'code': 'profile_failed'}

    try:
        from services.portfolio_service import PortfolioService
        PortfolioService(client=admin).get_or_create_diploma(student_id)
    except Exception as e:  # noqa: BLE001 — cosmetic setup, never fail the create
        logger.warning(f'create_teen_student: diploma init failed: {e}')

    invite_sent = send_account_invite(student_id, email, first_name, parent, org_id, admin=admin)

    _link_parent(admin, parent['id'], student_id)

    return {'student': {
        'id': student_id,
        'first_name': first_name,
        'last_name': last_name,
        'display_name': profile['display_name'],
        'email': email,
        'organization_id': org_id,
        'invite_sent': invite_sent,
    }}


def send_account_invite(student_id: str, email: str, first_name: str,
                        parent: Dict[str, Any], org_id: Optional[str],
                        admin=None) -> bool:
    """Email the teen a link that sets their password AND confirms their email.

    Not the Supabase signup code: that emails a 6-digit OTP the teen has no
    logged-out page to enter, on an account whose password is a random string
    nobody knows — a guaranteed dead end. This mints the same
    password_reset_tokens row the staff invite uses (/api/auth/reset-password
    confirms the email when the token is consumed), so one click gets the teen
    all the way in.
    """
    import secrets as _secrets
    from datetime import timedelta, timezone
    from urllib.parse import quote

    from app_config import Config
    from services.email_service import email_service

    # Callers mid-create pass the client they're already holding; the resend
    # route calls in cold.
    admin = admin or _admin()

    now = datetime.now(timezone.utc)
    token = _secrets.token_urlsafe(32)
    try:
        # Store the hash, email the token (utils/reset_tokens.py).
        from utils.reset_tokens import hash_reset_token
        admin.table('password_reset_tokens').insert({
            'user_id': student_id,
            'token': hash_reset_token(token),
            'expires_at': (now + timedelta(days=INVITE_EXPIRY_DAYS)).isoformat(),
            'used': False,
            'created_at': now.isoformat(),
        }).execute()
    except Exception as e:  # noqa: BLE001
        logger.error(f'send_account_invite: token insert failed for {student_id[:8]}: {e}')
        return False

    parent_name = (parent.get('first_name') or parent.get('display_name') or 'A parent').strip()
    org_name = ''
    if org_id:
        try:
            row = (admin.table('organizations').select('name')
                   .eq('id', org_id).maybe_single().execute()).data
            org_name = (row or {}).get('name') or ''
        except Exception:  # noqa: BLE001 — the org name is decoration in the email
            org_name = ''

    link = f'{Config.FRONTEND_URL}/reset-password?token={token}&email={quote(email)}'
    try:
        return email_service.send_student_account_invite_email(
            user_email=email,
            user_name=first_name or 'there',
            parent_name=parent_name,
            invite_link=link,
            org_name=org_name,
            expiry_days=INVITE_EXPIRY_DAYS,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f'send_account_invite: email failed for {email}: {e}')
        return False


def _link_parent(admin, parent_id: str, student_id: str) -> None:
    """Approved + admin_verified: the parent created this account, so the
    relationship is established at creation, not pending anyone's approval."""
    try:
        existing = (admin.table('parent_student_links').select('id')
                    .eq('parent_user_id', parent_id)
                    .eq('student_user_id', student_id).execute()).data
        if not existing:
            admin.table('parent_student_links').insert({
                'parent_user_id': parent_id,
                'student_user_id': student_id,
                'status': 'approved',
                'admin_verified': True,
                'admin_notes': 'Parent-created teen account',
            }).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'_link_parent: {parent_id[:8]}->{student_id[:8]} failed: {e}')
