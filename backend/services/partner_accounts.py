"""Accounts a partner creates or finds when it registers a buyer.

Two partner doors register a student they sold something to: OnFire's course
registration (routes/admin/organization_courses.py) and a partner adding a
student to its credit class (services/partner_offering_service.py). Both have
to answer the same two questions, so the answers live here once:

  - who is the student behind this address? The purchase email is often
    already an Optio login, and not always the student's.
  - how is a brand-new student account made? A random password nobody sees,
    an unconfirmed email, and a set-your-password link sent separately.

Moved out of organization_courses.py on 2026-09-30 when the second door was
built; the bodies are unchanged.
"""

import secrets
import string

from generated.pillars import PILLAR_KEYS
from utils.logger import get_logger

logger = get_logger(__name__)

# The pillar KEYS, which is what user_skill_xp.pillar holds.
SKILL_PILLARS = list(PILLAR_KEYS)


class PartnerAccountError(Exception):
    """A refusal the caller returns to the partner as is."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def generate_unusable_password(length=32):
    """A random password for a new account that is never shown to anyone.

    Supabase requires a password at create_user time, but the student sets their
    real one through the invite link. This value is discarded the moment the
    account exists — see utils/invite_tokens.py for why we don't email it.
    """
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def display_name(user):
    """Best available name for a user row, falling back to their email."""
    name = (user.get('display_name') or '').strip()
    if not name:
        name = f"{user.get('first_name') or ''} {user.get('last_name') or ''}".strip()
    return name or user.get('email') or 'Unnamed student'


def effective_role(user):
    """The real role, whether the account is platform-side or org-managed.

    Mirrors get_effective_role(): an org member carries 'org_managed' in `role`
    and their real role in `org_role`. See the roles table in CLAUDE.md.
    """
    if (user.get('role') or '') == 'org_managed':
        return user.get('org_role') or ''
    return user.get('role') or ''


def students_behind_email(repo, account):
    """The student accounts a partner may enrol on behalf of an existing login.

    A partner sells a course to a family and types the address the purchase came
    from. That address is often already an Optio login, and it is not always the
    student's:

      - the student themselves -> that one account
      - a parent or guardian    -> the children on their account, found through
        parent_student_links (the platform link) and household_members (the SIS
        one, which is how an org-managed family is put together)
      - anyone else (advisor, org_admin, observer, superadmin) -> nothing. A
        course enrolment on a staff account puts a child's work on an adult's
        login, and a partner has no business touching staff.

    Returns a list of {id, name, relationship} with the student's own account
    first. Never returns the parent's own account.
    """
    role = effective_role(account)

    if role == 'student':
        return [{
            'id': account['id'],
            'name': display_name(account),
            'relationship': 'self'
        }]

    if role != 'parent':
        return []

    # A SIS family is assembled out of households, not parent_student_links, so
    # a guardian can have children the link table has never heard of. Elvia
    # Labrador on 2026-09-22 was exactly this: a guardian row and a student row
    # in one household, no link row, and the partner form dead-ended.
    child_ids = repo.linked_student_ids(account['id'])
    if not child_ids:
        return []

    by_id = repo.accounts_by_ids(child_ids)

    # A household row says 'student' about its relationship, not about the
    # account, so confirm the role on the user row itself before offering it.
    return [
        {'id': cid, 'name': display_name(by_id[cid]), 'relationship': 'child'}
        for cid in child_ids
        if cid in by_id and effective_role(by_id[cid]) == 'student'
    ]


def create_invited_student(client, *, email, first_name, last_name, dob_iso=None,
                           requires_parental_consent=False, organization_id=None,
                           created_via):
    """Create a student login the student activates through an invite link.

    With organization_id the student is org-managed in that org (OnFire's
    course buyers); without it they are a platform student (a credit-class
    buyer, whose class belongs to them and not to the partner's org).

    The auth account is created with an unusable password and an unconfirmed
    email, so a mistyped address never becomes a working login. If the profile
    row cannot be written the auth account is deleted again. Returns the users
    row; raises PartnerAccountError.
    """
    metadata = {'first_name': first_name, 'last_name': last_name, 'created_via': created_via}
    if organization_id:
        metadata['organization_id'] = organization_id
    try:
        auth_response = client.auth.admin.create_user({
            'email': email,
            'password': generate_unusable_password(),
            'email_confirm': False,
            'user_metadata': metadata,
        })
    except Exception as auth_error:
        error_str = str(auth_error).lower()
        if 'already registered' in error_str or 'already exists' in error_str:
            raise PartnerAccountError(
                f'An account already exists for {email}. Try again, or use the enrollment manager.',
                409) from auth_error
        logger.error(f"Failed to create auth account for {email}: {auth_error}")
        raise PartnerAccountError('Failed to create student account', 500) from auth_error

    if not auth_response.user:
        raise PartnerAccountError('Failed to create student account', 500)
    user_id = auth_response.user.id

    user_data = {
        'id': user_id,
        'email': email,
        'first_name': first_name,
        'last_name': last_name,
        'display_name': f"{first_name} {last_name}",
        'total_xp': 0,
        'level': 1,
        'streak_days': 0
    }
    if organization_id:
        user_data.update({'organization_id': organization_id, 'role': 'org_managed',
                          'org_role': 'student'})
    else:
        user_data['role'] = 'student'
    if dob_iso:
        user_data['date_of_birth'] = dob_iso
    if requires_parental_consent:
        user_data['requires_parental_consent'] = True

    try:
        profile_result = client.table('users').insert(user_data).execute()
        if not profile_result.data:
            raise Exception('Profile insert returned no data')
        user_record = profile_result.data[0]
    except Exception as profile_error:
        try:
            client.auth.admin.delete_user(user_id)
        except Exception as cleanup_error:
            logger.warning(f"Failed to clean up auth user {user_id} after profile failure: {cleanup_error}")
        logger.error(f"Failed to create profile for {email}: {profile_error}")
        raise PartnerAccountError('Failed to create student profile', 500) from profile_error

    # Initialize skill XP rows (best-effort)
    try:
        # ignore_duplicates: these rows carry xp_amount 0 and a plain
        # upsert OVERWRITES on conflict, so a re-run would zero a real
        # balance. See routes/auth/login/security.py for the full note.
        client.table('user_skill_xp').upsert(
            [{'user_id': user_id, 'pillar': pillar, 'xp_amount': 0} for pillar in SKILL_PILLARS],
            on_conflict='user_id,pillar', ignore_duplicates=True
        ).execute()
    except Exception as skill_error:
        logger.warning(f"Failed to initialize skill XP for {user_id}: {skill_error}")

    return user_record
