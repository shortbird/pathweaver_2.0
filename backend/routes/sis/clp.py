"""
SIS CLP (Customized Learning Plan) routes — the admin meeting view.

NEW, additive (prefix /api/sis), staff-gated (org_admin/advisor/superadmin;
superadmin implicit). Org scoping via sis_service.resolve_org_id — non-superadmins
can only ever touch their own org.

Read-only aggregation for the CLP meeting screen: a searchable student directory
grouped by family, and a per-student payload (schedule + full catalog annotated
with this student's enrollment/waitlist state and live seat counts). Enroll / drop
/ waitlist changes reuse the existing catalog + waitlist endpoints.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_clp_service as clp

logger = get_logger(__name__)

bp = Blueprint('sis_clp', __name__, url_prefix='/api/sis')

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


@bp.route('/clp/directory', methods=['GET'])
@require_role(*STAFF_ROLES)
def clp_directory(user_id):
    """Active students grouped by family (+ a flat list) for the CLP student picker."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, **clp.clp_directory(org_id)})


@bp.route('/clp/students/<student_id>', methods=['GET'])
@require_role(*STAFF_ROLES)
def clp_student(user_id, student_id):
    """One student's CLP payload: profile, family/siblings, schedule, and the full
    catalog annotated with this student's enrollment/waitlist state + seat counts."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = clp.get_clp_student(org_id, student_id)
    if not data:
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    return jsonify({'success': True, **data})
