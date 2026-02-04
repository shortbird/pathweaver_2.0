"""
Courses Module - Course Homepage

Course homepage data aggregation.
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

logger = get_logger(__name__)


def register_routes(bp):
    """Register routes on the blueprint."""

    @bp.route('/<course_id>/homepage', methods=['GET'])
    @require_auth
    def get_course_homepage(user_id, course_id: str):
        """
        Get comprehensive course data for the student homepage view.
        Includes course details, quests with lessons, progress, and enrollment status.

        Path params:
            course_id: Course UUID

        Returns:
            - course: Course details (title, description, cover_image_url, etc.)
            - quests: Array of quests with lessons and progress data
            - enrollment: User's enrollment status in this course
        """
        try:
            current_user_id = session_manager.get_effective_user_id()

            result = CourseService.get_course_homepage_data(course_id, current_user_id)

            if 'error' in result:
                return jsonify({'error': result['error']}), result.get('status_code', 404)

            return jsonify({
                'success': True,
                'course': result['course'],
                'quests': result['quests'],
                'enrollment': result['enrollment'],
                'progress': result['progress']
            }), 200

        except Exception as e:
            logger.error(f"Error getting course homepage for {course_id}: {str(e)}", exc_info=True)
            return jsonify({'error': str(e)}), 500
