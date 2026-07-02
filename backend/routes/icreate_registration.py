"""
iCreate parent registration funnel (iCreate org only).

Branded, multi-step parent onboarding driven from the org's parent registration
link. Other organizations keep the standard invitation flow (AcceptInvitationPage);
this only activates when the invitation belongs to an org whose
feature_flags.icreate_registration.enabled is true.

Account-first flow: the parent creates their Optio account (or signs into an
existing one) BEFORE seeing the rest of the form.

    GET  /api/icreate/config/<invitation_code>    -> branding + questions + paperwork + fee config
    POST /api/icreate/start                        -> create parent account, email a 6-digit code
    POST /api/icreate/verify                       -> confirm the code -> issues the funnel access_token
    POST /api/icreate/resend-code                  -> re-email a fresh code
    POST /api/icreate/login                        -> existing Optio account (password) -> attach to iCreate
    POST /api/icreate/registrations/<id>/family    -> phone/address + kids -> creates accounts + household
    POST /api/icreate/registrations/<id>/details   -> emergency contacts + org questions
    POST /api/icreate/registrations/<id>/paperwork -> acknowledge/e-sign paperwork
    POST /api/icreate/registrations/<id>/fee       -> record fee + email scheduling link

Security model: all endpoints are public/pre-session (CSRF-exempt). The funnel
access_token is only revealed AFTER the email is verified (new accounts) or the
password checks out (existing accounts); every later step requires it. The OTP
is 6 digits, sha256-hashed at rest, 10-minute expiry, sent via our own SendGrid
email (no dependency on Supabase auth email templates).

Existing-account guardrails on /login: superadmins are refused; accounts already
in a DIFFERENT organization are refused (we never silently move someone between
orgs); iCreate student/advisor accounts are refused (this is a parent flow).
Platform accounts are attached as org_managed/parent automatically.

Account model (see memory: project_icreate_program):
- Kids under 13 (or 13+ opted "no email") -> COPPA dependents on the parent.
- Kids 13+ with their own email -> org_managed/student + parent_student_links.
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


def _public_config(org, cfg):
    """The subset of config safe to expose to the (unauthenticated) registration page."""
    return {
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
        # Whether verified card payment (the org's own Stripe account) is on.
        # The key itself is never exposed.
        'stripe_enabled': bool(cfg.get('stripe_secret_key')),
        'paperwork': [
            {'key': p.get('key'), 'label': p.get('label'),
             'doc_url': p.get('doc_url') or '', 'body': p.get('body') or ''}
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
    r = admin.table('users').select('id, email, first_name, last_name').eq('id', parent_id).single().execute()
    return r.data or {}


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


# ── Endpoints ────────────────────────────────────────────────────────────────

@bp.route('/config/<invitation_code>', methods=['GET'])
@rate_limit(max_requests=60, window_seconds=60)
def get_config(invitation_code):
    """Public: branding + questions + paperwork + fee config for the registration page."""
    data, err = _load_icreate_invite(invitation_code)
    if err:
        return err
    return jsonify({'success': True, **_public_config(data['organization'], data['config'])}), 200


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
    if not reg or reg.get('status') == 'completed':
        return jsonify({'success': True, 'registration': None}), 200

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

    return jsonify({
        'success': True,
        'registration': {
            'registration_id': reg['id'],
            'access_token': reg['access_token'],
            'status': reg['status'],
            'kids': reg.get('kids') or [],
            'fee_cents': reg.get('fee_cents'),
            'answers': reg.get('answers') or {},
            'emergency_contacts': reg.get('emergency_contacts') or [],
            'paperwork': reg.get('paperwork') or [],
            'household': household,
        },
        **_public_config(org, cfg),
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
           .select('id, role, org_role, organization_id, first_name, last_name')
           .eq('email', email).limit(1).execute()).data
    if not row:
        return jsonify({'error': 'No Optio account with this email — create one instead.'}), 404
    user = row[0]

    # Guardrails: never silently move accounts between orgs or repurpose
    # privileged/student accounts as iCreate parents.
    if user.get('role') == 'superadmin':
        return jsonify({'error': 'This account cannot be used here.'}), 403
    if user.get('organization_id') and user['organization_id'] != org_id:
        return jsonify({'error': 'This account belongs to another school. Please contact iCreate.'}), 409
    if user.get('organization_id') == org_id and user.get('org_role') and user['org_role'] != 'parent':
        return jsonify({'error': 'This is not a parent account. Please register with a parent email.'}), 409

    if not _password_ok(email, password):
        return jsonify({'error': 'Incorrect password. If you signed up with Google, use "Create account" with a different email or contact iCreate.'}), 401

    # Attach to iCreate as a parent (no-op for existing iCreate parents).
    admin.table('users').update({
        'organization_id': org_id,
        'role': 'org_managed',
        'org_role': 'parent',
        'org_roles': ['parent'],
    }).eq('id', user['id']).execute()

    now = datetime.utcnow().isoformat()
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
    prior_kids = [k.get('user_id') for k in (reg.get('kids') or []) if k.get('user_id')]
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
        if wants_own_account:
            if not _valid_email(kemail):
                return jsonify({'error': f'{kf} is 13+, so they need a valid email (or mark them as managed by you)'}), 400
            # On back-edit, the same teen's prior account holds this email — that's
            # not a conflict (the prior account is replaced below).
            taken = (admin.table('users').select('id').eq('email', kemail).execute()).data or []
            if any(t['id'] not in prior_kids for t in taken):
                return jsonify({'error': f'The email for {kf} is already in use'}), 409
        kids.append({'first': kf, 'last': kl, 'dob': kdob, 'email': kemail,
                     'own_account': wants_own_account,
                     'preferred_name': sanitize_input(k.get('preferred_name', '')) or None,
                     'gender': gender, 'allergies': allergies, 'medications': medications})

    # Back-editing: this step ran before, so tear down what it created (kid
    # accounts, links, contacts, household) and rebuild from the new payload.
    # Runs only AFTER validation so bad input never leaves a half-deleted family.
    # Safe mid-funnel: the accounts were created moments ago and have no activity.
    if prior_kids:
        try:
            admin.table('emergency_contacts').delete().in_('student_user_id', prior_kids).execute()
            admin.table('parent_student_links').delete().in_('student_user_id', prior_kids).execute()
            hh_rows = (admin.table('households').select('id')
                       .eq('organization_id', org_id)
                       .eq('primary_contact_user_id', reg['parent_user_id']).execute()).data or []
            hh_ids = [h['id'] for h in hh_rows]
            if hh_ids:
                admin.table('household_members').delete().in_('household_id', hh_ids).execute()
                admin.table('households').delete().in_('id', hh_ids).execute()
            admin.table('users').delete().in_('id', prior_kids).execute()
            for kid_id in prior_kids:
                try:
                    admin.auth.admin.delete_user(kid_id)
                except Exception as e:  # noqa: BLE001
                    logger.warning(f'iCreate family re-edit: auth cleanup failed for {kid_id[:8]}: {e}')
        except Exception as e:  # noqa: BLE001
            logger.error(f'iCreate family re-edit: teardown failed for {reg_id}: {e}')
            return jsonify({'error': 'Could not update your family. Please contact iCreate.'}), 500

    created_kids = []
    student_ids = []
    for k in kids:
        try:
            if k['own_account']:
                kid_id = _create_org_student(admin, org_id, k['email'], k['first'], k['last'], k['dob'])
                student_ids.append(kid_id)
                ktype = 'student'
            else:
                kid_id = _create_dependent(admin, parent_id, org_id, k['first'], k['last'], k['dob'])
                ktype = 'dependent'
            extras = {f: k[f] for f in ('preferred_name', 'gender', 'allergies', 'medications') if k.get(f)}
            if extras:
                admin.table('users').update(extras).eq('id', kid_id).execute()
            created_kids.append({
                'user_id': kid_id, 'name': f"{k['first']} {k['last']}".strip(),
                'first_name': k['first'], 'last_name': k['last'],
                'dob': str(k['dob']), 'type': ktype, 'email': k['email'] if k['own_account'] else None,
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
    try:
        hh = admin.table('households').insert({
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
            'registration_tier': (directive or {}).get('registration_tier'),
        }).execute()
        household_id = hh.data[0]['id']
        members = [{'household_id': household_id, 'user_id': parent_id,
                    'relationship': 'guardian', 'is_primary_guardian': True}]
        members += [{'household_id': household_id, 'user_id': ck['user_id'],
                     'relationship': 'student', 'is_primary_guardian': False}
                    for ck in created_kids]
        admin.table('household_members').insert(members).execute()
        if directive:
            admin.table('sis_family_directives').update({
                'matched_household_id': household_id,
                'updated_at': datetime.utcnow().isoformat(),
            }).eq('id', directive['id']).execute()
    except Exception as e:  # noqa: BLE001
        logger.error(f'iCreate family: household creation failed: {e}')

    # Fee is per-family, computed from the number of kids registering. Stored so
    # later steps are stable even if an admin edits the config mid-funnel.
    # Families who already paid on the school's legacy form owe nothing.
    fee_cents = 0 if (directive and directive.get('fee_prepaid')) \
        else _compute_fee_cents(cfg, len(created_kids))
    admin.table('icreate_registrations').update({
        'kids': created_kids, 'fee_cents': fee_cents,
        'status': 'details', 'updated_at': datetime.utcnow().isoformat(),
    }).eq('id', reg_id).execute()

    logger.info(f'iCreate family: registration {reg_id} has {len(created_kids)} kids, fee {fee_cents}c')
    return jsonify({'success': True, 'status': 'details', 'kids': created_kids, 'fee_cents': fee_cents}), 200


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


def _complete_registration(admin, reg, cfg, extra_fields=None):
    """Shared completion: email the scheduling link and mark the funnel done.
    Returns the response payload."""
    scheduling_url = _abs_url(cfg.get('scheduling_url'))
    now = datetime.utcnow().isoformat()

    emailed_at = None
    parent = _parent_row(admin, reg['parent_user_id'])
    org = admin.table('organizations').select('name').eq('id', reg['organization_id']).single().execute().data
    if scheduling_url and parent.get('email'):
        try:
            org_name = (org or {}).get('name') or 'iCreate'
            html = (
                f"<p>Hi {parent.get('first_name') or 'there'},</p>"
                f"<p>Thanks for registering with {org_name}! The last step is to book your "
                f"custom learning plan appointment.</p>"
                f"<p><a href=\"{scheduling_url}\">Book your appointment</a></p>"
                f"<p>If the link doesn't work, copy and paste this into your browser:<br>{scheduling_url}</p>"
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

    admin.table('icreate_registrations').update({
        'stripe_session_id': session.id, 'updated_at': datetime.utcnow().isoformat(),
    }).eq('id', reg_id).execute()

    return jsonify({'success': True, 'checkout_url': session.url}), 200


@bp.route('/registrations/<reg_id>/confirm-payment', methods=['POST'])
@rate_limit(max_requests=30, window_seconds=300)
def confirm_payment(reg_id):
    """Server-side payment verification (the passback): retrieve the Checkout
    Session from Stripe with the school's key and check it is PAID for the right
    amount and registration. Never trusts the browser. Completes the funnel."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403

    admin = _admin()
    cfg = _org_config(admin, reg['organization_id'])
    if reg.get('status') == 'completed':
        return jsonify({'success': True, 'status': 'completed', 'already': True, 'paid': True,
                        'scheduling_url': _abs_url(cfg.get('scheduling_url')),
                        'scheduling_emailed': bool(reg.get('scheduling_emailed_at'))}), 200
    secret = cfg.get('stripe_secret_key')
    session_id = reg.get('stripe_session_id')
    if not secret or not session_id:
        return jsonify({'error': 'No payment to verify for this registration'}), 400

    try:
        import stripe
        session = stripe.checkout.Session.retrieve(session_id, api_key=secret)
    except Exception as e:  # noqa: BLE001
        logger.error(f'iCreate confirm-payment: retrieve failed for {reg_id}: {e}')
        return jsonify({'error': 'Could not verify the payment. Please try again.'}), 502

    if (session.get('metadata') or {}).get('registration_id') != reg['id']:
        return jsonify({'error': 'Payment does not match this registration'}), 400
    if session.get('payment_status') != 'paid':
        return jsonify({'success': False, 'paid': False,
                        'error': "We haven't received your payment yet. Complete the payment and try again."}), 402
    if int(session.get('amount_total') or 0) != int(reg.get('fee_cents') or 0):
        logger.warning(f'iCreate confirm-payment: amount mismatch for {reg_id}: '
                       f'{session.get("amount_total")} != {reg.get("fee_cents")}')
        return jsonify({'error': 'Payment amount mismatch — please contact the school.'}), 400

    result = _complete_registration(admin, reg, cfg, extra_fields={
        'fee_paid_at': datetime.utcnow().isoformat(),
        'stripe_payment_ref': str(session.get('payment_intent') or session_id),
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
    fee_cents = int(reg.get('fee_cents') or 0)  # computed per-family at the family step
    if cfg.get('stripe_secret_key') and fee_cents > 0:
        return jsonify({'error': 'Please pay the registration fee by card to finish.'}), 402

    result = _complete_registration(admin, reg, cfg, extra_fields={'fee_cents': fee_cents})
    return jsonify(result), 200
