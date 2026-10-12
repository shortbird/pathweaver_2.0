"""
AI Access Status API endpoint.

Provides an endpoint for the frontend to check the current user's AI access status
so that AI features can be hidden/shown appropriately.
"""

from flask import Blueprint, jsonify
from utils.auth.decorators import require_auth
from utils.auth.relationships import student_scope
from utils.ai_access import get_ai_feature_status
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('ai_access', __name__, url_prefix='/api/ai-access')


@bp.route('/status', methods=['GET'])
@require_auth
@student_scope()
def get_ai_access_status(user_id: str):
    """
    Get the current user's AI access status.

    A parent working for a child passes `?student_id=<child>`; @student_scope
    swaps `user_id` for the child after the guardian check, so the answer is
    the CHILD's switches. Without it the web asked about the parent, showed
    the AI buttons, and the child-scoped call behind them was refused with
    403 ai_disabled (Sentry 64448412 / e7429a56). A caller who is not the
    child's guardian gets the 403 the relationship gate speaks.

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
