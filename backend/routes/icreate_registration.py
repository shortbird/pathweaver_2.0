"""
iCreate parent registration funnel (iCreate org only).

Branded, multi-step parent onboarding driven from the org's parent registration
link. Other organizations keep the standard invitation flow (AcceptInvitationPage);
this only activates when the invitation belongs to an org whose
feature_flags.icreate_registration.enabled is true.

Public endpoints (no session required — a freshly-created, not-yet-email-verified
parent drives the funnel via an opaque access_token returned by /register):

    GET  /api/icreate/config/<invitation_code>   -> branding + paperwork + fee config
    POST /api/icreate/register                    -> create parent + kids + links
    POST /api/icreate/registrations/<id>/paperwork-> save acknowledgements
    POST /api/icreate/registrations/<id>/fee      -> record fee + email scheduling link

Account model (see memory: project_icreate_program):
- Parent -> org_managed / org_role='parent' in the iCreate org (email verification
  sent; they set up login later — the funnel itself doesn't need a session).
- Kids under 13 (or 13+ opted "no email") -> COPPA dependents on the parent
  (is_dependent, managed_by_parent_id, role='student', org inherited).
- Kids 13+ with their own email -> org_managed / org_role='student', linked to the
  parent via parent_student_links; a password-setup email is sent to the kid.

Payment is RECORD-ONLY (Optio never processes payments): the fee step records the
amount and points the parent at the org's external payment URL.
"""

import re
import secrets
from datetime import datetime, date

from dateutil.relativedelta import relativedelta
from flask import Blueprint, request, jsonify

from database import get_supabase_admin_client
from middleware.rate_limiter import rate_limit
from utils.validation import sanitize_input
from utils.logger import get_logger
from services.email_service import email_service

logger = get_logger(__name__)

bp = Blueprint('icreate_registration', __name__, url_prefix='/api/icreate')

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

LINK_PLACEHOLDER_SUFFIX = '@pending.optio.local'


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
        # Not an iCreate-registration org — caller should fall back to the standard flow.
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
        'paperwork': [
            {'key': p.get('key'), 'label': p.get('label'), 'doc_url': p.get('doc_url') or ''}
            for p in (cfg.get('paperwork') or [])
            if p.get('key') and p.get('label')
        ],
    }


def _email_in_org(admin, email, org_id):
    r = admin.table('users').select('id').eq('email', email).eq('organization_id', org_id).execute()
    return bool(r.data)


def _email_exists(admin, email):
    r = admin.table('users').select('id').eq('email', email).execute()
    return bool(r.data)


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


def _create_org_parent(admin, org_id, email, password, first, last, dob):
    """Create the parent auth user + org_managed/parent profile. Sends email verification."""
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
    if dob:
        profile['date_of_birth'] = str(dob)
    _insert_user_with_retry(admin, profile)
    try:
        admin.auth.resend({'type': 'signup', 'email': email})
    except Exception as e:  # noqa: BLE001
        logger.warning(f'iCreate: parent verification email failed for {email}: {e}')
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


# ── Endpoints ────────────────────────────────────────────────────────────────

@bp.route('/config/<invitation_code>', methods=['GET'])
@rate_limit(max_requests=60, window_seconds=60)
def get_config(invitation_code):
    """Public: branding + paperwork + fee config for the registration page."""
    data, err = _load_icreate_invite(invitation_code)
    if err:
        return err
    return jsonify({'success': True, **_public_config(data['organization'], data['config'])}), 200


@bp.route('/register', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=300)
def register():
    """Public: create the parent + kids, link them, and open a registration record."""
    body = request.get_json(silent=True) or {}
    code = body.get('code')
    data, err = _load_icreate_invite(code or '')
    if err:
        return err
    org = data['organization']
    cfg = data['config']
    org_id = org['id']
    admin = _admin()

    parent = body.get('parent') or {}
    email = (parent.get('email') or '').strip().lower()
    password = parent.get('password') or ''
    first = sanitize_input(parent.get('first_name', ''))
    last = sanitize_input(parent.get('last_name', ''))
    dob = _parse_dob(parent.get('date_of_birth'))

    if not _valid_email(email):
        return jsonify({'error': 'A valid parent email is required'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    if not first or not last:
        return jsonify({'error': 'Parent first and last name are required'}), 400
    if _email_exists(admin, email):
        return jsonify({'error': 'An account with this email already exists. Please contact iCreate to be added.'}), 409

    # Validate kids up front so we don't create the parent then fail halfway.
    raw_kids = body.get('kids') or []
    kids = []
    for i, k in enumerate(raw_kids):
        kf = sanitize_input(k.get('first_name', ''))
        kl = sanitize_input(k.get('last_name', ''))
        kdob = _parse_dob(k.get('date_of_birth'))
        kemail = (k.get('email') or '').strip().lower()
        as_dependent = bool(k.get('as_dependent'))
        if not kf or not kl:
            return jsonify({'error': f'Child #{i + 1} needs a first and last name'}), 400
        if not kdob:
            return jsonify({'error': f'Child #{i + 1} needs a valid date of birth'}), 400
        age = _calc_age(kdob)
        wants_own_account = age >= 13 and not as_dependent
        if wants_own_account:
            if not _valid_email(kemail):
                return jsonify({'error': f'{kf} is 13+, so they need a valid email (or mark them as managed by you)'}), 400
            if _email_exists(admin, kemail):
                return jsonify({'error': f'The email for {kf} is already in use'}), 409
        kids.append({'first': kf, 'last': kl, 'dob': kdob, 'email': kemail,
                     'own_account': wants_own_account})

    # ── Create everything (best-effort transaction; parent first) ──────────────
    try:
        parent_id = _create_org_parent(admin, org_id, email, password, first, last, dob)
    except Exception as e:  # noqa: BLE001
        logger.error(f'iCreate register: parent creation failed: {e}')
        return jsonify({'error': 'Could not create your account. Please try again.'}), 500

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
            created_kids.append({
                'user_id': kid_id, 'name': f"{k['first']} {k['last']}".strip(),
                'dob': str(k['dob']), 'type': ktype, 'email': k['email'] if k['own_account'] else None,
            })
        except Exception as e:  # noqa: BLE001
            logger.error(f"iCreate register: kid creation failed for {k['first']}: {e}")

    if student_ids:
        try:
            from routes.admin.user_invitations import _create_parent_student_links
            _create_parent_student_links(admin, parent_id, student_ids, org_id)
        except Exception as e:  # noqa: BLE001
            logger.error(f'iCreate register: parent-student linking failed: {e}')

    # Fee is per-family, computed from the number of kids registering (e.g. iCreate:
    # $50/student capped at $125/family). Stored so the later steps are stable even
    # if an admin edits the config mid-funnel.
    fee_cents = _compute_fee_cents(cfg, len(created_kids))
    access_token = secrets.token_urlsafe(32)
    reg = admin.table('icreate_registrations').insert({
        'organization_id': org_id,
        'parent_user_id': parent_id,
        'access_token': access_token,
        'status': 'paperwork',
        'kids': created_kids,
        'fee_cents': fee_cents,
    }).execute()
    reg_row = reg.data[0]

    logger.info(f'iCreate registration {reg_row["id"]} created for org {org_id} '
                f'(parent {parent_id}, {len(created_kids)} kids, fee {fee_cents}c)')
    return jsonify({
        'success': True,
        'registration_id': reg_row['id'],
        'access_token': access_token,
        'status': 'paperwork',
        'parent_email': email,
        'kids': created_kids,
        'fee_cents': fee_cents,
        **_public_config(org, cfg),
    }), 201


def _load_registration(reg_id):
    admin = _admin()
    r = admin.table('icreate_registrations').select('*').eq('id', reg_id).single().execute()
    return r.data


def _authz(reg, token):
    return reg and token and secrets.compare_digest(str(reg.get('access_token')), str(token))


def _org_config(admin, org_id):
    r = admin.table('organizations').select('feature_flags').eq('id', org_id).single().execute()
    return ((r.data or {}).get('feature_flags') or {}).get('icreate_registration') or {}


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


@bp.route('/registrations/<reg_id>/fee', methods=['POST'])
@rate_limit(max_requests=30, window_seconds=300)
def record_fee(reg_id):
    """Record that the fee step is done (payment happens externally) and email the
    parent the external scheduling link. Completes the funnel."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403

    admin = _admin()
    cfg = _org_config(admin, reg['organization_id'])
    fee_cents = int(reg.get('fee_cents') or 0)  # computed per-family at register time
    scheduling_url = cfg.get('scheduling_url') or ''
    now = datetime.utcnow().isoformat()

    # Notify the parent with the external scheduling link.
    emailed_at = None
    parent = admin.table('users').select('email, first_name').eq('id', reg['parent_user_id']).single().execute().data
    org = admin.table('organizations').select('name').eq('id', reg['organization_id']).single().execute().data
    if scheduling_url and parent and parent.get('email'):
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
            logger.warning(f'iCreate: scheduling email failed for registration {reg_id}: {e}')

    admin.table('icreate_registrations').update({
        'fee_cents': fee_cents, 'fee_recorded_at': now, 'scheduling_emailed_at': emailed_at,
        'status': 'completed', 'completed_at': now, 'updated_at': now,
    }).eq('id', reg_id).execute()

    return jsonify({
        'success': True, 'status': 'completed',
        'scheduling_url': scheduling_url,
        'scheduling_emailed': bool(emailed_at),
    }), 200
