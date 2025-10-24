"""
LMS Integration Routes

Handles LTI 1.3 launches, SSO authentication, roster sync, and assignment imports.
"""

from flask import Blueprint, request, redirect, jsonify, current_app, make_response
from services.lti_service import LTI13Service
from services.lms_sync_service import LMSSyncService
from utils.auth.decorators import require_admin
from utils.session_manager import session_manager
from middleware.error_handler import ValidationError, AuthenticationError
from lms_config.lms_platforms import get_supported_platforms, get_platform_config, validate_platform_config

from utils.logger import get_logger
from backend.repositories import (
    LMSRepository,
    QuestRepository,
    TaskCompletionRepository,
    TaskRepository,
    UserRepository
)

logger = get_logger(__name__)

bp = Blueprint('lms', __name__)

lti_service = LTI13Service()
sync_service = LMSSyncService()

@bp.route('/lti/launch', methods=['POST'])
def lti_launch():
    """
    Handle LTI 1.3 launch request from LMS

    Expected POST parameters:
    - id_token: JWT token from LMS
    - state: State parameter for security
    """
    try:
        id_token = request.form.get('id_token')
        platform = request.form.get('platform', 'canvas')

        if not id_token:
            raise ValidationError('No LTI token provided')

        # Validate LTI token
        user_data = lti_service.validate_launch(id_token, platform)

        if not user_data:
            raise AuthenticationError('Invalid LTI launch')

        # Create or get user
        user = lti_service.create_or_update_user(user_data)

        if not user:
            raise AuthenticationError('Failed to create user from LTI launch')

        # Generate Optio session
        response = make_response()
        session_manager.set_auth_cookies(response, user['id'])

        # Redirect to Optio dashboard
        frontend_url = current_app.config.get('FRONTEND_URL', 'https://www.optioeducation.com')
        redirect_url = f"{frontend_url}/dashboard?lti=true"

        response = redirect(redirect_url)
        session_manager.set_auth_cookies(response, user['id'])

        return response

    except (ValidationError, AuthenticationError):
        raise
    except Exception as e:
        current_app.logger.error(f"LTI launch error: {e}")
        raise AuthenticationError('LTI launch failed')

# Using repository pattern for database access
@bp.route('/api/lms/platforms', methods=['GET'])
@require_admin
def list_platforms(user_id):
    """
    Get list of supported LMS platforms with their configuration status

    Returns:
        JSON array of platform objects
    """
    try:
        platforms = []

        for platform_id in get_supported_platforms():
            config = get_platform_config(platform_id)
            is_valid, missing_vars = validate_platform_config(platform_id)

            platforms.append({
                'id': platform_id,
                'name': config.get('name'),
                'auth_method': config.get('auth_method'),
                'configured': is_valid,
                'missing_vars': missing_vars if not is_valid else [],
                'supports_grade_passback': config.get('supports_grade_passback', False),
                'supports_roster_sync': config.get('supports_roster_sync', False)
            })

        return jsonify(platforms), 200

    except Exception as e:
        current_app.logger.error(f"Error listing platforms: {e}")
        return jsonify({'error': 'Failed to list platforms'}), 500

@bp.route('/api/lms/sync/roster', methods=['POST'])
@require_admin
def sync_roster(user_id):
    """
    Sync student roster from LMS via OneRoster CSV

    Expected form data:
    - roster_csv: CSV file
    - lms_platform: Platform identifier (canvas, google_classroom, etc.)

    Returns:
        JSON with sync results
    """
    try:
        csv_file = request.files.get('roster_csv')
        lms_platform = request.form.get('lms_platform')

        if not csv_file:
            raise ValidationError('No CSV file provided')

        if not lms_platform:
            raise ValidationError('No LMS platform specified')

        if lms_platform not in get_supported_platforms():
            raise ValidationError(f'Unsupported platform: {lms_platform}')

        # Read CSV content
        csv_content = csv_file.read().decode('utf-8')

        # Sync roster
        result = sync_service.sync_roster_from_oneroster(csv_content, lms_platform)

        return jsonify(result), 200

    except ValidationError:
        raise
    except Exception as e:
        current_app.logger.error(f"Roster sync error: {e}")
        return jsonify({'error': 'Roster sync failed', 'details': str(e)}), 500

@bp.route('/api/lms/sync/assignments', methods=['POST'])
@require_admin
def sync_assignments(user_id):
    """
    Sync LMS assignments as Optio quests

    Expected JSON body:
    - assignments: Array of assignment objects
    - lms_platform: Platform identifier

    Returns:
        JSON with sync results
    """
    try:
        data = request.json

        if not data or not data.get('assignments'):
            raise ValidationError('No assignments provided')

        lms_platform = data.get('lms_platform')
        if not lms_platform or lms_platform not in get_supported_platforms():
            raise ValidationError('Invalid or missing LMS platform')

        synced = 0
        errors = []

        for assignment in data['assignments']:
            try:
                assignment['platform'] = lms_platform
                quest = sync_service.sync_lms_assignment_to_quest(assignment)

                if quest:
                    synced += 1
                else:
                    errors.append(f"Failed to sync assignment {assignment.get('id')}")

            except Exception as e:
                errors.append(f"Assignment {assignment.get('id')}: {str(e)}")

        return jsonify({
            'synced': synced,
            'errors': errors
        }), 200

    except ValidationError:
        raise
    except Exception as e:
        current_app.logger.error(f"Assignment sync error: {e}")
        return jsonify({'error': 'Assignment sync failed'}), 500

@bp.route('/api/lms/grade-sync/status', methods=['GET'])
@require_admin
def grade_sync_status(user_id):
    """
    Get status of grade sync queue

    Returns:
        JSON with grade sync statistics
    """
    try:
        from database import get_supabase_admin_client
from backend.repositories import (
    UserRepository,
    QuestRepository,
    BadgeRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
        supabase = get_supabase_admin_client()

        # Get counts by status
        pending = supabase.table('lms_grade_sync').select('id', count='exact').eq('sync_status', 'pending').execute()
        completed = supabase.table('lms_grade_sync').select('id', count='exact').eq('sync_status', 'completed').execute()
        failed = supabase.table('lms_grade_sync').select('id', count='exact').eq('sync_status', 'failed').execute()

        return jsonify({
            'pending': pending.count if hasattr(pending, 'count') else 0,
            'completed': completed.count if hasattr(completed, 'count') else 0,
            'failed': failed.count if hasattr(failed, 'count') else 0
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error getting grade sync status: {e}")
        return jsonify({'error': 'Failed to get grade sync status'}), 500

@bp.route('/api/lms/integration/status', methods=['GET'])
def get_integration_status():
    """
    Get LMS integration status for current user

    Returns:
        JSON with integration details
    """
    try:
        # Get user ID from session
        user_id = session_manager.get_current_user_id()

        if not user_id:
            return jsonify({'integrated': False}), 200

        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()

        # Get user's LMS integration
        integration = supabase.table('lms_integrations').select('*').eq('user_id', user_id).execute()

        if not integration.data:
            return jsonify({'integrated': False}), 200

        integration_data = integration.data[0]

        return jsonify({
            'integrated': True,
            'platform': integration_data.get('lms_platform'),
            'sync_enabled': integration_data.get('sync_enabled', True),
            'last_sync': integration_data.get('last_sync_at'),
            'sync_status': integration_data.get('sync_status', 'pending')
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error getting integration status: {e}")
        return jsonify({'error': 'Failed to get integration status'}), 500
