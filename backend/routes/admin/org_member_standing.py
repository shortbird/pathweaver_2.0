"""
Withdraw a student from the school, or take it back, from the org admin's
People tab on the web platform.

The SIS console has had "Withdraw from school" since August; a school that
does not run the console (Hearthwood, most LMS-only orgs) had only Remove,
which evicts the account and leaves its class seats and history dangling
(2026-09-14). This is the gentler act: the student stays on file as
withdrawn, their active seats are released, and the People tab hides them
behind "Show withdrawn". The write is sis_person_service.set_student_standing,
the same path the SIS roster's Archive takes.

Gated on the org_admin tier like the other account actions in this prefix
(org_member_status.py): staff run the campus, admins run accounts.
"""

from flask import request, jsonify, Blueprint

from database import get_supabase_admin_client
from services import sis_person_service
from utils.auth.decorators import require_org_admin
from utils.auth.relationships import require_relationship_to
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('org_member_standing', __name__)


@bp.route('/<org_id>/users/<target_user_id>/standing', methods=['POST'])
@require_org_admin
@require_relationship_to('target_user_id', allow=('org_staff',))
def set_member_standing(current_user_id, current_org_id, is_superadmin, org_id, target_user_id):
    """Body: {"status": "withdrawn" | "enrolled"}. Students only."""
    try:
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403
        status = (request.get_json(silent=True) or {}).get('status')
        if status not in ('withdrawn', 'enrolled'):
            return jsonify({'error': 'status must be withdrawn or enrolled'}), 400
        if target_user_id == current_user_id:
            return jsonify({'error': 'You cannot withdraw your own account'}), 400

        # admin client justified: admin-only route (@require_org_admin); the
        # org check below is the authorization, as in org_member_status.
        client = get_supabase_admin_client()
        target = client.table('users').select('role, organization_id') \
            .eq('id', target_user_id).maybe_single().execute()
        if not target or not target.data:
            return jsonify({'error': 'User not found'}), 404
        if target.data.get('role') == 'superadmin':
            return jsonify({'error': 'Cannot change a superadmin account'}), 403
        if target.data.get('organization_id') != org_id:
            return jsonify({'error': 'User is not a member of this organization'}), 404

        result = sis_person_service.set_student_standing(
            org_id, target_user_id, withdrawn=(status == 'withdrawn'))
        if result.get('error'):
            return jsonify({'error': result['error']}), 400
        logger.info(f"[People] {target_user_id[:8]} in org {org_id[:8]} set {status} by {current_user_id[:8]}")
        return jsonify({'success': True, **result}), 200
    except Exception as e:
        logger.error(f"Error setting member standing in org {org_id}: {e}")
        return jsonify({'error': 'Could not update the student'}), 500
