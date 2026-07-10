"""
SIS catalog routes — the unified Class (org_classes) management.

NEW, additive (prefix /api/sis), staff-gated (org_admin/advisor/superadmin;
superadmin implicit). Org scoping via sis_service.resolve_org_id — non-superadmins
can only ever touch their own org. Operates on the SIS operational fields of
org_classes WITHOUT changing the existing LMS class CRUD (routes/classes/*).
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_catalog_service as catalog
from repositories.sis_class_repository import SisClassRepository
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_catalog', __name__, url_prefix='/api/sis')

STAFF_ROLES = ('org_admin', 'advisor', 'superadmin')


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


def _truthy(v):
    return str(v).lower() in ('1', 'true', 'yes')


def _instructor_in_org(org_id, instructor_id):
    """True when the given user belongs to this org (for primary_instructor_id)."""
    row = (
        get_supabase_admin_client().table('users').select('id, organization_id')
        .eq('id', instructor_id).limit(1).execute()
    ).data
    return bool(row and row[0].get('organization_id') == org_id)


# ── Programs ─────────────────────────────────────────────────────────────────
# ── Classes (org_classes SIS view) ───────────────────────────────────────────
@bp.route('/classes', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_classes(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    include_archived = _truthy(request.args.get('include_archived'))
    return jsonify({'success': True, 'classes': catalog.list_classes(org_id, include_archived)})


def _validate_class_fields(data):
    """Return an error string for invalid enum/range fields, else None."""
    if data.get('billing_type') and data['billing_type'] not in catalog.BILLING_TYPES:
        return 'Invalid billing_type'
    if data.get('billing_cadence') and data['billing_cadence'] not in catalog.BILLING_CADENCES:
        return 'Invalid billing_cadence'
    if data.get('registration_status') and data['registration_status'] not in catalog.REGISTRATION_STATUSES:
        return 'Invalid registration_status'
    for k in ('capacity', 'price_cents', 'min_age', 'max_age'):
        v = data.get(k)
        if v is not None and (not isinstance(v, int) or v < 0):
            return f'{k} must be a non-negative integer'
    if data.get('min_age') is not None and data.get('max_age') is not None \
            and data['min_age'] > data['max_age']:
        return 'min_age cannot exceed max_age'
    # supply_fee is dollars (numeric), display-only; accept any non-negative number.
    sf = data.get('supply_fee')
    if sf is not None and (isinstance(sf, bool) or not isinstance(sf, (int, float)) or sf < 0):
        return 'supply_fee must be a non-negative number'
    return None


@bp.route('/classes', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_class(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'Class name is required'}), 400
    invalid = _validate_class_fields(data)
    if invalid:
        return jsonify({'success': False, 'error': invalid}), 400
    if data.get('primary_instructor_id') and not _instructor_in_org(org_id, data['primary_instructor_id']):
        return jsonify({'success': False, 'error': 'Teacher not found in this organization'}), 400
    repo = SisClassRepository(client=get_supabase_admin_client())
    fields = {**data, 'name': name}
    cls = repo.create_for_org(org_id, created_by=user_id, fields=fields)
    return jsonify({'success': True, 'class': cls}), 201


@bp.route('/classes/<class_id>', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_class(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    detail = catalog.get_class_detail(org_id, class_id)
    if not detail:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    return jsonify({'success': True, 'class': detail})


@bp.route('/classes/<class_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_class(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    invalid = _validate_class_fields(data)
    if invalid:
        return jsonify({'success': False, 'error': invalid}), 400
    if data.get('primary_instructor_id') and not _instructor_in_org(org_id, data['primary_instructor_id']):
        return jsonify({'success': False, 'error': 'Teacher not found in this organization'}), 400
    repo = SisClassRepository(client=get_supabase_admin_client())
    existing = repo.find_by_id(class_id)
    if not existing or existing.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    return jsonify({'success': True, 'class': repo.update_sis_fields(class_id, data)})


@bp.route('/classes/<class_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def archive_class(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    repo = SisClassRepository(client=get_supabase_admin_client())
    existing = repo.find_by_id(class_id)
    if not existing or existing.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    return jsonify({'success': True, 'class': repo.archive(class_id)})


# ── Class meetings (schedule) ────────────────────────────────────────────────
def _load_class(repo, org_id, class_id):
    existing = repo.find_by_id(class_id)
    if not existing or existing.get('organization_id') != org_id:
        return None
    return existing


@bp.route('/classes/<class_id>/meetings', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_meetings(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    repo = SisClassRepository(client=get_supabase_admin_client())
    if not _load_class(repo, org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    return jsonify({'success': True, 'meetings': repo.list_meetings(class_id)})


@bp.route('/classes/<class_id>/meetings', methods=['POST'])
@require_role(*STAFF_ROLES)
def add_meeting(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    if not data.get('start_time') or not data.get('end_time'):
        return jsonify({'success': False, 'error': 'start_time and end_time are required'}), 400
    if data.get('day_of_week') is None and not data.get('specific_date'):
        return jsonify({'success': False, 'error': 'Provide day_of_week (recurring) or specific_date'}), 400
    if data.get('day_of_week') is not None and not (0 <= int(data['day_of_week']) <= 6):
        return jsonify({'success': False, 'error': 'day_of_week must be 0-6'}), 400
    if data['end_time'] <= data['start_time']:
        return jsonify({'success': False, 'error': 'end_time must be after start_time'}), 400
    repo = SisClassRepository(client=get_supabase_admin_client())
    if not _load_class(repo, org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    meeting = repo.add_meeting(class_id, org_id, data)
    return jsonify({'success': True, 'meeting': meeting}), 201


@bp.route('/classes/<class_id>/meetings/<meeting_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def delete_meeting(user_id, class_id, meeting_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    repo = SisClassRepository(client=get_supabase_admin_client())
    if not _load_class(repo, org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    repo.delete_meeting(meeting_id)
    return jsonify({'success': True})


# ── Class prerequisites ──────────────────────────────────────────────────────
@bp.route('/classes/<class_id>/prerequisites', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_prerequisites(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    repo = SisClassRepository(client=get_supabase_admin_client())
    if not _load_class(repo, org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    return jsonify({'success': True, 'prerequisites': repo.list_prerequisites(class_id)})


@bp.route('/classes/<class_id>/prerequisites', methods=['POST'])
@require_role(*STAFF_ROLES)
def add_prerequisite(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    if not data.get('prerequisite_class_id') and not (data.get('note') or '').strip():
        return jsonify({'success': False, 'error': 'Provide prerequisite_class_id or a note'}), 400
    repo = SisClassRepository(client=get_supabase_admin_client())
    if not _load_class(repo, org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    prereq = repo.add_prerequisite(class_id, data)
    return jsonify({'success': True, 'prerequisite': prereq}), 201


@bp.route('/classes/<class_id>/prerequisites/<prerequisite_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def delete_prerequisite(user_id, class_id, prerequisite_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    repo = SisClassRepository(client=get_supabase_admin_client())
    if not _load_class(repo, org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    repo.delete_prerequisite(prerequisite_id)
    return jsonify({'success': True})


@bp.route('/classes/<class_id>/enrollments', methods=['GET'])
@require_role(*STAFF_ROLES)
def class_roster(user_id, class_id):
    """The class's enrolled students (active), for the class Roster tab."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    supabase = get_supabase_admin_client()
    repo = SisClassRepository(client=supabase)
    if not _load_class(repo, org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    enrollments = (
        supabase.table('class_enrollments').select('student_id, created_at')
        .eq('class_id', class_id).eq('status', 'active').execute()
    ).data or []
    ids = [e['student_id'] for e in enrollments]
    users = {}
    if ids:
        rows = (supabase.table('users')
                .select('id, first_name, last_name, display_name, email, username')
                .in_('id', ids).execute()).data or []
        users = {u['id']: u for u in rows}
    roster = []
    for e in enrollments:
        u = users.get(e['student_id']) or {}
        name = (u.get('display_name')
                or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
                or u.get('username') or u.get('email') or 'Unknown')
        roster.append({'student_id': e['student_id'], 'name': name,
                       'last_name': u.get('last_name'),
                       'email': u.get('email'), 'username': u.get('username'),
                       'enrolled_at': e.get('created_at')})
    roster.sort(key=lambda r: (r.get('last_name') or r['name']).lower())
    return jsonify({'success': True, 'roster': roster})


# ── Direct enrollment (staff enroll a student into a class) ───────────────────
@bp.route('/classes/<class_id>/enrollments', methods=['POST'])
@require_role(*STAFF_ROLES)
def enroll_student(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    supabase = get_supabase_admin_client()
    repo = SisClassRepository(client=supabase)
    if not _load_class(repo, org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404

    data = request.json or {}
    student_id = data.get('student_user_id')
    if not student_id:
        return jsonify({'success': False, 'error': 'student_user_id is required'}), 400
    # Student must belong to this org.
    stu = supabase.table('users').select('id, organization_id').eq('id', student_id).limit(1).execute().data
    if not stu or stu[0].get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Student not in this organization'}), 404

    existing = (
        supabase.table('class_enrollments').select('id, status')
        .eq('class_id', class_id).eq('student_id', student_id).limit(1).execute()
    ).data
    from services.class_group_sync_service import sync_class_group
    if existing:
        if existing[0].get('status') != 'active':
            supabase.table('class_enrollments').update({'status': 'active'}).eq('id', existing[0]['id']).execute()
            sync_class_group(class_id, actor_id=user_id)
        return jsonify({'success': True, 'already_enrolled': True})

    supabase.table('class_enrollments').insert({
        'class_id': class_id, 'student_id': student_id,
        'enrolled_by': user_id, 'status': 'active',
    }).execute()
    sync_class_group(class_id, actor_id=user_id)
    return jsonify({'success': True}), 201


# ── Optio-course settings ────────────────────────────────────────────────────
# Per-org details for the Optio courses an org offers (the "iCreate versions" of
# at-home-learning courses). Teacher is per-course (org_course_settings); tuition
# is ONE org-wide price for all Optio courses (sis_settings, edited in Settings).
@bp.route('/course-settings', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_course_settings(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, **catalog.list_course_settings(org_id)})


@bp.route('/courses/<course_id>/settings', methods=['PUT'])
@require_role(*STAFF_ROLES)
def update_course_settings(user_id, course_id):
    """Set this org's teacher for an Optio course (teacher_id: null clears it)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    fields = {k: data[k] for k in ('teacher_id',) if k in data}
    result = catalog.update_course_settings(org_id, course_id, fields, assigned_by=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


# ── Class image upload ───────────────────────────────────────────────────────
import uuid as _uuid

_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'}
_MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5MB
_CLASS_IMAGE_BUCKET = 'class-images'


def _ensure_bucket(supabase, bucket_name):
    """Ensure a public storage bucket exists (create if missing). Best-effort."""
    try:
        if supabase.storage.get_bucket(bucket_name):
            return
    except Exception:
        pass  # not found → create below
    try:
        supabase.storage.create_bucket(bucket_name, options={'public': True})
    except Exception as e:
        if not any(s in str(e).lower() for s in ('already exists', 'duplicate')):
            logger.warning(f"class-images bucket create note: {e}")


@bp.route('/classes/<class_id>/image', methods=['POST'])
@require_role(*STAFF_ROLES)
def upload_class_image(user_id, class_id):
    """Upload (or replace) a class's catalog image. Stores image_url on org_classes."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err

    supabase = get_supabase_admin_client()
    repo = SisClassRepository(client=supabase)
    existing = _load_class(repo, org_id, class_id)
    if not existing:
        return jsonify({'success': False, 'error': 'Class not found'}), 404

    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'success': False, 'error': 'No file selected'}), 400

    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in _IMAGE_EXTENSIONS:
        return jsonify({'success': False, 'error': 'Invalid file type. Allowed: JPG, PNG, GIF, WebP, HEIC'}), 400

    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > _MAX_IMAGE_BYTES:
        return jsonify({'success': False, 'error': 'File size exceeds 5MB limit'}), 400

    _ensure_bucket(supabase, _CLASS_IMAGE_BUCKET)

    unique_path = f"{class_id}/{_uuid.uuid4().hex}.{ext}"
    content = file.read()

    # Clean up a previous class-images upload if present.
    old = existing.get('image_url')
    if old and f'{_CLASS_IMAGE_BUCKET}/' in old:
        try:
            supabase.storage.from_(_CLASS_IMAGE_BUCKET).remove([old.split(f'{_CLASS_IMAGE_BUCKET}/')[-1]])
        except Exception:
            logger.debug("class-images old file delete failed (non-fatal)", exc_info=True)

    try:
        supabase.storage.from_(_CLASS_IMAGE_BUCKET).upload(
            path=unique_path,
            file=content,
            file_options={'content-type': file.content_type or f'image/{ext}'},
        )
        image_url = supabase.storage.from_(_CLASS_IMAGE_BUCKET).get_public_url(unique_path)
    except Exception as e:
        logger.error(f"Error uploading class image: {e}")
        return jsonify({'success': False, 'error': 'Failed to upload image'}), 500

    updated = repo.update_sis_fields(class_id, {'image_url': image_url})
    return jsonify({'success': True, 'image_url': image_url, 'class': updated})


# ── Registration paperwork document upload ───────────────────────────────────
# Waiver/acknowledgment documents for the iCreate registration funnel. Admins
# upload the file here and the returned public URL is stored as the paperwork
# item's doc_url in feature_flags.icreate_registration.

_DOC_EXTENSIONS = {'pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp'}
_MAX_DOC_BYTES = 10 * 1024 * 1024  # 10MB
_ORG_DOCS_BUCKET = 'org-documents'


@bp.route('/registration/paperwork-doc', methods=['POST'])
@require_role(*STAFF_ROLES)
def upload_paperwork_doc(user_id):
    """Upload a paperwork document; returns its public URL for doc_url."""
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
        return jsonify({'success': False, 'error': 'Invalid file type. Allowed: PDF, DOC, DOCX, PNG, JPG, WebP'}), 400

    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > _MAX_DOC_BYTES:
        return jsonify({'success': False, 'error': 'File size exceeds 10MB limit'}), 400

    supabase = get_supabase_admin_client()
    _ensure_bucket(supabase, _ORG_DOCS_BUCKET)

    unique_path = f"{org_id}/paperwork/{_uuid.uuid4().hex}.{ext}"
    try:
        supabase.storage.from_(_ORG_DOCS_BUCKET).upload(
            path=unique_path,
            file=file.read(),
            file_options={'content-type': file.content_type or 'application/octet-stream'},
        )
        url = supabase.storage.from_(_ORG_DOCS_BUCKET).get_public_url(unique_path)
    except Exception as e:
        logger.error(f"Error uploading paperwork document: {e}")
        return jsonify({'success': False, 'error': 'Failed to upload document'}), 500

    return jsonify({'success': True, 'url': url})
