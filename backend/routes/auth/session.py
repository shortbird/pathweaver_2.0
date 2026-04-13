"""
Authentication Module: Session Management

Handles:
- CSRF token generation for frontend requests
- Tutorial completion tracking
"""

from datetime import datetime
from flask import Blueprint, request, jsonify
from middleware.csrf_protection import get_csrf_token
from utils.auth.decorators import require_auth
from utils.session_manager import session_manager
from database import get_supabase_admin_client
import secrets

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('auth_session', __name__)


# ============================================================================
# ENDPOINTS
# ============================================================================

@bp.route('/csrf-token', methods=['GET'])
def get_csrf_token_endpoint():
    """
    Get CSRF token for frontend requests.

    SECURITY FIX (P1-SEC-3): httpOnly double-submit pattern
    - Token stored in Flask session (httpOnly cookie) by Flask-WTF
    - Token returned in response body for frontend to send in headers
    - No non-httpOnly cookie needed (prevents XSS token theft)
    - Flask-WTF validates header token against session token
    """
    try:
        token = get_csrf_token()

        if not token:
            # If CSRF is not available, generate a simple token for compatibility
            token = secrets.token_urlsafe(32)

        # Return token in response body only (no non-httpOnly cookie)
        # Frontend will store this in memory and send in X-CSRF-Token header
        # Flask-WTF validates header against its session (httpOnly cookie)
        return jsonify({
            'csrf_token': token
        }), 200

    except Exception as e:
        logger.error(f"Error generating CSRF token: {str(e)}")
        return jsonify({'error': 'Failed to generate CSRF token'}), 500


@bp.route('/tutorial-completed', methods=['PATCH'])
@require_auth
def mark_tutorial_completed(user_id):
    """Mark the user's onboarding tutorial as completed."""
    try:
        current_user_id = session_manager.get_effective_user_id()
        # admin client justified: writes user's own tutorial_completed_at after @require_auth; bypasses RLS to avoid policy churn for a one-shot self-update
        client = get_supabase_admin_client()

        client.table('users').update({
            'tutorial_completed_at': datetime.utcnow().isoformat()
        }).eq('id', current_user_id).execute()

        logger.info(f"Tutorial completed for user {current_user_id}")

        return jsonify({'success': True}), 200

    except Exception as e:
        logger.error(f"Error marking tutorial completed: {str(e)}")
        return jsonify({'error': str(e)}), 500
