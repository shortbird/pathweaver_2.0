"""
Org-generic shared-device kiosk API (/api/kiosk).

Generalizes the Treehouse kiosk (routes/treehouse.py — the reference
implementation) for any organization: a classroom iPad is provisioned once with
a device token; students tap their name on the device, get a real passwordless
session (SessionManager, httpOnly cookies — identical to the Treehouse kiosk
login), and attach photographed work to their quest tasks through the standard
evidence endpoints.

Gated by the `kiosk` building block (modules.module_enabled: an explicit
`feature_flags.modules.kiosk` entry, else the legacy flat `feature_flags.kiosk`)
instead of a hardcoded org slug, so any microschool can be enabled from the
Blocks panel with zero code changes. The block has no SIS parent -- the kiosk
uses only core LMS surfaces -- so an LMS-only school can run it too.

The gate is called inline rather than through modules.gate.module_guard: the
roster and login routes are pre-session and resolve the org from the DEVICE
token, while the blueprint guard resolves it from the caller.

Devices live in org_kiosk_devices:
  id, organization_id, name, token_hash (sha256, UNIQUE), token (plaintext,
  nullable), class_id (nullable — optional roster scope), is_active,
  created_by, created_at, last_used_at

Security model (mirrors treehouse.py, with one deliberate difference):
  - Lookups go through the sha256 hash. The plaintext code is ALSO stored, and
    the device list hands it back to the org's admins so the settings card can
    show it at any time (2026-09-07: it used to be shown once and lost, which
    meant re-pairing the iPad). An org admin already manages every student the
    code can log in, so hiding it from them bought nothing. Devices provisioned
    before the column exists have no plaintext; the card says so.
  - /roster and /login are public but device-token-gated and rate-limited.
    They are CSRF-exempt via the `_csrf_exempt` view marker (see
    middleware/csrf_protection.py) because a signed-in kiosk browser carries
    the previous student's cookies while re-fetching the roster.
"""

import hashlib
import secrets

from flask import Blueprint, request, jsonify, make_response

from database import get_supabase_admin_client
from middleware.rate_limiter import rate_limit
from utils.auth.decorators import require_role, validate_uuid_param
from utils.sis_roles import ADMIN_ROLES
from modules import module_enabled
from utils.db_fetch import fetch_all_rows
from utils.session_manager import SessionManager
from utils.logger import get_logger
from utils.storage_urls import sign_in_place

logger = get_logger(__name__)

bp = Blueprint('kiosk', __name__, url_prefix='/api/kiosk')

KIOSK_MODULE = 'kiosk'
TOKEN_PREFIX = 'ksk_'  # cosmetic prefix so admins can recognize kiosk tokens


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


from utils.timestamps import now_iso as _now_iso  # noqa: E402


def _caller_org_id(admin, user_id, requested_org_id=None):
    """
    Resolve which organization the caller is acting on.

    Superadmin may target any org via an explicit organization_id; org_admins
    always act on their own organization. Returns (org_id, error_response).
    """
    res = admin.table('users').select('id, role, organization_id')\
        .eq('id', user_id).limit(1).execute()
    user = res.data[0] if res.data else None
    if not user:
        return None, (jsonify({'success': False, 'error': 'User not found'}), 404)
    if user.get('role') == 'superadmin':
        org_id = requested_org_id or user.get('organization_id')
        if not org_id:
            return None, (jsonify({'success': False,
                                   'error': 'organization_id is required for superadmin'}), 400)
        return org_id, None
    org_id = user.get('organization_id')
    if not org_id:
        return None, (jsonify({'success': False, 'error': 'No organization'}), 403)
    return org_id, None


def _get_active_device_by_token(admin, token):
    """Active device row for a plaintext token, or None. Never exposes hashes."""
    if not token:
        return None
    res = admin.table('org_kiosk_devices')\
        .select('id, organization_id, name, class_id, is_active')\
        .eq('token_hash', _hash_token(token)).eq('is_active', True)\
        .limit(1).execute()
    return res.data[0] if res.data else None


def _touch_device(admin, device_id):
    try:
        admin.table('org_kiosk_devices').update({'last_used_at': _now_iso()})\
            .eq('id', device_id).execute()
    except Exception as e:
        logger.warning(f"Kiosk touch_device failed for {device_id[:8]}: {e}")


def _is_student(user_row):
    """Effective-student check covering org students, multi-role users, and dependents."""
    roles = {user_row.get('role'), user_row.get('org_role')}
    roles.update(user_row.get('org_roles') or [])
    return 'student' in roles


def _device_scope_students(admin, device):
    """
    Students selectable on this device: the org's students, or — when the
    device is scoped to a class — only that class's active enrollments.
    Returns a list of user rows (id, names, avatar_url).

    Both reads grow with the org, so both page: a roster silently cut at the
    PostgREST cap would drop the students sorted past it off the name grid
    with nothing to say why (CLAUDE.md, Row Limits).
    """
    org_id = device['organization_id']
    rows = fetch_all_rows(lambda: (
        admin.table('users')
        .select('id, first_name, last_name, display_name, avatar_url, role, org_role, org_roles')
        .eq('organization_id', org_id)))
    students = [u for u in rows if _is_student(u)]

    if device.get('class_id'):
        enrolled = fetch_all_rows(lambda: (
            admin.table('class_enrollments').select('id, student_id')
            .eq('class_id', device['class_id']).eq('status', 'active')))
        enrolled_ids = {e['student_id'] for e in enrolled}
        students = [s for s in students if s['id'] in enrolled_ids]
    return students


def _class_in_org(admin, class_id, org_id):
    """The org_classes row for `class_id` if it belongs to `org_id`, else an
    error response. A device may only be scoped to its own school's class."""
    cls = admin.table('org_classes').select('id, organization_id, name')\
        .eq('id', class_id).limit(1).execute()
    if not cls.data or cls.data[0].get('organization_id') != org_id:
        return None, (jsonify({'success': False,
                               'error': 'Class not found in this organization'}), 404)
    return cls.data[0], None


def _student_payload(u):
    name = u.get('first_name') or u.get('display_name') or ''
    display = u.get('display_name') or ' '.join(
        p for p in [u.get('first_name'), u.get('last_name')] if p)
    return {
        'id': u['id'],
        'name': name or display or 'Student',
        'display_name': display or name or 'Student',
        'avatar_url': u.get('avatar_url'),
    }


# ── admin: device provisioning ───────────────────────────────────────────────
@bp.route('/devices', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_device(user_id):
    """
    Provision a shared kiosk device for an org. Body: {name, class_id?,
    organization_id? (superadmin only)}. Returns the plaintext code; the list
    endpoint returns it again for as long as the device is active.
    """
    data = request.get_json() or {}
    # admin client justified: role-gated (org_admin/superadmin) provisioning write of a device-token hash to org_kiosk_devices, an org-level table
    admin = get_supabase_admin_client()
    org_id, err = _caller_org_id(admin, user_id, data.get('organization_id'))
    if err:
        return err

    if not module_enabled(org_id, KIOSK_MODULE):
        return jsonify({'success': False,
                        'error': 'Kiosk is not enabled for this organization'}), 403

    name = (data.get('name') or 'Classroom device').strip()
    class_id = data.get('class_id') or None
    class_name = None
    if class_id:
        cls, err = _class_in_org(admin, class_id, org_id)
        if err:
            return err
        class_name = cls.get('name')

    token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    ins = admin.table('org_kiosk_devices').insert({
        'organization_id': org_id,
        'name': name,
        'token_hash': _hash_token(token),
        'token': token,
        'class_id': class_id,
        'is_active': True,
        'created_by': user_id,
    }).execute()
    if not ins.data:
        return jsonify({'success': False, 'error': 'Failed to create device'}), 500
    device = ins.data[0]
    logger.info(f"Kiosk device provisioned: {device['id'][:8]} org {org_id[:8]} by {user_id[:8]}")
    return jsonify({
        'success': True,
        'device': {'id': device['id'], 'name': name, 'class_id': class_id,
                   'class_name': class_name, 'organization_id': org_id,
                   'is_active': True, 'created_at': device.get('created_at'),
                   'token': token},
        'device_token': token,
    }), 201


@bp.route('/devices/<device_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
@validate_uuid_param('device_id')
def update_device(user_id, device_id):
    """
    Change which students a device lists, or rename it. Body: {class_id: uuid}
    limits the name grid to that class's active roster, {class_id: null} lists
    the whole school; {name} renames. The org's own admins manage this from
    the settings card (2026-09-07 — it used to take a hand edit by Optio).
    The device picks the change up on its next roster refresh, so the iPad
    never needs re-pairing.
    """
    data = request.get_json() or {}
    # admin client justified: role-gated edit of an org kiosk device; the device's org is matched against the caller's org before the write
    admin = get_supabase_admin_client()
    res = admin.table('org_kiosk_devices').select('id, organization_id, name, class_id')\
        .eq('id', device_id).limit(1).execute()
    if not res.data:
        return jsonify({'success': False, 'error': 'Device not found'}), 404
    device = res.data[0]

    org_id, err = _caller_org_id(admin, user_id, device['organization_id'])
    if err:
        return err
    if device['organization_id'] != org_id:
        return jsonify({'success': False, 'error': 'Device not found'}), 404

    changes = {}
    class_name = None
    if 'name' in data:
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'success': False, 'error': 'name cannot be empty'}), 400
        changes['name'] = name
    if 'class_id' in data:
        class_id = data.get('class_id') or None
        if class_id:
            cls, err = _class_in_org(admin, class_id, org_id)
            if err:
                return err
            class_name = cls.get('name')
        changes['class_id'] = class_id
    if not changes:
        return jsonify({'success': False, 'error': 'Nothing to update'}), 400

    admin.table('org_kiosk_devices').update(changes).eq('id', device_id).execute()
    logger.info(f"Kiosk device updated: {device_id[:8]} {sorted(changes)} by {user_id[:8]}")
    return jsonify({
        'success': True,
        'device': {**device, **changes, 'class_name': class_name},
    }), 200


@bp.route('/devices', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_devices(user_id):
    """List the org's kiosk devices with their codes (never the hashes).
    Deactivated devices come back without a code — it no longer opens
    anything. Superadmin: ?organization_id=."""
    # admin client justified: role-gated read of the org's kiosk-device rows (org-level table); _caller_org_id pins the caller to their own org
    admin = get_supabase_admin_client()
    org_id, err = _caller_org_id(admin, user_id, request.args.get('organization_id'))
    if err:
        return err

    res = admin.table('org_kiosk_devices')\
        .select('id, organization_id, name, token, class_id, is_active, created_at, last_used_at')\
        .eq('organization_id', org_id).order('created_at', desc=True).execute()
    devices = res.data or []
    for d in devices:
        if not d.get('is_active'):
            d['token'] = None

    # Hydrate class names for scoped devices.
    class_ids = list({d['class_id'] for d in devices if d.get('class_id')})
    class_names = {}
    if class_ids:
        classes = admin.table('org_classes').select('id, name')\
            .in_('id', class_ids).execute().data or []
        class_names = {c['id']: c.get('name') for c in classes}
    for d in devices:
        d['class_name'] = class_names.get(d.get('class_id'))

    return jsonify({
        'success': True,
        'devices': devices,
        'kiosk_enabled': module_enabled(org_id, KIOSK_MODULE),
    }), 200


@bp.route('/devices/<device_id>/deactivate', methods=['POST'])
@require_role(*ADMIN_ROLES)
@validate_uuid_param('device_id')
def deactivate_device(user_id, device_id):
    """Deactivate a device token (soft revoke — the row is kept for audit)."""
    # admin client justified: role-gated revoke of an org kiosk device; the device's org is matched against the caller's org before the write
    admin = get_supabase_admin_client()
    res = admin.table('org_kiosk_devices').select('id, organization_id')\
        .eq('id', device_id).limit(1).execute()
    if not res.data:
        return jsonify({'success': False, 'error': 'Device not found'}), 404
    device = res.data[0]

    org_id, err = _caller_org_id(admin, user_id, device['organization_id'])
    if err:
        return err
    if device['organization_id'] != org_id:
        return jsonify({'success': False, 'error': 'Device not found'}), 404

    admin.table('org_kiosk_devices').update({'is_active': False})\
        .eq('id', device_id).execute()
    logger.info(f"Kiosk device deactivated: {device_id[:8]} by {user_id[:8]}")
    return jsonify({'success': True}), 200


# ── kiosk device: token-gated roster + passwordless login ────────────────────
@bp.route('/roster', methods=['POST'])
@rate_limit(limit=30, per=60)
def kiosk_roster():
    """
    Token-gated: org branding + the student picker roster for this device.
    Public (no session) — the device token is the credential.
    """
    data = request.get_json(silent=True) or {}
    token = (data.get('token') or data.get('device_token') or '').strip()
    if not token:
        return jsonify({'success': False, 'error': 'token required'}), 400

    # admin client justified: pre-auth kiosk flow (no session); the hashed device token is the credential and the roster is scoped to that device's org/class
    admin = get_supabase_admin_client()
    device = _get_active_device_by_token(admin, token)
    if not device:
        return jsonify({'success': False, 'error': 'Invalid device token'}), 401
    if not module_enabled(device['organization_id'], KIOSK_MODULE):
        return jsonify({'success': False,
                        'error': 'Kiosk is not enabled for this organization'}), 403
    _touch_device(admin, device['id'])

    students = sorted(
        (_student_payload(u) for u in _device_scope_students(admin, device)),
        key=lambda s: (s['name'] or '').lower(),
    )
    # Pre-auth by design — the device token IS the credential, and it has just
    # been checked. So the picker photos are minted as short-lived signed URLs
    # rather than the permanent public ones this used to hand a classroom iPad:
    # the kiosk needs faces for a six-year-old to find their own name, but the
    # link it renders must die with the TTL, not outlive the school year.
    sign_in_place(students, ['avatar_url'])

    org_res = admin.table('organizations').select('name, branding_config')\
        .eq('id', device['organization_id']).limit(1).execute()
    org_name, logo_url, colors = None, None, {}
    if org_res.data:
        org_name = org_res.data[0].get('name')
        branding = org_res.data[0].get('branding_config') or {}
        # logo_url may be a huge base64 data URL — returned as-is by design.
        logo_url = branding.get('logo_url')
        colors = {
            'primary': branding.get('primary_color'),
            'secondary': branding.get('secondary_color'),
        }

    return jsonify({
        'success': True,
        'org': {'name': org_name, 'logo_url': logo_url, 'colors': colors},
        'device': {'name': device.get('name'), 'class_id': device.get('class_id')},
        'students': students,
    }), 200


# CSRF marker: pre-session endpoint gated by the device token, but the kiosk
# browser may still carry the previous student's auth cookies while polling the
# roster (middleware/csrf_protection.py honors this attribute — no shared-file
# allowlist edit needed).
kiosk_roster._csrf_exempt = True


@bp.route('/login', methods=['POST'])
@rate_limit(limit=20, per=60)
def kiosk_login():
    """
    Passwordless student login on a provisioned shared device. Verifies the
    device token and that the chosen student is in the device's scope, then
    mints a normal session (SessionManager) and sets httpOnly cookies —
    exactly the Treehouse kiosk login model.
    """
    data = request.get_json(silent=True) or {}
    token = (data.get('token') or data.get('device_token') or '').strip()
    student_id = (data.get('student_id') or '').strip()
    if not token or not student_id:
        return jsonify({'success': False, 'error': 'token and student_id required'}), 400

    # admin client justified: pre-auth passwordless login; hashed device token + device-scope membership check gate the session mint
    admin = get_supabase_admin_client()
    device = _get_active_device_by_token(admin, token)
    if not device:
        return jsonify({'success': False, 'error': 'Invalid device token'}), 401
    if not module_enabled(device['organization_id'], KIOSK_MODULE):
        return jsonify({'success': False,
                        'error': 'Kiosk is not enabled for this organization'}), 403

    allowed = {u['id'] for u in _device_scope_students(admin, device)}
    if student_id not in allowed:
        return jsonify({'success': False, 'error': 'Student not on this device'}), 403

    sm = SessionManager()
    access = sm.generate_access_token(student_id)
    refresh = sm.generate_refresh_token(student_id)
    _touch_device(admin, device['id'])

    student = admin.table('users').select('id, first_name, display_name')\
        .eq('id', student_id).limit(1).execute().data
    first_name = (student[0].get('first_name') or student[0].get('display_name')) if student else None

    resp = make_response(jsonify({'success': True, 'user_id': student_id,
                                  'first_name': first_name}))
    sm.set_auth_cookies(resp, student_id, access_token=access, refresh_token=refresh)
    logger.info(f"Kiosk login: student {student_id[:8]} via device {device['id'][:8]}")
    return resp


kiosk_login._csrf_exempt = True
