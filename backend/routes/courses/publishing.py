"""
Courses Module - Publishing

Course publishing workflow.
"""

from datetime import datetime
from flask import request, jsonify
from utils.auth.decorators import require_auth, require_admin
from database import get_user_client, get_supabase_admin_client
from utils.session_manager import session_manager
from middleware.error_handler import ValidationError
from repositories.base_repository import NotFoundError
from services.course_progress_service import CourseProgressService
from services.file_upload_service import FileUploadService
from services.course_service import CourseService
from utils.logger import get_logger
from utils.roles import get_effective_role
from utils.slug_utils import generate_slug, ensure_unique_slug
from routes.courses import can_manage_course

logger = get_logger(__name__)


def register_routes(bp):
    """Register routes on the blueprint."""

    @bp.route('/<course_id>/publish', methods=['POST'])
    @require_auth
    def publish_course(user_id, course_id: str):
        """
        Publish a course and optionally create a completion badge.

        Path params:
            course_id: Course UUID

        Optional body:
            - create_badge: Boolean (default: false)
            - badge_name: Badge name (defaults to course title + ' Completion')
            - badge_description: Badge description
        """
        try:
            user_id = session_manager.get_effective_user_id()
            # admin client justified: course publishing flow under @require_auth; updates courses.status after verifying caller is course owner / org admin / superadmin
            admin_client = get_supabase_admin_client()

            # Check permissions
            course_result = admin_client.table('courses').select('*').eq('id', course_id).execute()
            if not course_result.data:
                return jsonify({'error': 'Course not found'}), 404

            course = course_result.data[0]
            user_result = admin_client.table('users').select('organization_id, role, org_role').eq('id', user_id).execute()
            if not user_result.data:
                return jsonify({'error': 'User not found'}), 404

            user_data = {**user_result.data[0], 'id': user_id}

            if not can_manage_course(user_data, course):
                return jsonify({'error': 'Insufficient permissions. Only the course creator or superadmin can manage courses.'}), 403

            # Update course status (badges feature removed 2026-04; no badge creation)
            updates = {'status': 'published'}

            result = admin_client.table('courses').update(updates).eq('id', course_id).execute()
            if not result.data:
                return jsonify({'error': 'Failed to publish course'}), 500

            logger.info(f"Course published: {course_id} by {user_id}")

            return jsonify({
                'success': True,
                'course': result.data[0]
            }), 200

        except Exception as e:
            logger.error(f"Error publishing course {course_id}: {str(e)}")
            return jsonify({'error': str(e)}), 500

