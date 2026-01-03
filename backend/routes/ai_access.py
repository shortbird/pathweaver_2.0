"""
AI Access Status API endpoint.

Provides an endpoint for the frontend to check the current user's AI access status
so that AI features can be hidden/shown appropriately.
"""

from flask import Blueprint, jsonify
from utils.auth.decorators import require_auth
from utils.ai_access import get_ai_feature_status
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('ai_access', __name__, url_prefix='/api/ai-access')


@bp.route('/status', methods=['GET'])
@require_auth
def get_ai_access_status(user_id: str):
    """
    Get the current user's AI access status.

    Returns:
        200: {
            has_access: bool,
            reason?: str (only if access denied),
            code?: str (only if access denied),
            features: {
                chatbot: bool,
                lesson_helper: bool,
                task_generation: bool
            },
            org_limits: {
                chatbot: bool,
                lesson_helper: bool,
                task_generation: bool
            }
        }
    """
    try:
        status = get_ai_feature_status(user_id)
        return jsonify(status), 200

    except Exception as e:
        logger.error(f"Error getting AI access status for user {user_id}: {e}")
        # On error, return access granted to avoid blocking users
        return jsonify({
            'has_access': True,
            'features': {
                'chatbot': True,
                'lesson_helper': True,
                'task_generation': True
            },
            'org_limits': {
                'chatbot': True,
                'lesson_helper': True,
                'task_generation': True
            }
        }), 200
