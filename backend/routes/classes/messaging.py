"""
Class group chat.

Creates (or syncs) the class's group conversations from its roster: a parent
chat (guardians of active students + teachers) and a student chat (active
students + teachers). Idempotent via group_conversations (source_class_id,
audience) — a second call syncs membership instead of creating duplicates.
This endpoint returns the parent chat's id.
"""

from flask import request, jsonify
from . import bp
from services.class_service import ClassService
from utils.auth.decorators import require_role
from ._caller import get_caller
from utils.logger import get_logger

logger = get_logger(__name__)


@bp.route('/organizations/<org_id>/classes/<class_id>/messaging-group', methods=['POST'])
@require_role('org_admin', 'advisor', 'superadmin')
def create_class_group(user_id, org_id, class_id):
    """Create or sync a group chat for a class (families + teachers)."""
    try:
        effective_roles, user_org_id, _ = get_caller(user_id)

        service = ClassService()
        if not service.can_manage_class(class_id, user_id, effective_roles, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        # Shared roster-mirroring sync (teachers as group admins). The same
        # function runs automatically on every enrollment change; this endpoint
        # remains for staff to create/sync a class group on demand.
        from services.class_group_sync_service import sync_class_group
        group_id = sync_class_group(class_id, actor_id=user_id)
        if not group_id:
            return jsonify({'success': False,
                            'error': 'No one to add yet — the chat holds the teachers and the families of enrolled students'}), 400

        # Ensure the requesting staff member is in the group (as admin) so they
        # land in a conversation they can manage.
        # admin client justified: @require_role staff + can_manage_class gate above; writes group_members membership/role for the class group
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
