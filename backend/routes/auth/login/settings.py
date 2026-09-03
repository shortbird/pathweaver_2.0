"""
Login Module - AI Settings

User AI preference settings.
"""

from flask import request, jsonify
from utils.session_manager import session_manager

from utils.logger import get_logger
from utils.api_response_v1 import error_response


logger = get_logger(__name__)


def register_routes(bp):
    """Register routes on the blueprint."""
    @bp.route('/ai-settings', methods=['GET'])
    def get_ai_settings():
        """Get current user's AI assistance settings"""
        try:
            user_id = session_manager.get_effective_user_id()

            if not user_id:
                return error_response(
                    code='AUTHENTICATION_REQUIRED',
                    message='Authentication required',
                    status=401
                )

            from services.learning_ai_orchestrator import LearningAIOrchestrator
            orchestrator = LearningAIOrchestrator()

            result = orchestrator.get_user_ai_settings(user_id)

            if result['success']:
                return jsonify({
                    'success': True,
                    'settings': result['settings']
                }), 200
            else:
                return error_response(
                    code='FETCH_SETTINGS_FAILED',
                    message=result.get('error', 'Failed to fetch AI settings'),
                    status=500
                )

        except Exception as e:
            logger.error(f"Error getting AI settings: {e}")
            return error_response(
                code='INTERNAL_ERROR',
                message='Internal server error',
                status=500
            )


    @bp.route('/ai-settings', methods=['PUT'])
    def update_ai_settings():
        """Update current user's AI assistance settings"""
        try:
            user_id = session_manager.get_effective_user_id()

            if not user_id:
                return error_response(
                    code='AUTHENTICATION_REQUIRED',
                    message='Authentication required',
                    status=401
                )

            data = request.get_json()
            if not data:
                return error_response(
                    code='VALIDATION_ERROR',
                    message='Request body is required',
                    status=400
                )

            ai_assistance_level = data.get('ai_assistance_level')
            if not ai_assistance_level:
                return error_response(
                    code='VALIDATION_ERROR',
                    message='ai_assistance_level is required',
                    status=400
                )

            from services.learning_ai_orchestrator import LearningAIOrchestrator
            orchestrator = LearningAIOrchestrator()

            result = orchestrator.update_user_ai_settings(user_id, ai_assistance_level)

            if result['success']:
                return jsonify({
                    'success': True,
                    'ai_assistance_level': result['ai_assistance_level'],
                    'message': 'AI settings updated successfully'
                }), 200
            else:
                return error_response(
                    code='UPDATE_SETTINGS_FAILED',
                    message=result.get('error', 'Failed to update AI settings'),
                    status=400
                )

        except Exception as e:
            logger.error(f"Error updating AI settings: {e}")
            return error_response(
                code='INTERNAL_ERROR',
                message='Internal server error',
                status=500
            )
