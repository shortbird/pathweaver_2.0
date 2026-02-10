"""
Class Quest Management Routes

Endpoints for managing quests assigned to classes.
"""

from flask import request, jsonify
from . import bp
from services.class_service import ClassService
from utils.auth.decorators import require_role
from utils.roles import get_effective_role
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


def get_user_info(user_id: str):
    """Get user role and organization info"""
    supabase = get_supabase_admin_client()
    user = supabase.table('users').select('role, org_role, organization_id').eq('id', user_id).execute()
    if not user.data:
        return None, None
    user_data = user.data[0]
    effective_role = get_effective_role(user_data)
    return effective_role, user_data.get('organization_id')


@bp.route('/organizations/<org_id>/classes/<class_id>/quests', methods=['GET'])
@require_role('org_admin', 'advisor', 'superadmin')
def get_class_quests(user_id, org_id, class_id):
    """
    Get all quests assigned to a class.

    Returns:
    {
        "success": true,
        "quests": [
            {
                "id": "...",
                "class_id": "...",
                "quest_id": "...",
                "quests": {
                    "id": "...",
                    "title": "...",
                    "description": "...",
                    "quest_type": "optio",
                    "is_active": true
                },
                "sequence_order": 0,
                "added_at": "..."
            }
        ]
    }
    """
    try:
        effective_role, user_org_id = get_user_info(user_id)

        service = ClassService()

        # Check access
        if not service.can_access_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        quests = service.get_class_quests(class_id)

        return jsonify({
            'success': True,
            'quests': quests
        })

    except Exception as e:
        logger.error(f"Error getting class quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get quests'
        }), 500


@bp.route('/organizations/<org_id>/classes/<class_id>/quests', methods=['POST'])
@require_role('org_admin', 'advisor', 'superadmin')
def add_class_quest(user_id, org_id, class_id):
    """
    Add a quest to a class.

    Request body:
    {
        "quest_id": "quest-uuid",
        "sequence_order": 0  // Optional
    }

    Returns:
    {
        "success": true,
        "assignment": {...}
    }
    """
    try:
        effective_role, user_org_id = get_user_info(user_id)

        service = ClassService()

        # Check management access
        if not service.can_manage_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        data = request.json or {}
        quest_id = data.get('quest_id')
        sequence_order = data.get('sequence_order')

        if not quest_id:
            return jsonify({'success': False, 'error': 'quest_id is required'}), 400

        # Verify quest exists and is accessible
        supabase = get_supabase_admin_client()
        cls = service.get_class(class_id)
        class_org_id = cls.get('organization_id')

        quest = supabase.table('quests')\
            .select('id, organization_id, is_active')\
            .eq('id', quest_id)\
            .execute()

        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        quest_data = quest.data[0]

        # Quest must be accessible to the organization:
        # - Either it's the org's own quest (organization_id matches)
        # - Or it's a global Optio quest (organization_id is NULL)
        # - Or it's accessible via organization_quest_access (for curated policy)
        quest_org_id = quest_data.get('organization_id')
        if quest_org_id is not None and quest_org_id != class_org_id:
            # Check if org has access to this quest
            access_check = supabase.table('organization_quest_access')\
                .select('id')\
                .eq('organization_id', class_org_id)\
                .eq('quest_id', quest_id)\
                .execute()

            if not access_check.data:
                return jsonify({
                    'success': False,
                    'error': 'Quest is not accessible to this organization'
                }), 403

        result = service.add_quest(class_id, quest_id, user_id, sequence_order)

        return jsonify({
            'success': True,
            'assignment': result
        }), 201

    except Exception as e:
        logger.error(f"Error adding class quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to add quest'
        }), 500


@bp.route('/organizations/<org_id>/classes/<class_id>/quests/<quest_id>', methods=['DELETE'])
@require_role('org_admin', 'advisor', 'superadmin')
def remove_class_quest(user_id, org_id, class_id, quest_id):
    """
    Remove a quest from a class.

    Note: This does not affect XP already earned by students for this quest.

    Returns:
    {
        "success": true,
        "message": "Quest removed successfully"
    }
    """
    try:
        effective_role, user_org_id = get_user_info(user_id)

        service = ClassService()

        # Check management access
        if not service.can_manage_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        success = service.remove_quest(class_id, quest_id, user_id)

        if success:
            return jsonify({
                'success': True,
                'message': 'Quest removed successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Quest not found in class'
            }), 404

    except Exception as e:
        logger.error(f"Error removing class quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to remove quest'
        }), 500


@bp.route('/organizations/<org_id>/classes/<class_id>/quests/reorder', methods=['PUT'])
@require_role('org_admin', 'advisor', 'superadmin')
def reorder_class_quests(user_id, org_id, class_id):
    """
    Reorder quests in a class.

    Request body:
    {
        "quest_ids": ["quest-uuid-1", "quest-uuid-2", "quest-uuid-3"]
    }

    Returns:
    {
        "success": true,
        "message": "Quests reordered successfully"
    }
    """
    try:
        effective_role, user_org_id = get_user_info(user_id)

        service = ClassService()

        # Check management access
        if not service.can_manage_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        data = request.json or {}
        quest_ids = data.get('quest_ids', [])

        if not quest_ids:
            return jsonify({'success': False, 'error': 'quest_ids is required'}), 400

        service.reorder_quests(class_id, quest_ids, user_id)

        return jsonify({
            'success': True,
            'message': 'Quests reordered successfully'
        })

    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error reordering class quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to reorder quests'
        }), 500


@bp.route('/organizations/<org_id>/available-quests', methods=['GET'])
@require_role('org_admin', 'advisor', 'superadmin')
def get_available_quests(user_id, org_id):
    """
    Get all quests available for adding to classes in an organization.

    This includes:
    - Organization's own quests
    - Global Optio quests (if visibility policy allows)
    - Curated quests (if visibility policy is 'curated')

    Query Parameters:
    - search: Search term for quest title
    - limit: Max results (default 50)

    Returns:
    {
        "success": true,
        "quests": [...]
    }
    """
    try:
        effective_role, user_org_id = get_user_info(user_id)

        # Authorization
        if effective_role != 'superadmin' and user_org_id != org_id:
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        search = request.args.get('search', '').strip()
        limit = min(int(request.args.get('limit', 50)), 100)

        supabase = get_supabase_admin_client()

        # Get organization visibility policy
        org = supabase.table('organizations')\
            .select('quest_visibility_policy')\
            .eq('id', org_id)\
            .execute()

        policy = 'all_optio'
        if org.data:
            policy = org.data[0].get('quest_visibility_policy', 'all_optio')

        quests = []

        # Always include organization's own quests
        org_quests_query = supabase.table('quests')\
            .select('id, title, description, quest_type, is_active, organization_id')\
            .eq('organization_id', org_id)\
            .eq('is_active', True)\
            .limit(limit)

        if search:
            org_quests_query = org_quests_query.ilike('title', f'%{search}%')

        org_quests = org_quests_query.execute()
        if org_quests.data:
            for q in org_quests.data:
                q['source'] = 'organization'
            quests.extend(org_quests.data)

        # Add global/curated quests based on policy
        if policy == 'all_optio':
            # Include all global Optio quests
            global_quests_query = supabase.table('quests')\
                .select('id, title, description, quest_type, is_active, organization_id')\
                .is_('organization_id', 'null')\
                .eq('is_active', True)\
                .eq('is_public', True)\
                .limit(limit - len(quests))

            if search:
                global_quests_query = global_quests_query.ilike('title', f'%{search}%')

            global_quests = global_quests_query.execute()
            if global_quests.data:
                for q in global_quests.data:
                    q['source'] = 'optio'
                quests.extend(global_quests.data)

        elif policy == 'curated':
            # Only include explicitly granted quests
            curated_query = supabase.table('organization_quest_access')\
                .select('quests(id, title, description, quest_type, is_active, organization_id)')\
                .eq('organization_id', org_id)\
                .limit(limit - len(quests))

            curated = curated_query.execute()
            if curated.data:
                for item in curated.data:
                    if item.get('quests'):
                        quest = item['quests']
                        if quest.get('is_active'):
                            if not search or search.lower() in quest.get('title', '').lower():
                                quest['source'] = 'curated'
                                quests.append(quest)

        # policy == 'private_only' means no external quests

        return jsonify({
            'success': True,
            'quests': quests,
            'policy': policy
        })

    except Exception as e:
        logger.error(f"Error getting available quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get available quests'
        }), 500
