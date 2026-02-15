"""
REPOSITORY MIGRATION: COMPLETE
- Uses QuestLifecycleService for pickup/setdown/history operations
- Uses QuestInvitationService for invitation operations
- Routes are thin controllers handling HTTP concerns only

Quest Lifecycle Routes
Handles pick up/set down workflow and reflection system.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from services.quest_lifecycle_service import QuestLifecycleService
from services.quest_invitation_service import QuestInvitationService
from middleware.error_handler import ValidationError, NotFoundError
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
        service = QuestLifecycleService()
        result = service.pickup_quest(user_id, quest_id)

        if 'error' in result:
            return jsonify({'error': result['error']}), result.get('status', 500)

        status_code = result.pop('status', 200)
        return jsonify(result), status_code

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

        service = QuestLifecycleService()
        result = service.set_down_quest(
            user_id, quest_id,
            reflection_note=reflection_note,
            prompt_id=prompt_id
        )

        if 'error' in result:
            return jsonify({'error': result['error']}), result.get('status', 500)

        status_code = result.pop('status', 200)
        return jsonify(result), status_code

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
        service = QuestLifecycleService()
        result = service.get_pickup_history(user_id, quest_id)

        if 'error' in result:
            return jsonify({'error': result['error']}), result.get('status', 404)

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error getting pickup history for quest {quest_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quest_lifecycle_bp.route('/reflection-prompts', methods=['GET'])
@require_auth
def get_reflection_prompts(user_id):
    """
    Get random reflection prompts for set down flow.
    NOTE: Badge system removed (January 2026). Returns empty list.
    """
    return jsonify({
        'prompts': [],
        'count': 0
    }), 200


# ==================== Student Quest Invitations ====================

@quest_lifecycle_bp.route('/students/quest-invitations', methods=['GET'])
@require_auth
def get_student_quest_invitations(user_id):
    """Get all pending quest invitations for the logged-in student"""
    try:
        invitation_service = QuestInvitationService()
        invitations = invitation_service.get_student_invitations(user_id)

        return jsonify({
            'success': True,
            'invitations': invitations,
            'count': len(invitations)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching student invitations: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch invitations'
        }), 500


@quest_lifecycle_bp.route('/students/quest-invitations/<invitation_id>/accept', methods=['POST'])
@require_auth
def accept_quest_invitation(user_id, invitation_id):
    """Student accepts a quest invitation and auto-enrolls in the quest"""
    try:
        invitation_service = QuestInvitationService()
        result = invitation_service.accept_invitation(invitation_id, user_id)

        return jsonify({
            'success': True,
            'invitation': result['invitation'],
            'quest_enrollment': result['quest_enrollment'],
            'already_enrolled': result['already_enrolled'],
            'message': 'Invitation accepted and enrolled in quest' if not result['already_enrolled'] else 'Invitation accepted (already enrolled)'
        }), 200

    except ValidationError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except NotFoundError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Error accepting invitation: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to accept invitation'
        }), 500


@quest_lifecycle_bp.route('/students/quest-invitations/<invitation_id>/decline', methods=['POST'])
@require_auth
def decline_quest_invitation(user_id, invitation_id):
    """Student declines a quest invitation"""
    try:
        invitation_service = QuestInvitationService()
        invitation = invitation_service.decline_invitation(invitation_id, user_id)

        return jsonify({
            'success': True,
            'invitation': invitation,
            'message': 'Invitation declined'
        }), 200

    except ValidationError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except NotFoundError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Error declining invitation: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to decline invitation'
        }), 500
