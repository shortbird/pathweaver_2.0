"""
The campus coordinator's dashboard route (iCreate requirements, 2026-08-09).

ADMIN_ROLES, not a coordinator-only gate: an org admin opening the same view
sees the same campus. What differs by role is the chrome the frontend renders
and the quick links the settings target.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_coordinator_service as coordinator
from utils.sis_roles import ADMIN_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_coordinator', __name__, url_prefix='/api/sis')


@bp.route('/coordinator/dashboard', methods=['GET'])
@require_role(*ADMIN_ROLES)
def coordinator_dashboard(user_id):
    requested = request.args.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400
    return jsonify({'success': True, **coordinator.get_dashboard(org_id, user_id)})
