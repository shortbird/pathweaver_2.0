"""
Class group chat.

Creates (or syncs) a group conversation from a class roster: members are the class's
active students plus its advisors. Idempotent via group_conversations.source_class_id —
a second call syncs membership instead of creating a duplicate group.
"""

from flask import request, jsonify
from . import bp
from services.class_service import ClassService
from utils.auth.decorators import require_role
from utils.roles import get_effective_role
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


def _user_info(user_id):
    admin = get_supabase_admin_client()
    u = admin.table('users').select('role, org_role, organization_id').eq('id', user_id).execute()
    if not u.data:
        return None, None
    return get_effective_role(u.data[0]), u.data[0].get('organization_id')


@bp.route('/organizations/<org_id>/classes/<class_id>/messaging-group', methods=['POST'])
@require_role('org_admin', 'advisor', 'superadmin')
def create_class_group(user_id, org_id, class_id):
    """Create or sync a group chat for a class (students + advisors)."""
    try:
        effective_role, user_org_id = _user_info(user_id)

        service = ClassService()
        if not service.can_manage_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        # Shared roster-mirroring sync (teachers as group admins). The same
        # function runs automatically on every enrollment change; this endpoint
        # remains for staff to create/sync a class group on demand.
        from services.class_group_sync_service import sync_class_group
        group_id = sync_class_group(class_id, actor_id=user_id)
        if not group_id:
            return jsonify({'success': False,
                            'error': 'No one to add yet — enroll a student or assign a teacher first'}), 400

        # Ensure the requesting staff member is in the group (as admin) so they
        # land in a conversation they can manage.
        admin = get_supabase_admin_client()
        me = admin.table('group_members').select('id, role').eq('group_id', group_id)\
            .eq('user_id', user_id).limit(1).execute()
        if not me.data:
            admin.table('group_members').insert({
                'group_id': group_id, 'user_id': user_id, 'role': 'admin', 'added_by': user_id,
            }).execute()
        elif me.data[0].get('role') != 'admin':
            admin.table('group_members').update({'role': 'admin'}).eq('id', me.data[0]['id']).execute()

        return jsonify({'success': True, 'group_id': group_id, 'synced': True})

    except Exception as e:
        logger.error(f"Error creating class group: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to create class group chat'}), 500
