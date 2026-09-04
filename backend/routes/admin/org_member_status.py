"""
Org-scoped account deactivation (blocks P2).

The platform-wide switch (routes/admin/user_management.py toggle_user_status)
is superadmin-only; an org admin had no way to disable a login in their own
school short of evicting the account from the org. This is the scoped version:
own org only, and never another admin — an org_admin who could disable a peer
could lock the school's other keyholder out.

Deliberately gated on the org_admin tier, not ADMIN_ROLES: disabling a login
is an account action, and account actions stay with the org admin
(ARCHITECTURE_BLOCKS decision 3 — staff run the campus, admins run accounts).
"""

from flask import request, jsonify, Blueprint
from datetime import datetime

from database import get_supabase_admin_client
from utils.auth.decorators import require_org_admin
from utils.auth.relationships import require_relationship_to
from services.admin_audit_service import AdminAuditService
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('org_member_status', __name__)

VALID_STATUSES = ('active', 'disabled')


@bp.route('/<org_id>/users/<target_user_id>/status', methods=['POST'])
@require_org_admin
@require_relationship_to('target_user_id', allow=('org_staff',))
def set_member_status(current_user_id, current_org_id, is_superadmin, org_id, target_user_id):
    """Enable or disable a member's account, scoped to the caller's org.

    Body: {"status": "disabled" | "active"}

    Refused for: targets outside the org named in the URL, superadmins,
    other org admins, and the caller's own account.
    """
    try:
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json() or {}
        new_status = data.get('status')
        if new_status not in VALID_STATUSES:
            return jsonify({'error': f'status must be one of: {", ".join(VALID_STATUSES)}'}), 400

        if target_user_id == current_user_id:
            return jsonify({'error': 'You cannot disable your own account'}), 400

        # admin client justified: admin-only route (@require_org_admin) — needs RLS bypass for member administration
        client = get_supabase_admin_client()

        # Resolve the target and enforce org membership BEFORE mutating
        # (same IDOR discipline as remove_user_from_organization).
        target = client.table('users') \
            .select('role, org_role, org_roles, is_org_admin, organization_id, status, display_name') \
            .eq('id', target_user_id) \
            .maybe_single() \
            .execute()
        if not target or not target.data:
            return jsonify({'error': 'User not found'}), 404

        row = target.data
        if row.get('role') == 'superadmin':
            return jsonify({'error': 'Cannot change a superadmin account'}), 403
        if row.get('organization_id') != org_id:
            return jsonify({'error': 'User is not a member of this organization'}), 404
        is_admin_target = row.get('is_org_admin') or row.get('org_role') == 'org_admin' \
            or 'org_admin' in (row.get('org_roles') or [])
        if is_admin_target and not is_superadmin:
            return jsonify({'error': 'Organization admin accounts can only be changed by Optio support'}), 403

        old_status = row.get('status', 'active')
        if old_status == new_status:
            return jsonify({'success': True, 'status': new_status,
                            'message': 'No change — account already in that state'}), 200

        client.table('users') \
            .update({'status': new_status, 'updated_at': datetime.utcnow().isoformat()}) \
            .eq('id', target_user_id) \
            .eq('organization_id', org_id) \
            .execute()

        AdminAuditService().log_action(
            admin_id=current_user_id,
            action_type='set_member_status',
            resource_type='user',
            resource_id=target_user_id,
            organization_id=org_id,
            metadata={'old_status': old_status, 'new_status': new_status},
        )
        logger.info(
            f"Member status: {target_user_id} {old_status} -> {new_status} "
            f"in org {org_id} by {current_user_id}"
        )

        verb = 'disabled' if new_status == 'disabled' else 're-enabled'
        return jsonify({'success': True, 'status': new_status,
                        'message': f'Account {verb} successfully'}), 200

    except Exception as e:
        logger.error(f"Error setting member status for {target_user_id} in org {org_id}: {e}")
        return jsonify({'error': 'Failed to update account status'}), 500
