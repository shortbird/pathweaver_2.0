"""
Platform Settings

Singleton row holding platform-wide settings (currently: teacher-of-record
info displayed on every student-curated class page).
"""

from datetime import datetime
from flask import Blueprint, jsonify, request
from utils.auth.decorators import require_auth
from database import get_supabase_admin_client
from utils.session_manager import session_manager
from utils.logger import get_logger
from utils.roles import get_effective_role

logger = get_logger(__name__)

bp = Blueprint('platform_settings', __name__, url_prefix='/api/platform')

SETTINGS_ROW_ID = 1


@bp.route('/settings', methods=['GET'])
def get_settings():
    """
    Public endpoint — returns platform-level settings used on public pages
    (teacher-of-record name, bio, credentials). No auth required.
    """
    try:
        client = get_supabase_admin_client()
        result = client.table('platform_settings').select(
            'teacher_name, teacher_bio, teacher_credentials, updated_at'
        ).eq('id', SETTINGS_ROW_ID).execute()

        settings = result.data[0] if result.data else {
            'teacher_name': None,
            'teacher_bio': None,
            'teacher_credentials': None,
            'updated_at': None,
        }

        return jsonify({'success': True, 'settings': settings}), 200

    except Exception as e:
        logger.error(f"Error loading platform settings: {str(e)}")
        return jsonify({'error': str(e)}), 500


@bp.route('/settings', methods=['PUT'])
@require_auth
def update_settings(user_id):
    """Update platform settings. Superadmin only."""
    try:
        user_id = session_manager.get_effective_user_id()
        client = get_supabase_admin_client()

        user_result = client.table('users').select('role, org_role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404
        user_data = {**user_result.data[0], 'id': user_id}

        if get_effective_role(user_data) != 'superadmin':
            return jsonify({'error': 'Only superadmins can update platform settings'}), 403

        data = request.get_json(silent=True) or {}
        updates = {}
        for field in ('teacher_name', 'teacher_bio', 'teacher_credentials'):
            if field in data:
                value = data[field]
                updates[field] = value if value else None

        if not updates:
            return jsonify({'error': 'No fields to update'}), 400

        updates['updated_at'] = datetime.utcnow().isoformat()
        updates['updated_by'] = user_id

        client.table('platform_settings').update(updates).eq('id', SETTINGS_ROW_ID).execute()
        logger.info(f"Platform settings updated by {user_id}: fields={list(updates.keys())}")

        result = client.table('platform_settings').select(
            'teacher_name, teacher_bio, teacher_credentials, updated_at'
        ).eq('id', SETTINGS_ROW_ID).execute()

        return jsonify({'success': True, 'settings': result.data[0] if result.data else {}}), 200

    except Exception as e:
        logger.error(f"Error updating platform settings: {str(e)}")
        return jsonify({'error': str(e)}), 500


def register_platform_settings_routes(app):
    app.register_blueprint(bp)
