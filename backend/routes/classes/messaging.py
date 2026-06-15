"""
Class group chat.

Creates (or syncs) a group conversation from a class roster: members are the class's
active students plus its advisors. Idempotent via group_conversations.source_class_id —
a second call syncs membership instead of creating a duplicate group.
"""

from flask import request, jsonify
from . import bp
from services.class_service import ClassService
from services.group_message_service import GroupMessageService
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

        cls = service.get_class(class_id)
        class_name = (cls.get('name') if cls else None) or 'Class'

        # Build roster member set (active students + advisors)
        member_ids = set()
        for s in (service.get_class_students(class_id, status='active') or []):
            if s.get('student_id'):
                member_ids.add(s['student_id'])
        for a in (service.get_class_advisors(class_id) or []):
            if a.get('advisor_id'):
                member_ids.add(a['advisor_id'])
        member_ids.discard(None)

        admin = get_supabase_admin_client()
        gms = GroupMessageService()

        # Existing linked group? -> sync membership (direct insert; caller may not be its admin).
        existing = admin.table('group_conversations')\
            .select('id')\
            .eq('source_class_id', class_id)\
            .eq('is_active', True)\
            .limit(1).execute()

        if existing.data:
            group_id = existing.data[0]['id']
            have_rows = admin.table('group_members').select('user_id').eq('group_id', group_id).execute()
            have = {m['user_id'] for m in (have_rows.data or [])}
            to_add = [mid for mid in (member_ids | {user_id}) if mid not in have]
            for mid in to_add:
                try:
                    admin.table('group_members').insert({
                        'group_id': group_id,
                        'user_id': mid,
                        'role': 'member',
                        'added_by': user_id,
                    }).execute()
                except Exception as me:
                    logger.warning(f"Failed to sync member {mid} into class group {group_id}: {me}")
            return jsonify({'success': True, 'group_id': group_id, 'synced': True, 'added': len(to_add)})

        # Create a new group from the roster.
        member_ids.discard(user_id)  # creator is added as admin by create_group
        group = gms.create_group(
            user_id=user_id,
            name=f"{class_name} Class Chat",
            description=f"Group chat for {class_name}",
            member_ids=list(member_ids),
        )
        group_id = group.get('id') if group else None
        if group_id:
            admin.table('group_conversations').update({'source_class_id': class_id}).eq('id', group_id).execute()

        return jsonify({'success': True, 'group_id': group_id, 'created': True})

    except Exception as e:
        logger.error(f"Error creating class group: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to create class group chat'}), 500
