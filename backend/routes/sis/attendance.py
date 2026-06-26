"""
SIS attendance routes — teacher quick-entry + parent/admin read (spec §4.8, §6.2).

NEW, additive (/api/sis), staff-gated, org-scoped.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_attendance_service as attendance
from repositories.sis_class_repository import SisClassRepository
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_attendance', __name__, url_prefix='/api/sis')

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


def _class_in_org(org_id, class_id):
    cls = SisClassRepository(client=get_supabase_admin_client()).find_by_id(class_id)
    return bool(cls and cls.get('organization_id') == org_id)


@bp.route('/classes/<class_id>/attendance', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_attendance(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    on_date = request.args.get('date')
    if not on_date:
        return jsonify({'success': False, 'error': 'date query param is required (YYYY-MM-DD)'}), 400
    if not _class_in_org(org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    return jsonify({'success': True, 'roster': attendance.get_for_date(org_id, class_id, on_date)})


@bp.route('/classes/<class_id>/attendance', methods=['POST'])
@require_role(*STAFF_ROLES)
def record_attendance(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    on_date = data.get('date')
    entries = data.get('entries')
    if not on_date:
        return jsonify({'success': False, 'error': 'date is required'}), 400
    if not isinstance(entries, list) or not entries:
        return jsonify({'success': False, 'error': 'entries (list) is required'}), 400
    if not _class_in_org(org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    result = attendance.record(org_id, class_id, on_date, entries, recorded_by=user_id)
    return jsonify({'success': True, **result})


@bp.route('/students/<student_id>/attendance', methods=['GET'])
@require_role(*STAFF_ROLES)
def student_attendance(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, **attendance.student_history(org_id, student_id)})
