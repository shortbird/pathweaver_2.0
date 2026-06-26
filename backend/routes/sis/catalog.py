"""
SIS catalog routes — Programs and the unified Class (org_classes) management.

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
from repositories.program_repository import ProgramRepository
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


# ── Programs ─────────────────────────────────────────────────────────────────
@bp.route('/programs', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_programs(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    include_archived = _truthy(request.args.get('include_archived'))
    return jsonify({'success': True, 'programs': catalog.list_programs(org_id, include_archived)})


@bp.route('/programs', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_program(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'Program name is required'}), 400
    program_type = data.get('program_type') or 'individual_class'
    if program_type not in catalog.PROGRAM_TYPES:
        return jsonify({'success': False, 'error': f'Invalid program_type: {program_type}'}), 400
    status = data.get('status') or 'draft'
    if status not in catalog.PROGRAM_STATUSES:
        return jsonify({'success': False, 'error': f'Invalid status: {status}'}), 400
    fields = {'name': name, 'program_type': program_type, 'status': status, 'created_by': user_id}
    for k in ('slug', 'description', 'enrollment_opens_at', 'enrollment_closes_at'):
        if data.get(k) is not None:
            fields[k] = data[k]
    repo = ProgramRepository(client=get_supabase_admin_client())
    program = repo.create_for_org(org_id, fields)
    return jsonify({'success': True, 'program': program}), 201


@bp.route('/programs/<program_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_program(user_id, program_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    repo = ProgramRepository(client=get_supabase_admin_client())
    existing = repo.find_by_id(program_id)
    if not existing or existing.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Program not found'}), 404
    if data.get('program_type') and data['program_type'] not in catalog.PROGRAM_TYPES:
        return jsonify({'success': False, 'error': 'Invalid program_type'}), 400
    if data.get('status') and data['status'] not in catalog.PROGRAM_STATUSES:
        return jsonify({'success': False, 'error': 'Invalid status'}), 400
    fields = {k: data[k] for k in (
        'name', 'slug', 'description', 'program_type', 'status',
        'enrollment_opens_at', 'enrollment_closes_at'
    ) if k in data}
    return jsonify({'success': True, 'program': repo.update_fields(program_id, fields)})


@bp.route('/programs/<program_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def archive_program(user_id, program_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    repo = ProgramRepository(client=get_supabase_admin_client())
    existing = repo.find_by_id(program_id)
    if not existing or existing.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Program not found'}), 404
    return jsonify({'success': True, 'program': repo.archive(program_id)})


# ── Classes (org_classes SIS view) ───────────────────────────────────────────
@bp.route('/classes', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_classes(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    program_id = request.args.get('program_id')
    include_archived = _truthy(request.args.get('include_archived'))
    return jsonify({'success': True, 'classes': catalog.list_classes(org_id, program_id, include_archived)})


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
    repo = SisClassRepository(client=get_supabase_admin_client())
    # if a program_id is given, confirm it belongs to this org
    if data.get('program_id'):
        prog = ProgramRepository(client=get_supabase_admin_client()).find_by_id(data['program_id'])
        if not prog or prog.get('organization_id') != org_id:
            return jsonify({'success': False, 'error': 'Program not found'}), 404
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
