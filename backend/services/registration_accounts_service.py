"""Registration funnel: making the accounts, and the email OTP that proves them.

Split out of routes/registration_funnel.py on 2026-09-03 (QB-04), which was
2,149 lines and carried the last standing exemption from the 1,400-line route
cap.

Everything here creates or finds a person: the parent account, the org student
account, the COPPA dependent, the match against an account that already exists,
and the 6-digit code emailed to prove the parent owns the address. Two separate
route modules need them -- the entry steps (/start, /verify, /login) and the
family step, which creates the kids -- so they cannot live in either one.

The account-matching rules are load-bearing and documented in
routes/registration_funnel.py's module docstring: a kid's email matching an
existing Optio student ATTACHES that account rather than blocking or
duplicating it, and accounts in another org or linked to a different parent
still refuse. Read that before changing anything here.
"""

import hashlib
import secrets
from datetime import datetime, timedelta

from dateutil.relativedelta import relativedelta

from services.email_service import email_service
from utils.logger import get_logger

logger = get_logger(__name__)

OTP_TTL_MINUTES = 10


def _email_exists(admin, email):
    r = admin.table('users').select('id').eq('email', email).execute()
    return bool(r.data)


def _password_ok(email, password):
    """Verify an account password WITHOUT touching the shared clients.

    sign_in_with_password mutates whichever client it's called on — its PostgREST
    auth becomes the signed-in USER's JWT, which silently breaks the admin
    client's service-role RLS bypass for the rest of the request. Use a
    throwaway client instead.
    """
    from supabase import create_client
    from app_config import Config
    try:
        c = create_client(Config.SUPABASE_URL, Config.SUPABASE_ANON_KEY)
        ok = bool(c.auth.sign_in_with_password({'email': email, 'password': password}).user)
        try:
            c.auth.sign_out()
        except Exception as _exc:  # noqa: BLE001
            logger.debug("sign-out of the temp session failed: %s", _exc, exc_info=True)
        return ok
    except Exception:  # noqa: BLE001
        return False


def _insert_user_with_retry(admin, profile):
    """Upsert a users row, retrying transient auth-FK races (mirrors accept_invitation)."""
    import time
    delay = 0.5
    for attempt in range(3):
        try:
            admin.table('users').upsert(profile, on_conflict='id').execute()
            return True
        except Exception as e:  # noqa: BLE001
            msg = str(e).lower()
            if ('foreign key' in msg or '23503' in msg) and attempt < 2:
                time.sleep(delay)
                delay *= 2
                continue
            raise
    return False


def _create_org_parent(admin, org_id, email, password, first, last):
    """Create the parent auth user + org_managed/parent profile. Email verification
    happens through this funnel's own OTP (not Supabase's confirmation email)."""
    auth = admin.auth.admin.create_user({
        'email': email,
        'password': password,
        'email_confirm': False,
        'user_metadata': {'first_name': first, 'last_name': last},
    })
    if not auth.user:
        raise RuntimeError('Failed to create parent account')
    uid = auth.user.id
    profile = {
        'id': uid,
        'email': email,
        'first_name': first,
        'last_name': last,
        'display_name': f'{first} {last}'.strip(),
        'role': 'org_managed',
        'org_role': 'parent',
        'org_roles': ['parent'],
        'organization_id': org_id,
    }
    _insert_user_with_retry(admin, profile)
    return uid


def _create_org_student(admin, org_id, email, first, last, dob):
    """Create a 13+ kid's own org_managed/student account. Sends a set-password email."""
    auth = admin.auth.admin.create_user({
        'email': email,
        'password': secrets.token_urlsafe(18),  # placeholder; kid sets their own via email
        'email_confirm': False,
        'user_metadata': {'first_name': first, 'last_name': last},
    })
    if not auth.user:
        raise RuntimeError('Failed to create student account')
    uid = auth.user.id
    profile = {
        'id': uid,
        'email': email,
        'first_name': first,
        'last_name': last,
        'display_name': f'{first} {last}'.strip(),
        'role': 'org_managed',
        'org_role': 'student',
        'org_roles': ['student'],
        'organization_id': org_id,
    }
    if dob:
        profile['date_of_birth'] = str(dob)
    _insert_user_with_retry(admin, profile)
    try:
        admin.auth.resend({'type': 'signup', 'email': email})
    except Exception as e:  # noqa: BLE001
        logger.warning(f'registration: student verification email failed for {email}: {e}')
    return uid


def _existing_account_for_kid(admin, org_id, parent_id, email):
    """Look up an existing account behind a kid's email and decide whether this
    funnel may ATTACH it to the family instead of creating a new one.

    Attachable: a student account (platform `student`, or this org's
    org_managed/student — e.g. school-imported before the funnel existed) that is
    not a dependent and not parent-linked to a DIFFERENT parent. A parent must
    never be able to claim an arbitrary account: anything in another org, any
    non-student account, and any account already claimed by another parent
    refuses.

    Returns (user_row, None) when attachable, (None, None) when the email is
    unused, and (None, reason) when an account exists but cannot be attached.
    """
    rows = (admin.table('users')
            .select('id, role, org_role, organization_id, is_dependent, '
                    'first_name, last_name, display_name, date_of_birth')
            .eq('email', email).limit(1).execute()).data or []
    if not rows:
        return None, None
    u = rows[0]
    # The parent reused their OWN email for a 13+ teen (a common slip). That's
    # not a child account to attach — surface a clear, self-serve fix upstream.
    if u['id'] == parent_id:
        return None, 'is_parent'
    if u.get('role') == 'superadmin' or u.get('is_dependent'):
        return None, 'not_attachable'
    if u.get('organization_id') and u['organization_id'] != org_id:
        return None, 'other_org'
    effective = u.get('org_role') if u.get('organization_id') else u.get('role')
    if effective != 'student':
        return None, 'not_student'
    links = (admin.table('parent_student_links').select('parent_user_id')
             .eq('student_user_id', u['id']).execute()).data or []
    if any(l['parent_user_id'] != parent_id for l in links):
        return None, 'other_parent'
    return u, None


def _match_existing_dependent(dependents, first, last, dob):
    """Find this parent's OWN pre-existing dependent matching a submitted kid.
    Name match (case-insensitive) plus DOB when the dependent has one on file.
    Safe on name alone because the pool is limited to the parent's dependents."""
    for d in dependents:
        if ((d.get('first_name') or '').strip().lower() == first.lower()
                and (d.get('last_name') or '').strip().lower() == last.lower()):
            ddob = str(d.get('date_of_birth') or '')[:10]
            if not ddob or ddob == str(dob):
                return d
    return None


def _existing_org_student_by_name_dob(admin, org_id, parent_id, first, last, dob):
    """Find a pre-existing student account matching this kid by name + DOB,
    attachable to the family. Guards against the re-registration duplicate: a kid
    whose pre-existing Optio account the parent re-enters as a brand-new child
    because the funnel matched only on email.

    The candidate pool is kept SAFE — a self-service parent must never claim an
    arbitrary account — so it is limited to:
      - this org's OWN students at that DOB (school-imported roster), and
      - the parent's OWN already-linked students (covers a platform account the
        parent already has for their kid, e.g. an existing Optio family).
    There is no platform-wide name search. Each candidate must additionally be:
      - an actual student account, not a dependent (the parent's own dependents
        are handled by _match_existing_dependent),
      - not in a DIFFERENT org,
      - an EXACT DOB + name match (so twins never collide — their names differ),
      - not already parent-linked to a DIFFERENT parent.
    Returns the user row to attach, or None.
    """
    if not dob:
        return None
    fields = ('id, role, org_role, organization_id, is_dependent, '
              'first_name, last_name, display_name, date_of_birth')
    pool = (admin.table('users').select(fields)
            .eq('organization_id', org_id)
            .eq('date_of_birth', str(dob)).execute()).data or []
    own_links = (admin.table('parent_student_links').select('student_user_id')
                 .eq('parent_user_id', parent_id).execute()).data or []
    own_ids = [l.get('student_user_id') for l in own_links if l.get('student_user_id')]
    if own_ids:
        pool = pool + ((admin.table('users').select(fields)
                        .in_('id', own_ids).execute()).data or [])
    seen = set()
    for u in pool:
        if u['id'] in seen:
            continue
        seen.add(u['id'])
        if u.get('is_dependent'):
            continue
        if str(u.get('date_of_birth') or '')[:10] != str(dob):
            continue
        if (u.get('first_name') or '').strip().lower() != first.lower():
            continue
        if (u.get('last_name') or '').strip().lower() != last.lower():
            continue
        if u.get('organization_id') and u['organization_id'] != org_id:
            continue  # never pull a kid out of another school
        effective = u.get('org_role') if u.get('organization_id') else u.get('role')
        if effective != 'student':
            continue
        links = (admin.table('parent_student_links').select('parent_user_id')
                 .eq('student_user_id', u['id']).execute()).data or []
        if any(l['parent_user_id'] != parent_id for l in links):
            continue
        return u
    return None


def _attach_existing_student(admin, org_id, kid, kid_first, kid_last, dob):
    """Normalize a pre-existing student account into this org so it ends up
    exactly like a funnel-created one: org_managed/student in the org, parent's
    spelling of the name, and the DOB the parent provided. Never touches auth."""
    updates = {
        'organization_id': org_id,
        'role': 'org_managed',
        'org_role': 'student',
        'org_roles': ['student'],
        'first_name': kid_first,
        'last_name': kid_last,
    }
    if dob:
        updates['date_of_birth'] = str(dob)
    if not kid.get('display_name'):
        updates['display_name'] = f'{kid_first} {kid_last}'.strip()
    admin.table('users').update(updates).eq('id', kid['id']).execute()
    return kid['id']


def _create_dependent(admin, parent_id, org_id, first, last, dob):
    """Create a COPPA dependent kid on the parent's account (no email)."""
    placeholder = f'dependent_{secrets.token_hex(16)}@optio-internal-placeholder.local'
    auth = admin.auth.admin.create_user({
        'email': placeholder,
        'email_confirm': False,
        'user_metadata': {'is_dependent': True, 'managed_by_parent_id': parent_id},
        'app_metadata': {'provider': 'dependent', 'providers': ['dependent']},
    })
    if not auth.user:
        raise RuntimeError('Failed to create child profile')
    uid = auth.user.id
    profile = {
        'id': uid,
        'first_name': first,
        'last_name': last,
        'display_name': f'{first} {last}'.strip(),
        'date_of_birth': str(dob) if dob else None,
        'is_dependent': True,
        'managed_by_parent_id': parent_id,
        'promotion_eligible_at': str(dob + relativedelta(years=13)) if dob else None,
        # Full org-student shape, matching _create_org_student and
        # DependentRepository.create_dependent. role='student' with no org_role
        # is the exact shape 20260826110000_normalize_org_student_roles.sql had
        # to clean up — org_role-only queries skip such accounts and the
        # school's student counts drift apart again with every registration.
        'role': 'org_managed',
        'org_role': 'student',
        'org_roles': ['student'],
        'email': None,
        'organization_id': org_id,
    }
    _insert_user_with_retry(admin, profile)
    return uid


# ── OTP helpers ──────────────────────────────────────────────────────────────


def _hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _issue_otp(admin, reg_id: str) -> str:
    """Generate a fresh 6-digit code, store its hash + expiry, return the code."""
    code = f'{secrets.randbelow(1000000):06d}'
    admin.table('registrations').update({
        'otp_hash': _hash_otp(code),
        'otp_expires_at': (datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES)).isoformat(),
        'otp_attempts': 0,  # fresh code resets the failed-attempt counter
        'updated_at': datetime.utcnow().isoformat(),
    }).eq('id', reg_id).execute()
    return code


def _send_otp_email(email: str, first: str, org_name: str, code: str) -> bool:
    html = (
        f"<p>Hi {first or 'there'},</p>"
        f"<p>Your {org_name} registration code is:</p>"
        f"<p style=\"font-size:32px;font-weight:bold;letter-spacing:6px;\">{code}</p>"
        f"<p>Enter it on the registration page to confirm your email. "
        f"It expires in {OTP_TTL_MINUTES} minutes.</p>"
        f"<p>If you didn't request this, you can ignore this email.</p>"
    )
    try:
        return email_service.send_email(email, f'{org_name}: your registration code', html)
    except Exception as e:  # noqa: BLE001
        logger.error(f'registration: OTP email failed for {email}: {e}')
        return False
