"""
Org-generic shared-device kiosk API (/api/kiosk).

Generalizes the Treehouse kiosk (routes/treehouse.py — the reference
implementation) for any organization: a classroom iPad is provisioned once with
a device token; students tap their name on the device, get a real passwordless
session (SessionManager, httpOnly cookies — identical to the Treehouse kiosk
login), and attach photographed work to their quest tasks through the standard
evidence endpoints.

Gated by the per-org feature flag `organizations.feature_flags.kiosk`
(utils/org_features.org_has_feature) instead of a hardcoded org slug, so any
microschool can be enabled with a DB flag and zero code changes.

Devices live in org_kiosk_devices:
  id, organization_id, name, token_hash (sha256, UNIQUE), class_id (nullable —
  optional roster scope), is_active, created_by, created_at, last_used_at

Security model (mirrors treehouse.py):
  - The plaintext device token is returned exactly once at provisioning; only
    its sha256 hash is stored and compared.
  - /roster and /login are public but device-token-gated and rate-limited.
    They are CSRF-exempt via the `_csrf_exempt` view marker (see
    middleware/csrf_protection.py) because a signed-in kiosk browser carries
    the previous student's cookies while re-fetching the roster.
"""

import hashlib
import secrets
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, make_response

from database import get_supabase_admin_client
from middleware.rate_limiter import rate_limit
from utils.auth.decorators import require_role, validate_uuid_param
from utils.org_features import org_has_feature
from utils.session_manager import SessionManager
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('kiosk', __name__, url_prefix='/api/kiosk')

KIOSK_FEATURE = 'kiosk'
TOKEN_PREFIX = 'ksk_'  # cosmetic prefix so admins can recognize kiosk tokens


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    """
    org_id = device['organization_id']
    rows = admin.table('users')\
        .select('id, first_name, last_name, display_name, avatar_url, role, org_role, org_roles')\
        .eq('organization_id', org_id).execute().data or []
    students = [u for u in rows if _is_student(u)]

    if device.get('class_id'):
        enrolled = admin.table('class_enrollments').select('student_id')\
            .eq('class_id', device['class_id']).eq('status', 'active').execute().data or []
        enrolled_ids = {e['student_id'] for e in enrolled}
        students = [s for s in students if s['id'] in enrolled_ids]
    return students


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
@require_role('org_admin', 'superadmin')
def create_device(user_id):
    """
    Provision a shared kiosk device for an org. Body: {name, class_id?,
    organization_id? (superadmin only)}. Returns the plaintext token ONCE;
    only its sha256 hash is stored (same model as the Treehouse kiosk).
    """
    data = request.get_json() or {}
    admin = get_supabase_admin_client()
    org_id, err = _caller_org_id(admin, user_id, data.get('organization_id'))
    if err:
        return err

    if not org_has_feature(org_id, KIOSK_FEATURE):
        return jsonify({'success': False,
                        'error': 'Kiosk is not enabled for this organization'}), 403

    name = (data.get('name') or 'Classroom device').strip()
    class_id = data.get('class_id') or None
    if class_id:
        cls = admin.table('org_classes').select('id, organization_id')\
            .eq('id', class_id).limit(1).execute()
        if not cls.data or cls.data[0].get('organization_id') != org_id:
            return jsonify({'success': False, 'error': 'Class not found in this organization'}), 404

    token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    ins = admin.table('org_kiosk_devices').insert({
        'organization_id': org_id,
        'name': name,
        'token_hash': _hash_token(token),
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
                   'organization_id': org_id, 'is_active': True,
                   'created_at': device.get('created_at')},
        # Shown once — never retrievable again.
        'device_token': token,
    }), 201


@bp.route('/devices', methods=['GET'])
@require_role('org_admin', 'superadmin')
def list_devices(user_id):
    """List the org's kiosk devices (no token hashes). Superadmin: ?organization_id=."""
    admin = get_supabase_admin_client()
    org_id, err = _caller_org_id(admin, user_id, request.args.get('organization_id'))
    if err:
        return err

    res = admin.table('org_kiosk_devices')\
        .select('id, organization_id, name, class_id, is_active, created_at, last_used_at')\
        .eq('organization_id', org_id).order('created_at', desc=True).execute()
    devices = res.data or []

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
        'kiosk_enabled': org_has_feature(org_id, KIOSK_FEATURE),
    }), 200


@bp.route('/devices/<device_id>/deactivate', methods=['POST'])
@require_role('org_admin', 'superadmin')
@validate_uuid_param('device_id')
def deactivate_device(user_id, device_id):
    """Deactivate a device token (soft revoke — the row is kept for audit)."""
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

    admin = get_supabase_admin_client()
    device = _get_active_device_by_token(admin, token)
    if not device:
        return jsonify({'success': False, 'error': 'Invalid device token'}), 401
    if not org_has_feature(device['organization_id'], KIOSK_FEATURE):
        return jsonify({'success': False,
                        'error': 'Kiosk is not enabled for this organization'}), 403
    _touch_device(admin, device['id'])

    students = sorted(
        (_student_payload(u) for u in _device_scope_students(admin, device)),
        key=lambda s: (s['name'] or '').lower(),
    )

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

    admin = get_supabase_admin_client()
    device = _get_active_device_by_token(admin, token)
    if not device:
        return jsonify({'success': False, 'error': 'Invalid device token'}), 401
    if not org_has_feature(device['organization_id'], KIOSK_FEATURE):
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
