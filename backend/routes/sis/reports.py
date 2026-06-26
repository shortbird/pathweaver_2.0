"""
SIS reporting routes — enrollment / revenue / attendance summaries.

NEW, additive (/api/sis/reports), staff-gated, org-scoped. (The roster CSV export
lives in routes/sis/__init__.py.)
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_reports_service as reports

logger = get_logger(__name__)

bp = Blueprint('sis_reports', __name__, url_prefix='/api/sis')

STAFF_ROLES = ('org_admin', 'advisor', 'superadmin')


def _org_or_error(user_id):
    requested = request.args.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


@bp.route('/reports/enrollment', methods=['GET'])
@require_role(*STAFF_ROLES)
def enrollment(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'report': reports.enrollment_report(org_id)})


@bp.route('/reports/revenue', methods=['GET'])
@require_role(*STAFF_ROLES)
def revenue(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'report': reports.revenue_report(org_id)})


@bp.route('/reports/attendance', methods=['GET'])
@require_role(*STAFF_ROLES)
def attendance(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'report': reports.attendance_report(org_id)})
