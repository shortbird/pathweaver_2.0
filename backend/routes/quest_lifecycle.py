"""
Quest Lifecycle Routes
Handles pick up/set down workflow and reflection system.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from database import get_user_client, get_supabase_admin_client
from services.badge_service import BadgeService
from datetime import datetime
from utils.logger import get_logger

logger = get_logger(__name__)

quest_lifecycle_bp = Blueprint('quest_lifecycle', __name__)


@quest_lifecycle_bp.route('/quests/<quest_id>/pickup', methods=['POST'])
@require_auth
def pickup_quest(user_id, quest_id):
    """
    Pick up a quest (start engaging with it).
    If quest was previously set down, increment times_picked_up.
    """
    try:
        supabase = get_user_client()

        # Check if quest exists
        quest_check = supabase.table('quests').select('id, title').eq('id', quest_id).single().execute()
        if not quest_check.data:
            return jsonify({'error': 'Quest not found'}), 404

        # Check if user already has this quest
        existing = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if existing.data:
            # Quest exists - update status to picked_up
            user_quest = existing.data[0]

            # Increment times_picked_up if it was previously set down
            times_picked_up = user_quest.get('times_picked_up', 0) + 1 if user_quest.get('status') == 'set_down' else user_quest.get('times_picked_up', 1)

            updated = supabase.table('user_quests')\
                .update({
                    'status': 'picked_up',
                    'is_active': True,  # For backward compatibility
                    'last_picked_up_at': datetime.utcnow().isoformat(),
                    'times_picked_up': times_picked_up
                })\
                .eq('id', user_quest['id'])\
                .execute()

            return jsonify({
                'message': 'Quest picked up again',
                'user_quest': updated.data[0],
                'is_returning': times_picked_up > 1,
                'times_picked_up': times_picked_up
            }), 200

        # Create new user_quest record
        new_user_quest = {
            'user_id': user_id,
            'quest_id': quest_id,
            'status': 'picked_up',
            'is_active': True,
            'times_picked_up': 1,
            'last_picked_up_at': datetime.utcnow().isoformat(),
            'started_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('user_quests').insert(new_user_quest).execute()

        if not result.data:
            return jsonify({'error': 'Failed to pick up quest'}), 500

        return jsonify({
            'message': 'Quest picked up successfully',
            'user_quest': result.data[0],
            'is_returning': False,
            'times_picked_up': 1
        }), 201

    except Exception as e:
        logger.error(f"Error picking up quest {quest_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quest_lifecycle_bp.route('/quests/<quest_id>/setdown', methods=['POST'])
@require_auth
def set_down_quest(user_id, quest_id):
    """
    Set down a quest (consciously move on).
    Optionally save reflection note.
    """
    try:
        data = request.get_json() or {}
        reflection_note = data.get('reflection_note')
        prompt_id = data.get('prompt_id')

        supabase = get_user_client()

        # Get user's quest record
        user_quest_result = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not user_quest_result.data:
            return jsonify({'error': 'Quest not found for this user'}), 404

        user_quest = user_quest_result.data[0]

        # Prepare update
        update_data = {
            'status': 'set_down',
            'is_active': False,  # For backward compatibility
            'last_set_down_at': datetime.utcnow().isoformat()
        }

        # Add reflection note if provided
        if reflection_note:
            existing_reflections = user_quest.get('reflection_notes', [])
            if not isinstance(existing_reflections, list):
                existing_reflections = []

            new_reflection = {
                'note': reflection_note,
                'prompt_id': prompt_id,
                'created_at': datetime.utcnow().isoformat()
            }
            existing_reflections.append(new_reflection)
            update_data['reflection_notes'] = existing_reflections

        # Update user_quest
        updated = supabase.table('user_quests')\
            .update(update_data)\
            .eq('id', user_quest['id'])\
            .execute()

        if not updated.data:
            return jsonify({'error': 'Failed to set down quest'}), 500

        # NOTE: Database trigger will automatically check badge eligibility
        # when status changes to 'set_down'

        return jsonify({
            'message': 'Quest set down successfully',
            'user_quest': updated.data[0],
            'reflection_saved': bool(reflection_note)
        }), 200

    except Exception as e:
        logger.error(f"Error setting down quest {quest_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quest_lifecycle_bp.route('/quests/<quest_id>/pickup-history', methods=['GET'])
@require_auth
def get_pickup_history(user_id, quest_id):
    """
    Get quest pickup history for a user.
    Shows times_picked_up, reflections, and dates.
    """
    try:
        supabase = get_user_client()

        user_quest = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not user_quest.data:
            return jsonify({'error': 'Quest not found for this user'}), 404

        quest_data = user_quest.data[0]

        return jsonify({
            'quest_id': quest_id,
            'status': quest_data.get('status'),
            'times_picked_up': quest_data.get('times_picked_up', 0),
            'last_picked_up_at': quest_data.get('last_picked_up_at'),
            'last_set_down_at': quest_data.get('last_set_down_at'),
            'started_at': quest_data.get('started_at'),
            'reflections': quest_data.get('reflection_notes', [])
        }), 200

    except Exception as e:
        logger.error(f"Error getting pickup history for quest {quest_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quest_lifecycle_bp.route('/reflection-prompts', methods=['GET'])
@require_auth
def get_reflection_prompts(user_id):
    """
    Get random reflection prompts for set down flow.
    Optional category filter via query param.
    """
    try:
        category = request.args.get('category')
        limit = int(request.args.get('limit', 5))

        prompts = BadgeService.get_reflection_prompts(category=category, limit=limit)

        return jsonify({
            'prompts': prompts,
            'count': len(prompts)
        }), 200

    except Exception as e:
        logger.error(f"Error getting reflection prompts: {str(e)}")
        return jsonify({'error': str(e)}), 500
