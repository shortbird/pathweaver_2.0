"""
iCreate parent registration funnel (iCreate org only).

Branded, multi-step parent onboarding driven from the org's parent registration
link. Other organizations keep the standard invitation flow (AcceptInvitationPage);
this only activates when the invitation belongs to an org whose
feature_flags.icreate_registration.enabled is true.

Account-first flow: the parent creates their Optio account (or signs into an
existing one) BEFORE seeing the rest of the form.

    GET  /api/icreate/config/<invitation_code>    -> branding + questions + paperwork + fee config
    GET  /api/icreate/schedule-preview/<invitation_code> -> open classes + time blocks (staff funnel preview)
    POST /api/icreate/start                        -> create parent account, email a 6-digit code
    POST /api/icreate/verify                       -> confirm the code -> issues the funnel access_token
    POST /api/icreate/resend-code                  -> re-email a fresh code
    POST /api/icreate/login                        -> existing Optio account (password) -> attach to iCreate
    POST /api/icreate/registrations/<id>/family    -> phone/address + kids -> creates accounts + household
    POST /api/icreate/registrations/<id>/photo     -> required photo for the parent / each kid
    POST /api/icreate/registrations/<id>/details   -> emergency contacts + org questions
    POST /api/icreate/registrations/<id>/paperwork -> acknowledge/e-sign paperwork
    POST /api/icreate/registrations/<id>/fee       -> record fee + email scheduling link -> 'completed'
    POST /api/icreate/registrations/<id>/schedule-done    -> legacy (pre-2026-07 funnels): schedule built -> 'appointment'
    POST /api/icreate/registrations/<id>/appointment-done -> legacy (pre-2026-07 funnels): booked/deferred -> 'completed'

The funnel ends at the fee step: the final page lists the next steps (book the
Customized Learning Plan appointment + build the schedule) with links, and both
remain reachable afterward (booking link email, Schedule Builder header button).

Security model: all endpoints are public/pre-session (CSRF-exempt). The funnel
access_token is only revealed AFTER the email is verified (new accounts) or the
password checks out (existing accounts); every later step requires it. The OTP
is 6 digits, sha256-hashed at rest, 10-minute expiry, sent via our own SendGrid
email (no dependency on Supabase auth email templates).

Existing-account guardrails on /login: superadmins are refused; accounts already
in a DIFFERENT organization are refused (we never silently move someone between
orgs); iCreate student/observer accounts are refused (this is a parent flow).
Platform accounts are attached as org_managed/parent automatically. Same-org
STAFF (org_admin/advisor) may register their own kids: they keep their staff
role as primary and gain 'parent' in org_roles.

Account model (see memory: project_icreate_program):
- Kids under 13 (or 13+ opted "no email") -> COPPA dependents on the parent.
- Kids 13+ with their own email -> org_managed/student + parent_student_links.
- A kid's email matching an EXISTING Optio student account (platform, or already
  in this org e.g. school-imported) -> that account is ATTACHED to the family
  instead of blocked/duplicated: org fields normalized, parent link + household
  membership created, history kept. Accounts in another org, non-student
  accounts, and accounts linked to a different parent still refuse (409).
- Fee is RECORD-ONLY (Optio never processes payments).
"""

import hashlib
import re
import secrets
from datetime import datetime, timedelta, date

from dateutil.relativedelta import relativedelta
from flask import Blueprint, request, jsonify

from database import get_supabase_admin_client
from middleware.rate_limiter import rate_limit
from utils.auth.decorators import require_auth
from utils.validation import sanitize_input
from utils.logger import get_logger
from services.email_service import email_service

logger = get_logger(__name__)

bp = Blueprint('icreate_registration', __name__, url_prefix='/api/icreate')

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

LINK_PLACEHOLDER_SUFFIX = '@pending.optio.local'
OTP_TTL_MINUTES = 10


def _admin():
    return get_supabase_admin_client()


def _valid_email(v):
    return bool(v and EMAIL_RE.match(v.strip()))


def _calc_age(dob: date) -> int:
    today = date.today()
    age = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        age -= 1
    return age


def _parse_dob(v):
    """Parse an ISO YYYY-MM-DD date string, or return None."""
    if not v:
        return None
    try:
        return datetime.strptime(v.strip()[:10], '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


def _load_icreate_invite(code):
    """
    Resolve an invitation code to (invitation, organization, config) if it is a
    valid, pending, link-based parent invite for an iCreate-registration org.

    Returns (data_dict, None) on success or (None, (json, status)) on failure.
    """
    admin = _admin()
    res = admin.table('org_invitations') \
        .select('id, organization_id, email, role, status, expires_at, '
                'organizations(id, name, slug, branding_config, feature_flags)') \
        .eq('invitation_code', code) \
        .single() \
        .execute()
    inv = res.data
    if not inv:
        return None, (jsonify({'error': 'Invalid registration link'}), 404)
    if inv['status'] != 'pending':
        return None, (jsonify({'error': f"This link has been {inv['status']}"}), 400)
    if inv['role'] != 'parent':
        return None, (jsonify({'error': 'This is not a parent registration link'}), 400)

    org = inv.get('organizations') or {}
    cfg = (org.get('feature_flags') or {}).get('icreate_registration') or {}
    if not cfg.get('enabled'):
        return None, (jsonify({'error': 'This organization does not use the iCreate registration flow'}), 400)

    is_link_based = str(inv.get('email', '')).endswith(LINK_PLACEHOLDER_SUFFIX)
    if not is_link_based:
        return None, (jsonify({'error': 'This is not a shareable registration link'}), 400)

    return {'invitation': inv, 'organization': org, 'config': cfg}, None


def _compute_fee_cents(cfg, num_students):
    """Resolve the registration fee for a family of `num_students` kids.

    fee_mode:
      'flat'         -> registration_fee_cents (per family, ignores count)
      'per_student'  -> per_student_fee_cents * num_students
      'lesser'       -> min(per_student_fee_cents * num_students, registration_fee_cents)
                        i.e. per-student pricing with a per-family cap ("whichever is less")
    Falls back gracefully when one amount is unset.
    """
    family = int(cfg.get('registration_fee_cents') or 0)
    per_student = int(cfg.get('per_student_fee_cents') or 0)
    mode = cfg.get('fee_mode') or 'flat'
    n = max(0, int(num_students or 0))

    if mode == 'per_student':
        return per_student * n
    if mode == 'lesser':
        options = [v for v in (family, per_student * n) if v > 0]
        return min(options) if options else 0
    return family


def _paperwork_resource_urls(admin, org_id):
    """{paperwork_key: url} for org resources linked to registration paperwork.

    A linked org_resource is the single source of truth for that document: the
    funnel serves the resource's url, so updating the resource (new guidebook
    version) updates the registration form too."""
    try:
        rows = (admin.table('org_resources').select('paperwork_key, url')
                .eq('organization_id', org_id).execute()).data or []
        return {r['paperwork_key']: r['url'] for r in rows
                if r.get('paperwork_key') and r.get('url')}
    except Exception as e:  # noqa: BLE001
        logger.warning(f'iCreate: paperwork resource lookup failed for org {org_id}: {e}')
        return {}


def _public_config(org, cfg, paperwork_urls=None):
    """The subset of config safe to expose to the (unauthenticated) registration page."""
    paperwork_urls = paperwork_urls or {}
    sis_settings = (org.get('feature_flags') or {}).get('sis_settings') or {}
    return {
        # Age bands currently on an enrollment waitlist, so the family step can
        # tell parents a kid will be waitlisted the moment their DOB is entered.
        'enrollment_age_gates': [
            {'min_age': g.get('min_age'), 'max_age': g.get('max_age')}
            for g in (sis_settings.get('enrollment_age_gates') or [])
            if isinstance(g, dict) and g.get('mode') == 'waitlist'
        ],
        'first_day_of_school': sis_settings.get('first_day_of_school'),
        'organization': {
            'id': org.get('id'),
            'name': org.get('name'),
            'slug': org.get('slug'),
            'branding_config': org.get('branding_config') or {},
        },
        'fee_mode': cfg.get('fee_mode') or 'flat',
        'registration_fee_cents': int(cfg.get('registration_fee_cents') or 0),
        'per_student_fee_cents': int(cfg.get('per_student_fee_cents') or 0),
        'payment_url': cfg.get('payment_url') or '',
        # Appointment-booking link — parents receive it after the fee anyway
        # (email + final page); exposing it here lets ?preview=1 render the
        # real final step.
        'scheduling_url': _abs_url(cfg.get('scheduling_url')),
        # Whether verified card payment (the org's own Stripe account) is on.
        # The key itself is never exposed.
        'stripe_enabled': bool(cfg.get('stripe_secret_key')),
        'paperwork': [
            {'key': p.get('key'), 'label': p.get('label'),
             'doc_url': paperwork_urls.get(p.get('key')) or p.get('doc_url') or '',
             'body': p.get('body') or ''}
            for p in (cfg.get('paperwork') or [])
            if p.get('key') and p.get('label')
        ],
        'questions': [
            {'key': q.get('key'), 'label': q.get('label'), 'help': q.get('help') or '',
             'type': q.get('type') or 'select', 'options': q.get('options') or [],
             'required': bool(q.get('required'))}
            for q in (cfg.get('questions') or [])
            if q.get('key') and q.get('label')
        ],
    }


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
        except Exception:  # noqa: BLE001
            pass
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
        logger.warning(f'iCreate: student verification email failed for {email}: {e}')
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
        'role': 'student',
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
    admin.table('icreate_registrations').update({
        'otp_hash': _hash_otp(code),
        'otp_expires_at': (datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES)).isoformat(),
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
        logger.error(f'iCreate: OTP email failed for {email}: {e}')
        return False


def _platform_student_is_registerable_adult(admin, user):
    """Whether a platform account carrying the DEFAULT role='student' is safe
    to treat as an adult registering their family (the main Optio signup gives
    everyone role='student', so adults who self-registered there look like
    students). True only when there is NO evidence it's a kid's account:
      - not a dependent / not managed by a parent,
      - not linked to any parent as the student,
      - adult by DOB; or with DOB unknown, a pristine account (no XP, no
        quests — a kid who actually uses Optio has learning activity).
    Any lookup failure keeps the guardrail (returns False)."""
    if user.get('is_dependent') or user.get('managed_by_parent_id'):
        return False
    try:
        linked = (admin.table('parent_student_links').select('id')
                  .eq('student_user_id', user['id']).limit(1).execute()).data
        if linked:
            return False
        dob = _parse_dob(user.get('date_of_birth'))
        if dob is not None:
            return _calc_age(dob) >= 18
        if int(user.get('total_xp') or 0) > 0:
            return False
        quests = (admin.table('user_quests').select('id')
                  .eq('user_id', user['id']).limit(1).execute()).data
        return not quests
    except Exception as e:  # noqa: BLE001
        logger.warning(f'iCreate login: adult check failed for {user.get("id", "?")[:8]}: {e}')
        return False


def _load_registration(reg_id):
    admin = _admin()
    r = admin.table('icreate_registrations').select('*').eq('id', reg_id).single().execute()
    return r.data


def _authz(reg, token):
    return reg and token and secrets.compare_digest(str(reg.get('access_token')), str(token))


def _org_config(admin, org_id):
    r = admin.table('organizations').select('feature_flags').eq('id', org_id).single().execute()
    return ((r.data or {}).get('feature_flags') or {}).get('icreate_registration') or {}


def _parent_row(admin, parent_id):
    r = admin.table('users').select('id, email, first_name, last_name, avatar_url').eq('id', parent_id).single().execute()
    return r.data or {}


def _existing_household_for_parent(admin, org_id, parent_id):
    """The parent's existing SIS household in this org, if any: one they already
    guard (school import, staff-created, or a prior registration) or are the
    primary contact of. The family step reuses it instead of inserting a second
    '<Last> Family', so a returning parent — e.g. a teacher registering a kid who
    already has an account — never spawns a duplicate household."""
    try:
        gm = (admin.table('household_members').select('household_id')
              .eq('user_id', parent_id).eq('relationship', 'guardian').execute()).data or []
        hh_ids = [m['household_id'] for m in gm]
        if hh_ids:
            rows = (admin.table('households').select('id, organization_id')
                    .in_('id', hh_ids).execute()).data or []
            for h in rows:
                if h.get('organization_id') == org_id:
                    return h['id']
        rows = (admin.table('households').select('id')
                .eq('organization_id', org_id)
                .eq('primary_contact_user_id', parent_id).limit(1).execute()).data or []
        return rows[0]['id'] if rows else None
    except Exception as e:  # noqa: BLE001
        logger.warning(f'iCreate: existing-household lookup failed for parent {parent_id[:8]}: {e}')
        return None


def _family_directive(admin, org_id, email):
    """Pre-staged settings for this parent email (sis_family_directives): fee
    already paid on the school's legacy form, registration hold, priority tier.
    Loaded from the legacy registration spreadsheet before families re-register."""
    if not email:
        return None
    try:
        rows = (admin.table('sis_family_directives').select('*')
                .eq('organization_id', org_id)
                .eq('email', email.strip().lower())
                .limit(1).execute()).data or []
        return rows[0] if rows else None
    except Exception as e:  # noqa: BLE001
        logger.warning(f'iCreate: family-directive lookup failed for org {org_id}: {e}')
        return None


def _apply_prepaid_directive(admin, reg):
    """Honor a fee_prepaid directive staged AFTER the family step computed the fee.

    The family step zeroes the fee for directives that already exist, but the
    school often imports its legacy prepaid list late. Without this, a prepaid
    family whose registration already stored fee_cents > 0 is stuck at the fee
    step ("Please pay the registration fee by card to finish") with no way
    through. Re-check on resume/fee/checkout and zero the stored fee.
    Returns the (possibly updated) registration row.
    """
    try:
        if reg.get('status') == 'completed' or int(reg.get('fee_cents') or 0) <= 0:
            return reg
        parent = _parent_row(admin, reg['parent_user_id'])
        directive = _family_directive(admin, reg['organization_id'], parent.get('email'))
        if directive and directive.get('fee_prepaid'):
            admin.table('icreate_registrations').update({
                'fee_cents': 0, 'updated_at': datetime.utcnow().isoformat(),
            }).eq('id', reg['id']).execute()
            reg = {**reg, 'fee_cents': 0}
            logger.info(f"iCreate: prepaid directive zeroed fee for registration {reg['id']}")
    except Exception as e:  # noqa: BLE001
        logger.warning(f"iCreate: prepaid-directive check failed for registration {reg.get('id')}: {e}")
    return reg


# ── Endpoints ────────────────────────────────────────────────────────────────

@bp.route('/config/<invitation_code>', methods=['GET'])
@rate_limit(max_requests=60, window_seconds=60)
def get_config(invitation_code):
    """Public: branding + questions + paperwork + fee config for the registration page."""
    data, err = _load_icreate_invite(invitation_code)
    if err:
        return err
    org = data['organization']
    paperwork_urls = _paperwork_resource_urls(_admin(), org['id'])
    return jsonify({'success': True, **_public_config(org, data['config'], paperwork_urls)}), 200


@bp.route('/schedule-preview/<invitation_code>', methods=['GET'])
@rate_limit(max_requests=60, window_seconds=60)
def schedule_preview(invitation_code):
    """Public: the org's open-class catalog + time blocks so the ?preview=1
    walkthrough can show the Schedule Builder exactly as a parent sees it.
    Exposes nothing a family with the registration link wouldn't get anyway."""
    data, err = _load_icreate_invite(invitation_code)
    if err:
        return err
    from services import sis_parent_service
    org = data['organization']
    return jsonify({
        'success': True,
        'organization_name': org.get('name'),
        'scheduling_url': _abs_url(data['config'].get('scheduling_url')),
        **sis_parent_service.schedule_preview(org['id']),
    }), 200


@bp.route('/my-registration', methods=['GET'])
@require_auth
def my_registration(user_id):
    """Authenticated resume: the caller's own incomplete iCreate registration
    (plus the org's funnel config), so the register page can pick up where they
    left off after logging back in. Returns {registration: null} when there is
    nothing to resume — including for users who never used this funnel."""
    admin = _admin()
    rows = (
        admin.table('icreate_registrations')
        .select('*')
        .eq('parent_user_id', user_id)
        .order('created_at', desc=True)
        .limit(1)
        .execute()
    ).data or []
    reg = rows[0] if rows else None
    # Legacy in-flight rows from when schedule/appointment were funnel steps:
    # the funnel now ends at the fee step, so settle these as completed.
    if reg and reg.get('status') in ('schedule', 'appointment'):
        now = datetime.utcnow().isoformat()
        admin.table('icreate_registrations').update({
            'status': 'completed', 'completed_at': now, 'updated_at': now,
        }).eq('id', reg['id']).execute()
        reg['status'] = 'completed'
    if not reg or reg.get('status') == 'completed':
        return jsonify({'success': True, 'registration': None}), 200

    # A prepaid directive staged after the fee was computed zeroes it on resume,
    # so the fee step renders the no-payment finish instead of demanding a card.
    reg = _apply_prepaid_directive(admin, reg)

    # A logged-in session proves account ownership, so a registration still
    # waiting on the email code can skip straight to the family step.
    if reg.get('status') == 'verify':
        now = datetime.utcnow().isoformat()
        try:
            admin.auth.admin.update_user_by_id(user_id, {'email_confirm': True})
        except Exception as e:  # noqa: BLE001
            logger.warning(f'iCreate resume: auth email-confirm failed for {user_id[:8]}: {e}')
        admin.table('icreate_registrations').update({
            'email_verified_at': now, 'otp_hash': None, 'otp_expires_at': None,
            'status': 'family', 'updated_at': now,
        }).eq('id', reg['id']).execute()
        reg['status'] = 'family'

    org = (
        admin.table('organizations')
        .select('id, name, slug, branding_config, feature_flags')
        .eq('id', reg['organization_id']).single().execute()
    ).data or {}
    cfg = (org.get('feature_flags') or {}).get('icreate_registration') or {}

    # Household address/phone (for prefilling the family step on back-edit).
    hh_rows = (admin.table('households')
               .select('phone, address_line1, address_line2, city, state, postal_code')
               .eq('organization_id', reg['organization_id'])
               .eq('primary_contact_user_id', user_id).limit(1).execute()).data or []
    household = hh_rows[0] if hh_rows else None

    # Current photos, so the family step can show what's already uploaded.
    kids = reg.get('kids') or []
    member_ids = [k['user_id'] for k in kids if k.get('user_id')] + [user_id]
    avatar_by_id = {}
    try:
        rows = (admin.table('users').select('id, avatar_url')
                .in_('id', member_ids).execute()).data or []
        avatar_by_id = {r['id']: r.get('avatar_url') for r in rows}
    except Exception as e:  # noqa: BLE001
        logger.warning(f'iCreate resume: avatar lookup failed: {e}')

    return jsonify({
        'success': True,
        'registration': {
            'registration_id': reg['id'],
            'access_token': reg['access_token'],
            'status': reg['status'],
            'kids': [{**k, 'avatar_url': avatar_by_id.get(k.get('user_id'))} for k in kids],
            'parent_avatar_url': avatar_by_id.get(user_id),
            'fee_cents': reg.get('fee_cents'),
            'fee_deferred': bool(reg.get('fee_deferred')),
            'answers': reg.get('answers') or {},
            'emergency_contacts': reg.get('emergency_contacts') or [],
            'paperwork': reg.get('paperwork') or [],
            'household': household,
            'scheduling_url': _abs_url(cfg.get('scheduling_url')),
            'scheduling_emailed': bool(reg.get('scheduling_emailed_at')),
        },
        **_public_config(org, cfg, _paperwork_resource_urls(admin, reg['organization_id'])),
    }), 200


@bp.route('/start', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=300)
def start():
    """Create the parent's account and email a 6-digit confirmation code. The
    funnel access_token is NOT returned here — only /verify issues it."""
    body = request.get_json(silent=True) or {}
    data, err = _load_icreate_invite(body.get('code') or '')
    if err:
        return err
    org = data['organization']
    org_id = org['id']
    admin = _admin()

    email = (body.get('email') or '').strip().lower()
    password = body.get('password') or ''
    first = sanitize_input(body.get('first_name', ''))
    last = sanitize_input(body.get('last_name', ''))

    if not _valid_email(email):
        return jsonify({'error': 'A valid email is required'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    if not first or not last:
        return jsonify({'error': 'First and last name are required'}), 400

    if _email_exists(admin, email):
        # If THIS funnel created the account but the email was never verified,
        # let the parent pick up where they left off (password must match).
        pending = (
            admin.table('icreate_registrations')
            .select('id, parent_user_id, status, users!icreate_registrations_parent_user_id_fkey(email)')
            .eq('organization_id', org_id).eq('status', 'verify')
            .order('created_at', desc=True).limit(20).execute()
        ).data or []
        match = next((p for p in pending if (p.get('users') or {}).get('email') == email), None)
        if match:
            if not _password_ok(email, password):
                return jsonify({'error': 'This email already started registering. Enter the same password, or use "Sign in" instead.'}), 409
            code = _issue_otp(admin, match['id'])
            sent = _send_otp_email(email, first, org.get('name') or 'iCreate', code)
            return jsonify({'success': True, 'registration_id': match['id'], 'email': email,
                            'otp_sent': bool(sent),
                            'message': 'We re-sent your confirmation code.'}), 200
        return jsonify({'error': 'An account with this email already exists — use "Sign in with Optio" below.'}), 409

    try:
        parent_id = _create_org_parent(admin, org_id, email, password, first, last)
    except Exception as e:  # noqa: BLE001
        logger.error(f'iCreate start: parent creation failed: {e}')
        return jsonify({'error': 'Could not create your account. Please try again.'}), 500

    reg = admin.table('icreate_registrations').insert({
        'organization_id': org_id,
        'parent_user_id': parent_id,
        'access_token': secrets.token_urlsafe(32),
        'status': 'verify',
    }).execute()
    reg_id = reg.data[0]['id']

    code = _issue_otp(admin, reg_id)
    sent = _send_otp_email(email, first, org.get('name') or 'iCreate', code)

    logger.info(f'iCreate start: registration {reg_id} awaiting email verification (otp_sent={bool(sent)})')
    return jsonify({'success': True, 'registration_id': reg_id, 'email': email,
                    'otp_sent': bool(sent)}), 201


@bp.route('/verify', methods=['POST'])
@rate_limit(max_requests=15, window_seconds=300)
def verify_code():
    """Confirm the emailed 6-digit code. On success, marks the auth email
    verified and returns the funnel access_token."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(body.get('registration_id') or '')
    if not reg or reg.get('status') != 'verify':
        return jsonify({'error': 'Nothing to verify for this registration'}), 400

    code = str(body.get('code') or '').strip()
    if not re.fullmatch(r'\d{6}', code):
        return jsonify({'error': 'Enter the 6-digit code from your email'}), 400
    if not reg.get('otp_hash') or not reg.get('otp_expires_at'):
        return jsonify({'error': 'No code issued — request a new one'}), 400
    expires = datetime.fromisoformat(str(reg['otp_expires_at']).replace('Z', '+00:00'))
    if datetime.utcnow().replace(tzinfo=expires.tzinfo) > expires:
        return jsonify({'error': 'That code has expired — request a new one'}), 400
    if not secrets.compare_digest(_hash_otp(code), str(reg['otp_hash'])):
        return jsonify({'error': 'Incorrect code'}), 400

    admin = _admin()
    now = datetime.utcnow().isoformat()
    try:
        admin.auth.admin.update_user_by_id(reg['parent_user_id'], {'email_confirm': True})
    except Exception as e:  # noqa: BLE001
        logger.warning(f'iCreate verify: auth email-confirm failed for {reg["parent_user_id"][:8]}: {e}')
    admin.table('icreate_registrations').update({
        'email_verified_at': now, 'otp_hash': None, 'otp_expires_at': None,
        'status': 'family', 'updated_at': now,
    }).eq('id', reg['id']).execute()

    return jsonify({'success': True, 'status': 'family', 'access_token': reg['access_token']}), 200


@bp.route('/resend-code', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=300)
def resend_code():
    """Re-email a fresh confirmation code for a registration still in 'verify'."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(body.get('registration_id') or '')
    if not reg or reg.get('status') != 'verify':
        return jsonify({'error': 'Nothing to verify for this registration'}), 400
    admin = _admin()
    parent = _parent_row(admin, reg['parent_user_id'])
    org = admin.table('organizations').select('name').eq('id', reg['organization_id']).single().execute().data
    code = _issue_otp(admin, reg['id'])
    sent = _send_otp_email(parent.get('email'), parent.get('first_name'), (org or {}).get('name') or 'iCreate', code)
    return jsonify({'success': True, 'sent': bool(sent)}), 200


@bp.route('/login', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=300)
def login():
    """Existing Optio account: verify the password and attach the account to the
    iCreate org as a parent. No OTP needed — the password proves ownership."""
    body = request.get_json(silent=True) or {}
    data, err = _load_icreate_invite(body.get('code') or '')
    if err:
        return err
    org = data['organization']
    org_id = org['id']
    admin = _admin()

    email = (body.get('email') or '').strip().lower()
    password = body.get('password') or ''
    if not _valid_email(email) or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    row = (admin.table('users')
           .select('id, role, org_role, org_roles, organization_id, first_name, last_name, '
                   'is_dependent, managed_by_parent_id, date_of_birth, total_xp')
           .eq('email', email).limit(1).execute()).data
    if not row:
        return jsonify({'error': 'No Optio account with this email — create one instead.'}), 404
    user = row[0]

    # Guardrails: never silently move accounts between orgs or repurpose
    # privileged/student accounts as iCreate parents. Same-org STAFF
    # (org_admin/advisor) are allowed through — school staff have their own
    # kids to register — and keep their staff role (see the attach step).
    STAFF_ORG_ROLES = ('org_admin', 'advisor')
    current_org_role = user.get('org_role') or ((user.get('org_roles') or [None])[0])
    if user.get('role') == 'superadmin':
        return jsonify({'error': 'This account cannot be used here.'}), 403
    if user.get('organization_id') and user['organization_id'] != org_id:
        return jsonify({'error': 'This account belongs to another school. Please contact iCreate.'}), 409
    # Platform NON-parent accounts must not be silently repurposed as iCreate
    # parents (that used to convert e.g. a student's own account into a parent).
    # BUT: the main Optio signup defaults EVERYONE to role='student', so an
    # adult who created their own account there (e.g. while the funnel was
    # down, 2026-07-21) is a false positive — refuse only accounts that show
    # actual evidence of being a kid's: dependent/managed, linked to a parent,
    # a minor by DOB, or (DOB unknown) an account with real learning activity.
    if not user.get('organization_id') and user.get('role') == 'student':
        if not _platform_student_is_registerable_adult(admin, user):
            return jsonify({'error': "This looks like a student's Optio account. Register with a parent "
                                     "email — you can connect your child's account on the family step."}), 409
    if not user.get('organization_id') and user.get('role') in ('advisor', 'observer'):
        return jsonify({'error': 'This account can\'t be used to register a family. '
                                 'Please use a parent email or contact iCreate.'}), 409
    if (user.get('organization_id') == org_id and current_org_role
            and current_org_role not in ('parent',) + STAFF_ORG_ROLES):
        return jsonify({'error': 'This is not a parent account. Please register with a parent email.'}), 409

    if not _password_ok(email, password):
        return jsonify({'error': 'Incorrect password. If you signed up with Google, use "Create account" with a different email or contact iCreate.'}), 401

    if user.get('organization_id') == org_id and current_org_role in STAFF_ORG_ROLES:
        # Staff registering their own kids: append 'parent' to org_roles but keep
        # the staff role PRIMARY (first) — get_effective_role and every staff
        # surface stay untouched, and the parent-side features (Schedule Builder,
        # sidebar link) key off household guardianship / any-role checks.
        roles = [r for r in (user.get('org_roles') or [current_org_role]) if r]
        if 'parent' not in roles:
            admin.table('users').update({'org_roles': roles + ['parent']}).eq('id', user['id']).execute()
    else:
        # Attach to iCreate as a parent (no-op for existing iCreate parents).
        admin.table('users').update({
            'organization_id': org_id,
            'role': 'org_managed',
            'org_role': 'parent',
            'org_roles': ['parent'],
        }).eq('id', user['id']).execute()

    now = datetime.utcnow().isoformat()

    # Reuse the parent's existing registration rather than starting a fresh funnel
    # run. Blindly inserting a new 'family' registration here let a returning
    # parent re-run the family step with an empty prior_kids list, which created a
    # SECOND set of children (plus emergency contacts + household) instead of
    # editing the first. Mirror /my-registration's resume behavior instead.
    existing = (
        admin.table('icreate_registrations')
        .select('*')
        .eq('parent_user_id', user['id'])
        .eq('organization_id', org_id)
        .order('created_at', desc=True)
        .limit(1)
        .execute()
    ).data or []
    reg_row = existing[0] if existing else None

    # Legacy in-flight statuses (schedule/appointment were once funnel steps)
    # settle as completed, same as /my-registration.
    if reg_row and reg_row.get('status') in ('schedule', 'appointment'):
        admin.table('icreate_registrations').update({
            'status': 'completed', 'completed_at': now, 'updated_at': now,
        }).eq('id', reg_row['id']).execute()
        reg_row['status'] = 'completed'

    if reg_row and reg_row.get('status') == 'completed':
        # Already registered — send them into the app; never restart the funnel.
        logger.info(f'iCreate login: {user["id"][:8]} already registered for org {org_id}')
        return jsonify({
            'success': True,
            'registration_id': reg_row['id'],
            'access_token': reg_row['access_token'],
            'status': 'completed',
            'first_name': user.get('first_name'),
            'last_name': user.get('last_name'),
        }), 200

    if reg_row:
        # Resume an unfinished registration in place. Password login proves
        # ownership, so a row still awaiting the email code can advance to family.
        status = reg_row.get('status')
        updates = {'email_verified_at': reg_row.get('email_verified_at') or now, 'updated_at': now}
        if status == 'verify':
            updates.update({'otp_hash': None, 'otp_expires_at': None, 'status': 'family'})
            status = 'family'
        if not reg_row.get('access_token'):
            updates['access_token'] = secrets.token_urlsafe(32)
        admin.table('icreate_registrations').update(updates).eq('id', reg_row['id']).execute()
        reg_row = {**reg_row, **updates, 'status': status}
        logger.info(f'iCreate login: resumed registration {reg_row["id"][:8]} for org {org_id} at {status}')
        return jsonify({
            'success': True,
            'registration_id': reg_row['id'],
            'access_token': reg_row['access_token'],
            'status': status,
            'first_name': user.get('first_name'),
            'last_name': user.get('last_name'),
        }), 200

    # No prior registration: genuinely new funnel run for this existing account.
    reg = admin.table('icreate_registrations').insert({
        'organization_id': org_id,
        'parent_user_id': user['id'],
        'access_token': secrets.token_urlsafe(32),
        'status': 'family',
        'email_verified_at': now,  # password login proves account ownership
    }).execute()
    reg_row = reg.data[0]

    logger.info(f'iCreate login: existing account {user["id"][:8]} attached to org {org_id}')
    return jsonify({
        'success': True,
        'registration_id': reg_row['id'],
        'access_token': reg_row['access_token'],
        'status': 'family',
        'first_name': user.get('first_name'),
        'last_name': user.get('last_name'),
    }), 200


@bp.route('/registrations/<reg_id>/family', methods=['POST'])
@rate_limit(max_requests=20, window_seconds=300)
def submit_family(reg_id):
    """Phone/address + kids: creates the kid accounts, parent-student links, and
    the SIS household. Requires the post-verification access_token."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403
    if reg.get('status') not in ('family', 'details', 'paperwork', 'fee'):
        return jsonify({'error': 'This registration is already completed'}), 400

    admin = _admin()
    org_id = reg['organization_id']
    prior_entries = [k for k in (reg.get('kids') or []) if k.get('user_id')]
    prior_kids = [k['user_id'] for k in prior_entries]
    # Only accounts THIS funnel created may be deleted on back-edit; attached
    # pre-existing accounts are detached, never destroyed.
    prior_created_ids = [k['user_id'] for k in prior_entries if k.get('type') != 'existing']
    prior_existing = [k for k in prior_entries if k.get('type') == 'existing']
    cfg = _org_config(admin, org_id)
    parent_id = reg['parent_user_id']
    parent = _parent_row(admin, parent_id)
    last = parent.get('last_name') or 'New'

    phone = sanitize_input(body.get('phone', ''))
    address = {k: sanitize_input(body.get(k, '')) for k in
               ('address_line1', 'address_line2', 'city', 'state', 'postal_code')}
    if not phone:
        return jsonify({'error': 'A phone number is required'}), 400
    if not address['address_line1'] or not address['city'] or not address['state'] or not address['postal_code']:
        return jsonify({'error': 'Street address, city, state, and ZIP are required'}), 400

    # Validate kids up front so we don't create half the family on bad input.
    raw_kids = body.get('kids') or []
    if not raw_kids:
        return jsonify({'error': 'Add at least one child'}), 400
    kids = []
    for i, k in enumerate(raw_kids):
        kf = sanitize_input(k.get('first_name', ''))
        kl = sanitize_input(k.get('last_name', ''))
        kdob = _parse_dob(k.get('date_of_birth'))
        kemail = (k.get('email') or '').strip().lower()
        as_dependent = bool(k.get('as_dependent'))
        allergies = sanitize_input(k.get('allergies', ''))
        medications = sanitize_input(k.get('medications', ''))
        gender = sanitize_input(k.get('gender', ''))
        if not kf or not kl:
            return jsonify({'error': f'Child #{i + 1} needs a first and last name'}), 400
        if not kdob:
            return jsonify({'error': f'Child #{i + 1} needs a valid date of birth'}), 400
        if not gender:
            return jsonify({'error': f'Please select a gender for {kf}'}), 400
        age = _calc_age(kdob)
        wants_own_account = age >= 13 and not as_dependent

        # A provided email may belong to an existing Optio account. If it's an
        # attachable student account, connect it to this family instead of
        # blocking (or silently duplicating the kid as a dependent).
        existing_user = None
        if kemail and _valid_email(kemail):
            candidate, why = _existing_account_for_kid(admin, org_id, parent_id, kemail)
            # On back-edit, the same teen's prior funnel-created account holds
            # this email — that's not a conflict (it is replaced below).
            if candidate and candidate['id'] in prior_created_ids:
                candidate = None
            if candidate:
                existing_user = candidate
            elif why and wants_own_account:
                if why == 'other_org':
                    return jsonify({'error': f"{kf}'s Optio account belongs to another school. "
                                             'Please contact iCreate.'}), 409
                return jsonify({'error': f'{kf} already has an Optio account with this email that '
                                         "we can't connect automatically. Please contact iCreate."}), 409
        # Re-registration guard: even with no matching email, this kid may
        # already have a pre-existing org account (e.g. a school-imported roster
        # account). Match by name + DOB and attach it instead of creating a
        # duplicate. Scoped to the managed/dependent path — 13+ own-account teens
        # are matched by their email above — and requires an exact DOB match so a
        # different same-name student is never claimed.
        if not existing_user and not wants_own_account:
            nd = _existing_org_student_by_name_dob(admin, org_id, parent_id, kf, kl, kdob)
            if nd and nd['id'] not in prior_created_ids:
                existing_user = nd
        if wants_own_account and not existing_user and not _valid_email(kemail):
            return jsonify({'error': f'{kf} is 13+, so they need a valid email (or mark them as managed by you)'}), 400
        kids.append({'first': kf, 'last': kl, 'dob': kdob, 'email': kemail,
                     'own_account': wants_own_account, 'existing_user': existing_user,
                     'preferred_name': sanitize_input(k.get('preferred_name', '')) or None,
                     'gender': gender, 'allergies': allergies, 'medications': medications})

    # Back-editing: this step ran before, so tear down what it created (kid
    # accounts, links, contacts, household) and rebuild from the new payload.
    # Runs only AFTER validation so bad input never leaves a half-deleted family.
    # Safe mid-funnel: the accounts were created moments ago and have no activity.
    # Photos survive the rebuild: the storage file isn't deleted with the account,
    # so an unchanged kid (same name + DOB) gets their avatar_url carried over.
    prior_avatars = {}
    if prior_kids:
        try:
            rows = (admin.table('users')
                    .select('id, first_name, last_name, date_of_birth, avatar_url')
                    .in_('id', prior_kids).execute()).data or []
            prior_avatars = {
                (r.get('first_name'), r.get('last_name'), str(r.get('date_of_birth') or '')[:10]): r['avatar_url']
                for r in rows if r.get('avatar_url')
            }
        except Exception as e:  # noqa: BLE001
            logger.warning(f'iCreate family re-edit: avatar carry-over lookup failed: {e}')
    if prior_kids:
        try:
            from services import sis_enrollment_waitlist_service as enrollment_waitlist
            enrollment_waitlist.remove_for_students(org_id, prior_kids)
            admin.table('emergency_contacts').delete().in_('student_user_id', prior_kids).execute()
            admin.table('parent_student_links').delete().in_('student_user_id', prior_kids).execute()
            # Drop only the prior kids' household memberships (so kids removed on a
            # back-edit fall off); the household row itself is preserved and reused
            # below, so a pre-existing / school-imported family is never churned or
            # duplicated. The parent's own guardian membership is untouched.
            admin.table('household_members').delete().in_('user_id', prior_kids).execute()
            if prior_created_ids:
                admin.table('users').delete().in_('id', prior_created_ids).execute()
            for kid_id in prior_created_ids:
                try:
                    admin.auth.admin.delete_user(kid_id)
                except Exception as e:  # noqa: BLE001
                    logger.warning(f'iCreate family re-edit: auth cleanup failed for {kid_id[:8]}: {e}')
            # Attached pre-existing accounts are never deleted. Accounts that were
            # platform students before this funnel attached them revert to that
            # state; if the kid is still in the new payload they re-attach below.
            for entry in prior_existing:
                if entry.get('was_platform'):
                    admin.table('users').update({
                        'organization_id': None, 'role': 'student',
                        'org_role': None, 'org_roles': None,
                    }).eq('id', entry['user_id']).execute()
        except Exception as e:  # noqa: BLE001
            logger.error(f'iCreate family re-edit: teardown failed for {reg_id}: {e}')
            return jsonify({'error': 'Could not update your family. Please contact iCreate.'}), 500

    # A parent who already had an Optio account may already have these kids as
    # COPPA dependents. Reuse those accounts instead of creating duplicates.
    # Fetched AFTER teardown so a back-edit's just-deleted funnel dependents
    # can't match. Scoped to this parent's own dependents — no takeover risk.
    existing_dependents = (
        admin.table('users')
        .select('id, first_name, last_name, date_of_birth, display_name, organization_id')
        .eq('managed_by_parent_id', parent_id).eq('is_dependent', True).execute()
    ).data or []
    existing_dependents = [d for d in existing_dependents if d['id'] not in prior_created_ids]

    created_kids = []
    student_ids = []
    for k in kids:
        try:
            was_platform = False
            if k.get('existing_user'):
                # Connect the kid's existing Optio account instead of creating a
                # duplicate — after this it looks exactly like a funnel-created
                # student (org fields, parent link, household member below).
                was_platform = not k['existing_user'].get('organization_id')
                # On re-edit the lookup ran before teardown (account still looked
                # org-attached from the first pass) — the prior snapshot knows
                # whether they originally came from the platform.
                prior = next((p for p in prior_existing
                              if p['user_id'] == k['existing_user']['id']), None)
                if prior is not None:
                    was_platform = bool(prior.get('was_platform'))
                kid_id = _attach_existing_student(admin, org_id, k['existing_user'],
                                                 k['first'], k['last'], k['dob'])
                student_ids.append(kid_id)
                ktype = 'existing'
            elif k['own_account']:
                kid_id = _create_org_student(admin, org_id, k['email'], k['first'], k['last'], k['dob'])
                student_ids.append(kid_id)
                ktype = 'student'
            else:
                dep = _match_existing_dependent(existing_dependents, k['first'], k['last'], k['dob'])
                if dep:
                    # The parent's pre-existing dependent — attach to the org
                    # (dependents keep role='student'); history stays intact.
                    existing_dependents.remove(dep)  # twins: never match twice
                    was_platform = not dep.get('organization_id')
                    prior = next((p for p in prior_existing if p['user_id'] == dep['id']), None)
                    if prior is not None:
                        was_platform = bool(prior.get('was_platform'))
                    updates = {'organization_id': org_id, 'date_of_birth': str(k['dob'])}
                    if not dep.get('display_name'):
                        updates['display_name'] = f"{k['first']} {k['last']}".strip()
                    admin.table('users').update(updates).eq('id', dep['id']).execute()
                    kid_id = dep['id']
                    ktype = 'existing'
                else:
                    kid_id = _create_dependent(admin, parent_id, org_id, k['first'], k['last'], k['dob'])
                    ktype = 'dependent'
            extras = {f: k[f] for f in ('preferred_name', 'gender', 'allergies', 'medications') if k.get(f)}
            carried = prior_avatars.get((k['first'], k['last'], str(k['dob'])))
            if carried and ktype != 'existing':
                extras['avatar_url'] = carried
            if extras:
                admin.table('users').update(extras).eq('id', kid_id).execute()
            created_kids.append({
                'user_id': kid_id, 'name': f"{k['first']} {k['last']}".strip(),
                'first_name': k['first'], 'last_name': k['last'],
                'dob': str(k['dob']), 'type': ktype, 'was_platform': was_platform,
                'email': k['email'] if (k['own_account'] or ktype == 'existing') else None,
                'preferred_name': k.get('preferred_name'), 'gender': k.get('gender'),
                'allergies': k.get('allergies'), 'medications': k.get('medications'),
            })
        except Exception as e:  # noqa: BLE001
            logger.error(f"iCreate family: kid creation failed for {k['first']}: {e}")

    if student_ids:
        try:
            from routes.admin.user_invitations import _create_parent_student_links
            _create_parent_student_links(admin, parent_id, student_ids, org_id)
        except Exception as e:  # noqa: BLE001
            logger.error(f'iCreate family: parent-student linking failed: {e}')

    # Settings the school staged for this family before they re-registered
    # (legacy-form import): prepaid fee, registration hold, priority tier.
    directive = _family_directive(admin, org_id, parent.get('email'))

    # Group the family into a SIS household so address/phone land where staff
    # already look (Families page). Best-effort: registration succeeds without it.
    household_id = None
    try:
        hh_fields = {
            'organization_id': org_id,
            'name': f'{last} Family',
            'primary_contact_user_id': parent_id,
            'address_line1': address['address_line1'] or None,
            'address_line2': address['address_line2'] or None,
            'city': address['city'] or None,
            'state': address['state'] or None,
            'postal_code': address['postal_code'] or None,
            'phone': phone or None,
            'registration_hold': bool(directive and directive.get('registration_hold')),
            'registration_hold_reason': (directive or {}).get('hold_reason'),
        }
        # Reuse the parent's existing household instead of inserting a duplicate
        # '<Last> Family' next to a school-imported / prior one.
        household_id = _existing_household_for_parent(admin, org_id, parent_id)
        if household_id:
            # Keep any staff-set family name; fill the rest from this submission.
            admin.table('households').update(
                {k: v for k, v in hh_fields.items() if k not in ('name', 'organization_id')}
            ).eq('id', household_id).execute()
        else:
            household_id = admin.table('households').insert(hh_fields).execute().data[0]['id']
        members = [{'household_id': household_id, 'user_id': parent_id,
                    'relationship': 'guardian', 'is_primary_guardian': True}]
        members += [{'household_id': household_id, 'user_id': ck['user_id'],
                     'relationship': 'student', 'is_primary_guardian': False}
                    for ck in created_kids]
        # Upsert so reusing a household never collides on an existing membership.
        admin.table('household_members').upsert(
            members, on_conflict='household_id,user_id').execute()
        if directive:
            admin.table('sis_family_directives').update({
                'matched_household_id': household_id,
                'updated_at': datetime.utcnow().isoformat(),
            }).eq('id', directive['id']).execute()
    except Exception as e:  # noqa: BLE001
        logger.error(f'iCreate family: household creation failed: {e}')

    # Enrollment age gates: kids whose age falls in a waitlisted band join the
    # enrollment waitlist — they finish registering but can't select classes
    # until the school releases them.
    try:
        from services import sis_enrollment_waitlist_service as enrollment_waitlist
        gates = enrollment_waitlist.gates_for_org(org_id)
        for ck in created_kids:
            gate = enrollment_waitlist.matching_gate(org_id, ck.get('dob'), gates) if gates else None
            ck['waitlisted'] = bool(gate)
            if gate:
                enrollment_waitlist.add_waiting(
                    org_id, ck['user_id'], guardian_user_id=parent_id,
                    household_id=household_id, gate=gate)
    except Exception as e:  # noqa: BLE001
        logger.error(f'iCreate family: enrollment-waitlist gating failed for {reg_id}: {e}')
        for ck in created_kids:
            ck.setdefault('waitlisted', False)

    # Fee is per-family, computed from the number of kids registering. Stored so
    # later steps are stable even if an admin edits the config mid-funnel.
    # Families who already paid on the school's legacy form owe nothing.
    # The fee is paid UP FRONT even for waitlisted kids — it holds their place in
    # line and is fully refunded if they aren't accepted (see the reject flow).
    # So we no longer defer to first release; every new registration pays now.
    # (Legacy fee_deferred=True registrations still reopen on release.)
    fee_cents = 0 if (directive and directive.get('fee_prepaid')) \
        else _compute_fee_cents(cfg, len(created_kids))
    fee_deferred = False
    admin.table('icreate_registrations').update({
        'kids': created_kids, 'fee_cents': fee_cents, 'fee_deferred': fee_deferred,
        'status': 'details', 'updated_at': datetime.utcnow().isoformat(),
    }).eq('id', reg_id).execute()

    logger.info(f'iCreate family: registration {reg_id} has {len(created_kids)} kids, '
                f'fee {fee_cents}c{" (deferred)" if fee_deferred else ""}')
    return jsonify({'success': True, 'status': 'details', 'kids': created_kids,
                    'fee_cents': fee_cents, 'fee_deferred': fee_deferred}), 200


@bp.route('/registrations/<reg_id>/details', methods=['POST'])
@rate_limit(max_requests=30, window_seconds=300)
def submit_details(reg_id):
    """Save emergency contacts and the org's registration
    questions (special needs, payment intent, media consent, ...)."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403

    admin = _admin()
    cfg = _org_config(admin, reg['organization_id'])

    # Validate answers against the configured questions.
    questions = [q for q in (cfg.get('questions') or []) if q.get('key') and q.get('label')]
    raw_answers = body.get('answers') or {}
    answers = {}
    for q in questions:
        val = raw_answers.get(q['key'])
        if q.get('type') == 'multi':
            val = [sanitize_input(str(v)) for v in (val or []) if str(v).strip()]
            if q.get('required') and not val:
                return jsonify({'error': f"Please answer: {q['label']}"}), 400
        else:
            val = sanitize_input(str(val or '').strip())
            if q.get('required') and not val:
                return jsonify({'error': f"Please answer: {q['label']}"}), 400
        answers[q['key']] = val

    # Validate + store emergency contacts (snapshot on the registration, and real
    # emergency_contacts rows per kid so staff see them in the SIS immediately).
    raw_contacts = body.get('emergency_contacts') or []
    contacts = []
    for i, c in enumerate(raw_contacts):
        name = sanitize_input(c.get('name', ''))
        rel = sanitize_input(c.get('relationship', ''))
        cphone = sanitize_input(c.get('phone', ''))
        if not name or not cphone:
            return jsonify({'error': f'Emergency contact #{i + 1} needs a name and phone number'}), 400
        contacts.append({
            'name': name, 'relationship': rel or None, 'phone': cphone,
            'email': sanitize_input(c.get('email', '')) or None,
        })
    if not contacts:
        return jsonify({'error': 'Please add at least one emergency contact'}), 400

    kid_ids = [k.get('user_id') for k in (reg.get('kids') or []) if k.get('user_id')]
    # Re-submittable (back-editing): replace the contacts this funnel created.
    if kid_ids:
        try:
            admin.table('emergency_contacts').delete().in_('student_user_id', kid_ids).execute()
        except Exception as e:  # noqa: BLE001
            logger.warning(f'iCreate details: contact cleanup failed: {e}')
    for kid_id in kid_ids:
        for pri, c in enumerate(contacts, start=1):
            try:
                admin.table('emergency_contacts').insert({
                    'student_user_id': kid_id,
                    'organization_id': reg['organization_id'],
                    'name': c['name'], 'relationship': c['relationship'],
                    'phone': c['phone'], 'email': c['email'],
                    'priority': pri,
                }).execute()
            except Exception as e:  # noqa: BLE001
                logger.error(f'iCreate details: contact insert failed for kid {kid_id[:8]}: {e}')

    admin.table('icreate_registrations').update({
        'answers': answers, 'emergency_contacts': contacts,
        'status': 'paperwork', 'updated_at': datetime.utcnow().isoformat(),
    }).eq('id', reg_id).execute()

    return jsonify({'success': True, 'status': 'paperwork'}), 200


@bp.route('/registrations/<reg_id>/paperwork', methods=['POST'])
@rate_limit(max_requests=30, window_seconds=300)
def submit_paperwork(reg_id):
    """Save the parent's typed-name acknowledgements for the required paperwork items."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403

    admin = _admin()
    cfg = _org_config(admin, reg['organization_id'])
    required = [p for p in (cfg.get('paperwork') or []) if p.get('key') and p.get('label')]
    submitted = {a.get('key'): (a.get('signed_name') or '').strip()
                 for a in (body.get('acknowledgements') or [])}

    saved = []
    for item in required:
        name = submitted.get(item['key'], '')
        if not name:
            return jsonify({'error': f"Please sign: {item['label']}"}), 400
        saved.append({
            'key': item['key'], 'label': item['label'],
            'signed_name': sanitize_input(name),
            'acknowledged_at': datetime.utcnow().isoformat(),
        })

    admin.table('icreate_registrations').update({
        'paperwork': saved, 'status': 'fee', 'updated_at': datetime.utcnow().isoformat(),
    }).eq('id', reg_id).execute()

    return jsonify({
        'success': True, 'status': 'fee',
        'fee_cents': int(reg.get('fee_cents') or 0),
        'payment_url': cfg.get('payment_url') or '',
    }), 200


def _abs_url(v):
    """Config URLs saved without a scheme would render as relative links."""
    s = (v or '').strip()
    if not s:
        return ''
    return s if re.match(r'^https?://', s, re.I) else f'https://{s}'


def _finish_fee_step(admin, reg, cfg, extra_fields=None):
    """Shared fee completion: email the scheduling link and complete the
    registration. Building the schedule and booking the appointment are
    post-registration next steps shown on the final page (and reachable later
    from the Schedule Builder), not funnel gates. Returns the response payload."""
    scheduling_url = _abs_url(cfg.get('scheduling_url'))
    now = datetime.utcnow().isoformat()

    emailed_at = None
    parent = _parent_row(admin, reg['parent_user_id'])
    org = admin.table('organizations').select('name').eq('id', reg['organization_id']).single().execute().data
    if scheduling_url and parent.get('email'):
        try:
            from app_config import Config
            org_name = (org or {}).get('name') or 'iCreate'
            builder_url = f"{Config.FRONTEND_URL.rstrip('/')}/schedule-builder"
            html = (
                f"<p>Hi {parent.get('first_name') or 'there'},</p>"
                f"<p>Thanks for registering with {org_name}! Don't forget to book your "
                f"appointment with {org_name} staff to build your Customized Learning Plan.</p>"
                f"<p><a href=\"{scheduling_url}\">Book your appointment</a></p>"
                f"<p>Before the meeting, please use the "
                f"<a href=\"{builder_url}\">Schedule Builder</a> to create your family's "
                f"schedule for the coming school year so our team can review it with you.</p>"
                f"<p>If a link doesn't work, copy and paste this into your browser:<br>{scheduling_url}</p>"
            )
            if email_service.send_email(parent['email'], f'{org_name}: book your appointment', html):
                emailed_at = now
        except Exception as e:  # noqa: BLE001
            logger.warning(f'iCreate: scheduling email failed for registration {reg["id"]}: {e}')

    payload = {
        'fee_recorded_at': now, 'scheduling_emailed_at': emailed_at,
        'status': 'completed', 'completed_at': now, 'updated_at': now,
        **(extra_fields or {}),
    }
    admin.table('icreate_registrations').update(payload).eq('id', reg['id']).execute()

    # A release put this household on hold until the deferred fee was settled —
    # settling it clears the hold (only OUR hold; a school-set hold stays).
    # Skipped while the fee is still deferred (all-waitlisted family finishing
    # the funnel unpaid — no hold exists yet).
    if not reg.get('fee_deferred'):
        try:
            from services.sis_enrollment_waitlist_service import FEE_HOLD_REASON
            admin.table('households').update({
                'registration_hold': False, 'registration_hold_reason': None,
            }).eq('organization_id', reg['organization_id']) \
                .eq('primary_contact_user_id', reg['parent_user_id']) \
                .eq('registration_hold_reason', FEE_HOLD_REASON).execute()
        except Exception as e:  # noqa: BLE001
            logger.warning(f'iCreate fee: hold clear failed for {reg["id"]}: {e}')

    return {
        'success': True, 'status': 'completed',
        'scheduling_url': scheduling_url,
        'scheduling_emailed': bool(emailed_at),
    }


@bp.route('/registrations/<reg_id>/checkout', methods=['POST'])
@rate_limit(max_requests=20, window_seconds=300)
def create_checkout(reg_id):
    """Create a Stripe Checkout Session for the registration fee on the SCHOOL'S
    own Stripe account (cfg.stripe_secret_key). Returns the hosted payment URL."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403
    if reg.get('status') == 'completed':
        return jsonify({'error': 'This registration is already completed'}), 400

    admin = _admin()
    cfg = _org_config(admin, reg['organization_id'])
    secret = cfg.get('stripe_secret_key')
    # A stale tab could still show the card button after the school staged a
    # prepaid credit — never charge a family that already paid.
    reg = _apply_prepaid_directive(admin, reg)
    fee_cents = int(reg.get('fee_cents') or 0)
    if not secret:
        return jsonify({'error': 'Card payment is not set up for this school'}), 400
    if fee_cents <= 0:
        return jsonify({'error': 'No registration fee is due'}), 400

    return_url = (body.get('return_url') or '').strip()
    if not return_url.startswith('http'):
        return jsonify({'error': 'Invalid return URL'}), 400

    org = admin.table('organizations').select('name').eq('id', reg['organization_id']).single().execute().data
    org_name = (org or {}).get('name') or 'iCreate'
    parent = _parent_row(admin, reg['parent_user_id'])

    try:
        import stripe
        sep = '&' if '?' in return_url else '?'
        session = stripe.checkout.Session.create(
            api_key=secret,  # the school's key — funds go to their account
            mode='payment',
            line_items=[{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {'name': f'{org_name} registration fee'},
                    'unit_amount': fee_cents,
                },
                'quantity': 1,
            }],
            customer_email=parent.get('email') or None,
            metadata={'registration_id': reg['id']},
            success_url=f'{return_url}{sep}payment=return',
            cancel_url=f'{return_url}{sep}payment=canceled',
        )
    except Exception as e:  # noqa: BLE001
        logger.error(f'iCreate checkout: session creation failed for {reg_id}: {e}')
        return jsonify({'error': 'Could not start the payment. Please try again or contact the school.'}), 502

    # Keep a HISTORY of every session, not just the latest: a parent who clicks
    # Pay twice (double-tab, impatient re-click) can pay the FIRST session while
    # the second overwrites stripe_session_id — verification then checks the
    # unpaid one forever and a real payment looks missing (Keely Pogue,
    # 2026-07-22). confirm_payment walks this list.
    history = list(reg.get('stripe_session_ids') or [])
    history.append(session.id)
    updates = {
        'stripe_session_id': session.id,
        'stripe_session_ids': history[-10:],
        'updated_at': datetime.utcnow().isoformat(),
    }
    # The family acknowledged the hold-your-place / fully-refundable terms for a
    # fee that includes waitlisted kids (frontend gates the pay button on it).
    if body.get('waitlist_ack') and not reg.get('waitlist_refund_ack_at'):
        updates['waitlist_refund_ack_at'] = datetime.utcnow().isoformat()
    admin.table('icreate_registrations').update(updates).eq('id', reg_id).execute()

    return jsonify({'success': True, 'checkout_url': session.url}), 200


@bp.route('/preview-checkout', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=300)
def preview_checkout():
    """Staff walkthrough (?preview=1) of the card-payment step: a real Stripe
    Checkout session on the school's account so the preview shows exactly what
    families see. Stripe doesn't allow $0 in payment mode, so it's created for
    the 50-cent minimum and clearly labeled — nothing is charged unless someone
    actually pays it. Gated by the public invitation code, same as /config;
    no registration exists and nothing is recorded."""
    body = request.get_json(silent=True) or {}
    data, err = _load_icreate_invite((body.get('code') or '').strip())
    if err:
        return err
    org = data['organization']
    cfg = data['config']
    secret = cfg.get('stripe_secret_key')
    if not secret:
        return jsonify({'error': 'Card payment is not set up for this school'}), 400
    return_url = (body.get('return_url') or '').strip()
    if not return_url.startswith('http'):
        return jsonify({'error': 'Invalid return URL'}), 400

    try:
        import stripe
        sep = '&' if '?' in return_url else '?'
        session = stripe.checkout.Session.create(
            api_key=secret,
            mode='payment',
            line_items=[{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {'name': f'{org.get("name") or "iCreate"} registration fee (PREVIEW — do not pay)'},
                    'unit_amount': 50,
                },
                'quantity': 1,
            }],
            metadata={'preview': 'true', 'organization_id': org['id']},
            success_url=f'{return_url}{sep}payment=preview-return',
            cancel_url=f'{return_url}{sep}payment=preview-canceled',
        )
    except Exception as e:  # noqa: BLE001
        logger.error(f'iCreate preview-checkout: session creation failed: {e}')
        return jsonify({'error': 'Could not start the preview payment'}), 502
    return jsonify({'success': True, 'checkout_url': session.url}), 200


def _find_paid_session(reg, secret):
    """Find a PAID Stripe Checkout Session belonging to this registration.

    A parent can create several sessions (Pay clicked twice, two tabs) and pay
    any ONE of them, while stripe_session_id only remembers the LAST click — so
    verification must consider every candidate, not just the latest:
      1. the current stripe_session_id + the stored stripe_session_ids history;
      2. fallback: list the school's recent Checkout Sessions on Stripe and
         match metadata.registration_id (rescues registrations from before the
         history column existed).
    Returns (paid_session_or_None, retrieve_errors_count).
    """
    import stripe

    candidates = []
    for sid in [reg.get('stripe_session_id')] + list(reversed(reg.get('stripe_session_ids') or [])):
        if sid and sid not in candidates:
            candidates.append(sid)

    errors = 0
    for sid in candidates:
        try:
            session = stripe.checkout.Session.retrieve(sid, api_key=secret)
        except Exception as e:  # noqa: BLE001
            logger.error(f'iCreate confirm-payment: retrieve failed for {sid[:20]}: {e}')
            errors += 1
            continue
        if (session.get('metadata') or {}).get('registration_id') != reg['id']:
            continue
        if session.get('payment_status') == 'paid':
            return session, errors

    # Fallback sweep: any paid session for this registration among the school's
    # recent sessions (created since this registration existed), capped pages.
    try:
        created_gte = int(datetime.fromisoformat(
            str(reg.get('created_at')).replace('Z', '+00:00').replace(' ', 'T')).timestamp())
    except (ValueError, TypeError):
        created_gte = None
    try:
        params = {'limit': 100, 'api_key': secret}
        if created_gte:
            params['created'] = {'gte': created_gte}
        listing = stripe.checkout.Session.list(**params)
        for page in range(3):
            for session in listing.get('data') or []:
                if ((session.get('metadata') or {}).get('registration_id') == reg['id']
                        and session.get('payment_status') == 'paid'):
                    return session, errors
            if not listing.get('has_more'):
                break
            last = (listing.get('data') or [])[-1]
            params['starting_after'] = last['id']
            listing = stripe.checkout.Session.list(**params)
    except Exception as e:  # noqa: BLE001
        logger.error(f'iCreate confirm-payment: session list fallback failed: {e}')
        errors += 1
    return None, errors


@bp.route('/registrations/<reg_id>/confirm-payment', methods=['POST'])
@rate_limit(max_requests=30, window_seconds=300)
def confirm_payment(reg_id):
    """Server-side payment verification (the passback): find a Checkout Session
    for this registration that Stripe says is PAID for the right amount. Never
    trusts the browser. Completes the funnel."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403

    admin = _admin()
    cfg = _org_config(admin, reg['organization_id'])
    if reg.get('status') in ('schedule', 'appointment', 'completed'):
        # Fee already settled — idempotent re-verify (e.g. a Stripe return-page reload).
        return jsonify({'success': True, 'status': reg['status'], 'already': True, 'paid': True,
                        'scheduling_url': _abs_url(cfg.get('scheduling_url')),
                        'scheduling_emailed': bool(reg.get('scheduling_emailed_at'))}), 200
    secret = cfg.get('stripe_secret_key')
    if not secret or not (reg.get('stripe_session_id') or reg.get('stripe_session_ids')):
        return jsonify({'error': 'No payment to verify for this registration'}), 400

    session, errors = _find_paid_session(reg, secret)
    if session is None:
        if errors:
            return jsonify({'error': 'Could not verify the payment. Please try again.'}), 502
        return jsonify({'success': False, 'paid': False,
                        'error': "We haven't received your payment yet. Complete the payment and try again."}), 402
    if int(session.get('amount_total') or 0) != int(reg.get('fee_cents') or 0):
        logger.warning(f'iCreate confirm-payment: amount mismatch for {reg_id}: '
                       f'{session.get("amount_total")} != {reg.get("fee_cents")}')
        return jsonify({'error': 'Payment amount mismatch — please contact the school.'}), 400

    result = _finish_fee_step(admin, reg, cfg, extra_fields={
        'fee_paid_at': datetime.utcnow().isoformat(),
        'stripe_payment_ref': str(session.get('payment_intent') or session.get('id')),
        # Paid = nothing deferred anymore, so a later waitlist release
        # never reopens a settled registration.
        'fee_deferred': False,
    })
    logger.info(f'iCreate: registration {reg_id} payment verified ({session.get("payment_intent")})')
    return jsonify({**result, 'paid': True}), 200


@bp.route('/registrations/<reg_id>/fee', methods=['POST'])
@rate_limit(max_requests=30, window_seconds=300)
def record_fee(reg_id):
    """Finish the fee step WITHOUT card verification — only allowed when the org
    has no Stripe key configured (external/offline payment) or no fee is due.
    With Stripe configured, /confirm-payment is the only way through."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403

    admin = _admin()
    cfg = _org_config(admin, reg['organization_id'])
    if reg.get('status') in ('schedule', 'appointment', 'completed'):
        return jsonify({'success': True, 'status': reg['status'], 'already': True,
                        'scheduling_url': _abs_url(cfg.get('scheduling_url')),
                        'scheduling_emailed': bool(reg.get('scheduling_emailed_at'))}), 200
    reg = _apply_prepaid_directive(admin, reg)
    fee_cents = int(reg.get('fee_cents') or 0)  # computed per-family at the family step
    # Fee-deferred families (every kid on the enrollment waitlist) finish without
    # paying — the fee comes due when the school releases their first student.
    if cfg.get('stripe_secret_key') and fee_cents > 0 and not reg.get('fee_deferred'):
        return jsonify({'error': 'Please pay the registration fee by card to finish.'}), 402

    result = _finish_fee_step(admin, reg, cfg, extra_fields={'fee_cents': fee_cents})
    return jsonify(result), 200


@bp.route('/registrations/<reg_id>/schedule-done', methods=['POST'])
@rate_limit(max_requests=30, window_seconds=300)
def schedule_done(reg_id):
    """Legacy (pre-2026-07 funnels): the parent finished (or deferred) building
    the class schedule — advance to the appointment step. New funnels complete
    at the fee step and never call this."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403
    if reg.get('status') == 'completed':
        return jsonify({'success': True, 'status': 'completed', 'already': True}), 200
    if reg.get('status') not in ('schedule', 'appointment'):
        return jsonify({'error': 'The schedule step is not open for this registration'}), 400

    now = datetime.utcnow().isoformat()
    _admin().table('icreate_registrations').update({
        'schedule_done_at': reg.get('schedule_done_at') or now,
        'status': 'appointment', 'updated_at': now,
    }).eq('id', reg_id).execute()
    return jsonify({'success': True, 'status': 'appointment'}), 200


@bp.route('/registrations/<reg_id>/appointment-done', methods=['POST'])
@rate_limit(max_requests=30, window_seconds=300)
def appointment_done(reg_id):
    """Legacy (pre-2026-07 funnels): the parent booked their customized learning
    plan appointment (booked=true) or chose to book later — either way the
    funnel is complete. New funnels complete at the fee step and never call this."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403
    if reg.get('status') == 'completed':
        return jsonify({'success': True, 'status': 'completed', 'already': True}), 200
    if reg.get('status') not in ('schedule', 'appointment'):
        return jsonify({'error': 'The appointment step is not open for this registration'}), 400

    now = datetime.utcnow().isoformat()
    _admin().table('icreate_registrations').update({
        'appointment_confirmed_at': now if body.get('booked') else None,
        'status': 'completed', 'completed_at': now, 'updated_at': now,
    }).eq('id', reg_id).execute()
    return jsonify({'success': True, 'status': 'completed'}), 200


@bp.route('/registrations/<reg_id>/photo', methods=['POST'])
@rate_limit(max_requests=60, window_seconds=300)
def upload_photo(reg_id):
    """Required photo for a family member (the parent or one of this
    registration's kids). Multipart form: file, target_user_id, access_token."""
    import uuid as _uuid
    reg = _load_registration(reg_id)
    if not _authz(reg, request.form.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403

    # 'parent' sentinel: the browser never learns the parent's user id.
    target = (request.form.get('target_user_id') or '').strip()
    if target in ('', 'parent'):
        target = reg['parent_user_id']
    allowed = {reg['parent_user_id']} | {k.get('user_id') for k in (reg.get('kids') or [])}
    if target not in allowed:
        return jsonify({'error': 'This person is not part of your registration'}), 403

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'):
        return jsonify({'error': 'Please upload a photo (JPG, PNG, WEBP, or HEIC)'}), 400
    file.seek(0, 2)
    if file.tell() > 5 * 1024 * 1024:
        return jsonify({'error': 'Photos must be under 5MB'}), 400
    file.seek(0)

    admin = _admin()
    from services.user_photo_service import upload_user_photo
    try:
        avatar_url = upload_user_photo(admin, target, file, ext)
    except Exception as e:  # noqa: BLE001
        logger.error(f'iCreate photo: upload failed for {target[:8]}: {e}')
        return jsonify({'error': 'Could not upload the photo. Please try again.'}), 500
    return jsonify({'success': True, 'user_id': target, 'avatar_url': avatar_url}), 200
