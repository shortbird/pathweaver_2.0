"""
SIS teacher portal routes — what an advisor (teacher) can do in the SIS.

All endpoints are staff-gated but SCOPED: teachers only reach their own
classes (sis_service.class_scope), their own time entries, their own
onboarding, and their own submissions. Org admins can call these too (the
scope check passes everything for them).
"""

import io
import uuid as _uuid

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_staff_service as staff
from services import sis_forms_service as forms
from services import sis_onboarding_service as onboarding
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_staff_portal', __name__, url_prefix='/api/sis/teacher')

STAFF_ROLES = ('org_admin', 'advisor', 'superadmin')

_STAFF_DOCS_BUCKET = 'staff-documents'  # PRIVATE bucket (onboarding uploads)
_DOC_EXTENSIONS = {'pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp'}
_MAX_DOC_BYTES = 10 * 1024 * 1024


def _org_or_error(user_id):
    body = request.get_json(silent=True) or {}
    requested = request.args.get('organization_id') or body.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


def _read_target(user_id, org_id):
    """Whose portal data a read endpoint returns. Admins may preview another
    staff member's portal via ?teacher_id= ("View portal" on the Staff page);
    everyone else always gets their own. Write endpoints never use this —
    clocking in, submitting forms, and checking off items stay caller-bound."""
    target = request.args.get('teacher_id') or \
        (request.get_json(silent=True) or {}).get('teacher_id')
    if not target or target == user_id or not sis_service.caller_is_admin(user_id):
        return user_id
    row = (get_supabase_admin_client().table('users').select('id, organization_id')
           .eq('id', target).limit(1).execute()).data
    if row and row[0].get('organization_id') == org_id:
        return target
    return user_id


@bp.route('/dashboard', methods=['GET'])
@require_role(*STAFF_ROLES)
def dashboard(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    target = _read_target(user_id, org_id)
    return jsonify({'success': True, 'data': staff.teacher_dashboard(target, org_id)})


@bp.route('/classes', methods=['GET'])
@require_role(*STAFF_ROLES)
def my_classes(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    target = _read_target(user_id, org_id)
    return jsonify({'success': True, 'classes': staff.teacher_classes(target, org_id)})


@bp.route('/classes/<class_id>/roster', methods=['GET'])
@require_role(*STAFF_ROLES)
def class_roster(user_id, class_id):
    """Roster with guardian contacts + health/safety alerts. Access is limited
    to the class's own teachers (and admins) and every view is access-logged."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    scope = sis_service.class_scope(user_id, org_id)
    if scope is not None and class_id not in scope:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    cls = (get_supabase_admin_client().table('org_classes')
           .select('id, name, organization_id').eq('id', class_id).limit(1).execute()).data
    if not cls or cls[0].get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    role = 'org_admin' if scope is None else 'advisor'
    data = staff.class_roster_detail(org_id, class_id, user_id, role)
    return jsonify({'success': True, 'class': {'id': cls[0]['id'], 'name': cls[0]['name']},
                    **data})


@bp.route('/schedule', methods=['GET'])
@require_role(*STAFF_ROLES)
def schedule(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    target = _read_target(user_id, org_id)
    return jsonify({'success': True, **staff.teacher_schedule(target, org_id)})


@bp.route('/directory', methods=['GET'])
@require_role(*STAFF_ROLES)
def directory(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'staff': staff.staff_directory(org_id)})


@bp.route('/profile', methods=['GET'])
@require_role(*STAFF_ROLES)
def my_profile(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    profile = staff.get_staff_profile(org_id, _read_target(user_id, org_id))
    # Employment rate details are admin-facing; the teacher sees the rest.
    profile.pop('hourly_rate_cents', None)
    return jsonify({'success': True, 'profile': profile})


@bp.route('/profile', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_my_profile(user_id):
    """Teachers maintain their own emergency contact info."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = staff.upsert_staff_profile(org_id, user_id, request.get_json() or {},
                                        allowed=staff.SELF_PROFILE_FIELDS)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


# ── Forms ────────────────────────────────────────────────────────────────────

@bp.route('/forms', methods=['GET'])
@require_role(*STAFF_ROLES)
def my_forms(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True,
                    'submissions': forms.list_mine(org_id, _read_target(user_id, org_id)),
                    'form_types': forms.FORM_TYPES})


@bp.route('/forms', methods=['POST'])
@require_role(*STAFF_ROLES)
def submit_form(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = forms.submit(org_id, user_id, request.get_json() or {})
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result}), 201


# ── Onboarding (mine) ────────────────────────────────────────────────────────

@bp.route('/onboarding', methods=['GET'])
@require_role(*STAFF_ROLES)
def my_onboarding(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True,
                    'assignments': onboarding.list_assignments(
                        org_id, user_id=_read_target(user_id, org_id))})


@bp.route('/onboarding/<assignment_id>/items/<item_key>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_onboarding_item(user_id, assignment_id, item_key):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    is_admin = sis_service.caller_is_admin(user_id)
    result = onboarding.update_item(org_id, assignment_id, item_key,
                                    request.get_json() or {}, user_id, is_admin)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/onboarding/upload', methods=['POST'])
@require_role(*STAFF_ROLES)
def upload_onboarding_doc(user_id):
    """Upload an onboarding document to the PRIVATE staff-documents bucket.
    Returns a storage path; reads go through signed URLs (below)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'success': False, 'error': 'No file selected'}), 400
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in _DOC_EXTENSIONS:
        return jsonify({'success': False, 'error': 'Allowed types: pdf, doc, docx, png, jpg, webp'}), 400
    file.seek(0, 2)
    if file.tell() > _MAX_DOC_BYTES:
        return jsonify({'success': False, 'error': 'File size exceeds 10MB limit'}), 400
    file.seek(0)

    supabase = get_supabase_admin_client()
    try:
        supabase.storage.get_bucket(_STAFF_DOCS_BUCKET)
    except Exception:
        try:
            supabase.storage.create_bucket(_STAFF_DOCS_BUCKET, options={'public': False})
        except Exception:
            pass
    path = f"{org_id}/{user_id}/{_uuid.uuid4().hex}.{ext}"
    try:
        supabase.storage.from_(_STAFF_DOCS_BUCKET).upload(
            path=path, file=file.read(),
            file_options={'content-type': file.content_type or 'application/octet-stream'},
        )
    except Exception as e:
        logger.error(f'Onboarding doc upload failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to upload document'}), 500
    return jsonify({'success': True, 'path': path})


@bp.route('/onboarding/doc-url', methods=['GET'])
@require_role(*STAFF_ROLES)
def onboarding_doc_url(user_id):
    """Signed (1h) URL for a staff document. Teachers can only open their own
    files; admins can open any file in their org."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    path = request.args.get('path') or ''
    parts = path.split('/')
    if len(parts) < 3 or parts[0] != org_id:
        return jsonify({'success': False, 'error': 'Document not found'}), 404
    if not sis_service.caller_is_admin(user_id) and parts[1] != user_id:
        return jsonify({'success': False, 'error': 'Document not found'}), 404
    try:
        signed = get_supabase_admin_client().storage.from_(_STAFF_DOCS_BUCKET) \
            .create_signed_url(path, 3600)
        url = signed.get('signedURL') or signed.get('signedUrl')
    except Exception as e:
        logger.error(f'Signed URL failed for {path}: {e}')
        return jsonify({'success': False, 'error': 'Could not open the document'}), 500
    return jsonify({'success': True, 'url': url})


# ── Time clock ───────────────────────────────────────────────────────────────

@bp.route('/time/clock-in', methods=['POST'])
@require_role(*STAFF_ROLES)
def clock_in(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    result = staff.clock_in(org_id, user_id, job_label=data.get('job_label'),
                            class_id=data.get('class_id'))
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result}), 201


@bp.route('/time/clock-out', methods=['POST'])
@require_role(*STAFF_ROLES)
def clock_out(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    result = staff.clock_out(org_id, user_id, notes=data.get('notes'))
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/time/entries', methods=['GET'])
@require_role(*STAFF_ROLES)
def my_time_entries(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    start = request.args.get('start')
    end = request.args.get('end')
    if not start or not end:
        return jsonify({'success': False, 'error': 'start and end are required (YYYY-MM-DD)'}), 400
    return jsonify({'success': True,
                    **staff.my_time_entries(org_id, _read_target(user_id, org_id), start, end)})
