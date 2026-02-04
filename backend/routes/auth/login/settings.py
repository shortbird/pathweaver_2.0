"""
Login Module - AI Settings

User AI preference settings.
"""

from flask import request, jsonify, make_response
from database import get_supabase_client, get_supabase_admin_client
from utils.session_manager import session_manager
from middleware.rate_limiter import rate_limit
from utils.log_scrubber import mask_user_id, mask_email
from middleware.error_handler import ValidationError, AuthenticationError
from datetime import datetime, timedelta, timezone
import os
import time
import random

from utils.logger import get_logger
from config.constants import MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MINUTES
from utils.api_response_v1 import success_response, error_response
from utils.retry_handler import with_connection_retry

from .security import (
    constant_time_delay,
    check_account_lockout,
    record_failed_login,
    reset_login_attempts,
    ensure_user_diploma_and_skills
)

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


    def get_safari_recommendations(is_safari, has_cookie, has_header, is_authenticated):
        """Generate Safari-specific troubleshooting recommendations"""
        recommendations = []

        if is_safari and not has_cookie and not has_header:
            recommendations.append({
                'issue': 'Safari is blocking cookies and no Authorization header detected',
                'solution': 'Frontend should automatically use Authorization headers. Check browser console for errors.',
                'action': 'Try logging out and logging back in to refresh authentication method.'
            })
        elif is_safari and not has_cookie and has_header:
            recommendations.append({
                'issue': 'Safari is blocking cookies (expected behavior)',
                'solution': 'Using Authorization header fallback - this is working correctly!',
                'action': 'No action needed. System is functioning normally with Safari.'
            })
        elif is_safari and has_cookie:
            recommendations.append({
                'issue': 'None - cookies are working in Safari',
                'solution': 'Your Safari browser is accepting cookies. System is functioning normally.',
                'action': 'No action needed.'
            })
        elif not is_authenticated:
            recommendations.append({
                'issue': 'Not authenticated',
                'solution': 'Please log in to access protected resources.',
                'action': 'Navigate to the login page.'
            })
        else:
            recommendations.append({
                'issue': 'None detected',
                'solution': 'System is functioning normally.',
                'action': 'No action needed.'
            })

        return recommendations