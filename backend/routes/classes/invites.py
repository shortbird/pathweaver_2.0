"""
Class invite links (blocks P2).

A teacher who just created a class needs a way to fill it without the front
office: a standing link that joins the org as a student AND enrolls in this
class. Reuses the org_invitations standing-link machinery — the row carries
metadata {invitation_type: 'class', class_id}; the shared accept path in
routes/admin/user_invitations.py does the enrollment. Role is locked to
student by construction: no role field is accepted here.
"""

import secrets
from datetime import datetime, timedelta

from flask import request, jsonify
from . import bp
from services.class_service import ClassService
from utils.auth.decorators import require_role
from utils.sis_roles import STAFF_ROLES
from database import get_supabase_admin_client
from utils.logger import get_logger
from .crud import get_user_info

logger = get_logger(__name__)


def _shareable(code: str) -> str:
    from app_config import Config
    return f"{Config.FRONTEND_URL}/invitation/{code}"


def _find_active_link(client, org_id: str, class_id: str):
    """The class's current standing link, if one exists."""
    result = client.table('org_invitations') \
        .select('id, invitation_code, expires_at, created_at, metadata') \
        .eq('organization_id', org_id) \
        .eq('status', 'pending') \
        .eq('role', 'student') \
        .contains('metadata', {'invitation_type': 'class', 'class_id': class_id}) \
        .order('created_at', desc=True) \
        .limit(1) \
        .execute()
    return result.data[0] if result.data else None


def _manage_check(user_id, org_id, class_id):
    """403/404 response when the caller may not manage this class, else None."""
    effective_role, user_org_id, _ = get_user_info(user_id)
    service = ClassService()
    if not service.can_manage_class(class_id, user_id, effective_role, user_org_id):
        return jsonify({'success': False, 'error': 'Access denied'}), 403
    cls = service.get_class(class_id)
    if not cls or cls.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    if cls.get('status') != 'active':
        return jsonify({'success': False, 'error': 'Class is archived'}), 400
    return None


@bp.route('/organizations/<org_id>/classes/<class_id>/invite-link', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_class_invite_link(user_id, org_id, class_id):
    """The class's current invite link, or link: null when none exists."""
    try:
        err = _manage_check(user_id, org_id, class_id)
        if err:
            return err
        # admin client justified: staff-only route; access decided by can_manage_class above
        client = get_supabase_admin_client()
        inv = _find_active_link(client, org_id, class_id)
        if not inv:
            return jsonify({'success': True, 'link': None})
        return jsonify({
            'success': True,
            'link': _shareable(inv['invitation_code']),
            'created_at': inv.get('created_at'),
        })
    except Exception as e:
        logger.error(f"Error reading class invite link for {class_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to read invite link'}), 500


@bp.route('/organizations/<org_id>/classes/<class_id>/invite-link', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_class_invite_link(user_id, org_id, class_id):
    """Create the class's invite link (or rotate it with {"rotate": true}).

    Idempotent: without rotate, an existing link is returned unchanged.
    Rotating cancels the old row, so a leaked link dies with the rotation.
    """
    try:
        err = _manage_check(user_id, org_id, class_id)
        if err:
            return err

        rotate = bool((request.get_json(silent=True) or {}).get('rotate'))
        # admin client justified: staff-only route; access decided by can_manage_class above
        client = get_supabase_admin_client()

        existing = _find_active_link(client, org_id, class_id)
        if existing and not rotate:
            return jsonify({'success': True, 'link': _shareable(existing['invitation_code']),
                            'created_at': existing.get('created_at')})
        if existing and rotate:
            client.table('org_invitations') \
                .update({'status': 'cancelled'}) \
                .eq('id', existing['id']) \
                .execute()

        code = secrets.token_urlsafe(32)
        # Standing links are effectively permanent (see generate_invitation_link);
        # not null because validate parses expires_at unconditionally.
        expires_at = datetime.utcnow() + timedelta(days=3650)
        row = {
            'organization_id': org_id,
            'email': f"link-invite-{code[:12]}@pending.optio.local",
            'invited_name': '',
            'role': 'student',
            'invitation_code': code,
            'invited_by': user_id,
            'status': 'pending',
            'expires_at': expires_at.isoformat(),
            'metadata': {'invitation_type': 'class', 'class_id': class_id},
        }
        result = client.table('org_invitations').insert(row).execute()
        if not result.data:
            return jsonify({'success': False, 'error': 'Failed to create invite link'}), 500

        logger.info(f"Class invite link {'rotated' if existing else 'created'} "
                    f"for class {class_id} in org {org_id} by {user_id}")
        return jsonify({'success': True, 'link': _shareable(code),
                        'created_at': result.data[0].get('created_at')}), 201
    except Exception as e:
        logger.error(f"Error creating class invite link for {class_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to create invite link'}), 500
