"""
Adding a child to a family, outside the registration funnel.

Two doors reach this module and they make the same child: the parent's own
"Add a child" in Family Settings, and the office's "Add a child" on a family in
the SIS. `create_child` is the age split both of them run — under 13 is the
COPPA-shaped managed profile DependentRepository owns (no email, no login);
13+ is the teen's own account, created here and linked to the parent, so a
family never depends on the teen to sign themselves up. Neither door asks the
caller to classify their own child.

`add_child_to_household` is the office's door in full: it was added on
2026-09-18 because there was no way to add a child a family had left off their
registration. Staff could connect an account that already existed and nothing
anywhere could create one, while the funnel refuses a completed registration
("This registration is already completed"), so a family who forgot a child at
registration had no path that did not involve re-registering.

Mirrors what the registration funnel does for a 13+ kid
(services/registration_accounts_service._create_org_student): create the auth user
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
from typing import Any, Dict, List, Optional

from repositories.dependent_repository import DependentRepository
from utils.logger import get_logger

logger = get_logger(__name__)

# Matches the staff invite window: long enough that a teen who ignores the mail
# for a week can still use it, short enough that a stale link isn't a live key.
INVITE_EXPIRY_DAYS = 14


# admin client justified: creates an auth user + profile for a teen on behalf
# of their verified parent; no user session exists for the child being made.
from utils.admin_client import admin_client as _admin


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


def create_child(parent: Dict[str, Any], first_name: str, last_name: str,
                 date_of_birth: date, email: str = '',
                 avatar_url: Optional[str] = None) -> Dict[str, Any]:
    """Make one child account for a family. Age decides the shape.

    `parent` is the guardian's users row (needs id and organization_id): the
    child inherits the school, and under 13 the parent is who manages the
    profile. Returns {'kind': 'dependent'|'student', 'child': <users row>,
    'invite_sent': bool}, or {'error': str, 'code': str} — a 13+ child with no
    email is refused rather than quietly made managed, because "they have a
    login" and "their parent runs the account" are not the same thing to say
    to a family later.
    """
    if calculate_age(date_of_birth) >= 13:
        result = create_teen_student(parent, first_name, last_name, email, date_of_birth)
        if result.get('error'):
            return result
        return {'kind': 'student', 'child': result['student'],
                'invite_sent': bool(result['student'].get('invite_sent'))}

    dependent = DependentRepository(client=_admin()).create_dependent(
        parent_id=parent['id'],
        display_name=f'{first_name} {last_name}'.strip(),
        date_of_birth=date_of_birth,
        avatar_url=avatar_url,
    )
    return {'kind': 'dependent', 'child': dependent, 'invite_sent': False}


def _household_guardians(household: Dict[str, Any], members: List[Dict[str, Any]]) -> List[str]:
    """The family's adults, primary contact first — the order that decides who
    a managed child profile belongs to."""
    guardians = [m['user_id'] for m in members if m.get('relationship') != 'student']
    primary = household.get('primary_contact_user_id')
    if primary in guardians:
        guardians = [primary] + [g for g in guardians if g != primary]
    return guardians


def add_child_to_household(org_id: str, household_id: str, actor_id: str,
                           data: Dict[str, Any]) -> Dict[str, Any]:
    """The office's "Add a child" on a family. See the module docstring for why.

    Returns the created child on success, or {'error', 'status'} — including
    the 409 {'needs_confirmation', 'duplicates'} the connect-an-account door
    already returns, so the same "add anyway?" prompt covers both.

    Deliberately not enrolled: this writes the family, not the school's
    enrollment record. Assigning a student, like waitlisting one, stays where
    staff already do it (PATCH /api/sis/enrollments/<student_id>, the
    enrollment waitlist page) — adding a sibling to a family should not quietly
    put a seat and an invoice behind them.
    """
    from repositories.household_repository import HouseholdRepository
    from repositories.user_repository import UserRepository
    from services import sis_person_service, sis_service
    from services.registration_identity_service import parse_dob

    admin = _admin()
    household_repo = HouseholdRepository(client=admin)
    household = household_repo.find_by_id(household_id)
    if not household or household.get('organization_id') != org_id:
        return {'error': 'Household not found', 'status': 404}

    first_name = (data.get('first_name') or '').strip()
    last_name = (data.get('last_name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    date_of_birth = parse_dob(data.get('date_of_birth'))
    if not first_name or not last_name:
        return {'error': 'First and last name are required', 'status': 400}
    if not date_of_birth:
        return {'error': 'A date of birth is required (YYYY-MM-DD)', 'status': 400}

    members = household_repo.members_for_households([household_id])
    guardians = _household_guardians(household, members)
    if not guardians:
        return {'error': 'Add a parent to this family first — a child account is '
                         'created under their guardian.',
                'code': 'no_guardian', 'status': 400}

    # The same look-alike warning the connect-an-account door gives, asked
    # before the account exists: adding a child to a family is exactly where
    # the same kid gets entered twice.
    if not data.get('confirm_duplicate'):
        duplicates = sis_service.find_household_duplicates(
            org_id, household_id,
            candidate={'first_name': first_name, 'last_name': last_name,
                       'date_of_birth': str(date_of_birth)})
        if duplicates:
            names = ', '.join(d['name'] for d in duplicates)
            return {'needs_confirmation': True, 'duplicates': duplicates, 'status': 409,
                    'error': f'This family already includes {names}, which looks like the '
                             'same child. They may have been registered twice. Add anyway?'}

    guardian_id = guardians[0]
    parent = UserRepository(client=admin).find_by_ids(
        [guardian_id], 'id, first_name, last_name, display_name, organization_id'
    ).get(guardian_id)
    if not parent:
        return {'error': 'Household not found', 'status': 404}
    # The family belongs to this school, so the child does, whatever the
    # guardian's own row says — a guardian imported without an organization_id
    # would otherwise mint a platform account inside a school's family.
    parent = {**parent, 'organization_id': org_id}

    try:
        result = create_child(parent, first_name, last_name, date_of_birth, email=email)
    except Exception as e:  # noqa: BLE001 — the dependent path raises where the teen path returns
        logger.error(f'sis add-child: create failed for household {household_id}: {e}')
        return {'error': 'Could not create the account. Please try again.', 'status': 400}
    if result.get('error'):
        return {**result, 'status': 400}

    child = result['child']
    sis_person_service.place_child_in_family(org_id, child['id'], guardian_id,
                                             household_id=household_id)
    sis_person_service.audit_removal(
        org_id, actor_id, 'sis_household_child_added', 'household', household_id,
        {'household_name': household.get('name'), 'child_user_id': child['id'],
         'kind': result['kind']})
    logger.info(f'sis add-child: {result["kind"]} {child["id"][:8]} joined household '
                f'{household_id[:8]} at org {org_id[:8]}')
    return {'kind': result['kind'], 'child': child,
            'invite_sent': result['invite_sent'], 'household_id': household_id}
