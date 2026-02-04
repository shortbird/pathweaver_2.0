"""
Courses Module - Quest Management

Managing quests/projects within courses.
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

    @bp.route('/<course_id>/quests', methods=['GET'])
    @require_auth
    def get_course_quests(user_id, course_id: str):
        """
        Get all quests in a course.

        Path params:
            course_id: Course UUID

        Returns:
            List of quests with their course-specific data
        """
        try:
            client = get_supabase_admin_client()

            # Check course exists
            course_result = client.table('courses').select('id').eq('id', course_id).execute()
            if not course_result.data:
                return jsonify({'error': 'Course not found'}), 404

            # Get course quests with quest details
            result = client.table('course_quests').select(
                'id, sequence_order, custom_title, intro_content, is_required, is_published, xp_threshold, quest_id, quests(id, title, description, quest_type, header_image_url)'
            ).eq('course_id', course_id).order('sequence_order').execute()

            # Flatten the quest data
            quests = []
            for item in (result.data or []):
                quest_data = item.get('quests', {}) or {}
                quests.append({
                    'id': quest_data.get('id') or item.get('quest_id'),
                    'title': item.get('custom_title') or quest_data.get('title'),
                    'description': quest_data.get('description'),
                    'quest_type': quest_data.get('quest_type'),
                    'header_image_url': quest_data.get('header_image_url'),
                    'order_index': item.get('sequence_order', 0),
                    'is_required': item.get('is_required', False),
                    'is_published': item.get('is_published', True),
                    'intro_content': item.get('intro_content'),
                    'xp_threshold': item.get('xp_threshold', 0)
                })

            return jsonify({
                'success': True,
                'quests': quests
            }), 200

        except Exception as e:
            logger.error(f"Error getting quests for course {course_id}: {str(e)}")
            return jsonify({'error': str(e)}), 500


    @bp.route('/<course_id>/quests', methods=['POST'])
    @require_auth
    def add_quest_to_course(user_id, course_id: str):
        """
        Add a quest to a course.

        Path params:
            course_id: Course UUID

        Required body:
            - quest_id: Quest UUID

        Optional body:
            - sequence_order: Position in course (defaults to end)
            - custom_title: Override quest title for this course
            - intro_content: JSONB intro content
            - is_required: Boolean (default: false)
        """
        try:
            user_id = session_manager.get_effective_user_id()
            client = get_supabase_admin_client()  # Use admin client to bypass RLS

            # Check permissions
            course_result = client.table('courses').select('created_by, organization_id').eq('id', course_id).execute()
            if not course_result.data:
                return jsonify({'error': 'Course not found'}), 404

            course = course_result.data[0]
            user_result = client.table('users').select('organization_id, role, org_role').eq('id', user_id).execute()
            if not user_result.data:
                return jsonify({'error': 'User not found'}), 404

            user_data = user_result.data[0]
            effective_role = get_effective_role(user_data)

            is_creator = course['created_by'] == user_id
            has_admin_role = effective_role in ['superadmin', 'org_admin', 'advisor']
            is_admin = has_admin_role and (effective_role == 'superadmin' or user_data['organization_id'] == course['organization_id'])

            if not (is_creator or is_admin):
                return jsonify({'error': 'Insufficient permissions'}), 403

            data = request.json
            if not data or not data.get('quest_id'):
                return jsonify({'error': 'quest_id is required'}), 400

            # Get sequence order
            sequence_order = data.get('sequence_order')
            if sequence_order is None:
                existing = client.table('course_quests').select('sequence_order').eq(
                    'course_id', course_id
                ).order('sequence_order', desc=True).limit(1).execute()
                sequence_order = (existing.data[0]['sequence_order'] + 1) if existing.data else 0

            quest_data = {
                'course_id': course_id,
                'quest_id': data['quest_id'],
                'sequence_order': sequence_order,
                'custom_title': data.get('custom_title'),
                'intro_content': data.get('intro_content', {}),
                'is_required': data.get('is_required', False)
            }

            result = client.table('course_quests').insert(quest_data).execute()
            if not result.data:
                return jsonify({'error': 'Failed to add quest to course'}), 500

            logger.info(f"Quest {data['quest_id']} added to course {course_id}")

            return jsonify({
                'success': True,
                'course_quest': result.data[0]
            }), 201

        except Exception as e:
            logger.error(f"Error adding quest to course {course_id}: {str(e)}")
            return jsonify({'error': str(e)}), 500


    @bp.route('/<course_id>/quests/<quest_id>', methods=['DELETE'])
    @require_auth
    def remove_quest_from_course(user_id, course_id: str, quest_id: str):
        """
        Remove a quest from a course.

        Path params:
            course_id: Course UUID
            quest_id: Quest UUID

        Query params:
            delete_quest: If 'true', also delete the underlying quest (if not used elsewhere)
        """
        try:
            user_id = session_manager.get_effective_user_id()
            client = get_supabase_admin_client()  # Use admin client to bypass RLS

            # Check permissions
            course_result = client.table('courses').select('created_by, organization_id').eq('id', course_id).execute()
            if not course_result.data:
                return jsonify({'error': 'Course not found'}), 404

            course = course_result.data[0]
            user_result = client.table('users').select('organization_id, role, org_role').eq('id', user_id).execute()
            if not user_result.data:
                return jsonify({'error': 'User not found'}), 404

            user_data = user_result.data[0]
            effective_role = get_effective_role(user_data)

            is_creator = course['created_by'] == user_id
            has_admin_role = effective_role in ['superadmin', 'org_admin', 'advisor']
            is_admin = has_admin_role and (effective_role == 'superadmin' or user_data['organization_id'] == course['organization_id'])

            if not (is_creator or is_admin):
                return jsonify({'error': 'Insufficient permissions'}), 403

            delete_quest = request.args.get('delete_quest', 'false').lower() == 'true'

            # Only superadmin can permanently delete quests
            if delete_quest and effective_role != 'superadmin':
                delete_quest = False  # Force to just remove, not delete

            # Remove from course_quests junction table
            client.table('course_quests').delete().eq(
                'course_id', course_id
            ).eq('quest_id', quest_id).execute()

            logger.info(f"Quest {quest_id} removed from course {course_id}")

            quest_deleted = False
            deletion_reason = None
            if delete_quest:
                # Check if quest is used in other courses
                other_courses = client.table('course_quests').select('id').eq('quest_id', quest_id).execute()

                # Check if quest has user enrollments (excluding the person deleting)
                # This allows deletion if only the creator is enrolled
                enrollments = client.table('user_quests').select('id').eq('quest_id', quest_id).neq('user_id', user_id).limit(1).execute()

                if not other_courses.data and not enrollments.data:
                    # Safe to delete - delete lessons first, then quest
                    client.table('curriculum_lessons').delete().eq('quest_id', quest_id).execute()
                    client.table('quests').delete().eq('id', quest_id).execute()
                    quest_deleted = True
                    logger.info(f"Quest {quest_id} deleted along with removal from course {course_id}")
                else:
                    # Set the reason why the quest wasn't deleted
                    if other_courses.data:
                        deletion_reason = 'used_in_other_courses'
                    elif enrollments.data:
                        deletion_reason = 'has_enrollments'
                    logger.info(f"Quest {quest_id} not deleted - reason: {deletion_reason}")

            return jsonify({
                'success': True,
                'message': 'Quest removed from course',
                'quest_deleted': quest_deleted,
                'deletion_reason': deletion_reason
            }), 200

        except Exception as e:
            logger.error(f"Error removing quest from course {course_id}: {str(e)}")
            return jsonify({'error': str(e)}), 500


    @bp.route('/<course_id>/quests/<quest_id>', methods=['PUT'])
    @require_auth
    def update_course_quest(user_id, course_id: str, quest_id: str):
        """
        Update a quest's settings in a course (e.g., xp_threshold).

        Path params:
            course_id: Course UUID
            quest_id: Quest UUID

        Optional body fields:
            - xp_threshold: XP required to unlock this quest
        """
        try:
            user_id = session_manager.get_effective_user_id()
            client = get_supabase_admin_client()

            # Check permissions
            course_result = client.table('courses').select('created_by, organization_id').eq('id', course_id).execute()
            if not course_result.data:
                return jsonify({'error': 'Course not found'}), 404

            course = course_result.data[0]
            user_result = client.table('users').select('organization_id, role, org_role').eq('id', user_id).execute()
            if not user_result.data:
                return jsonify({'error': 'User not found'}), 404

            user_data = user_result.data[0]
            effective_role = get_effective_role(user_data)

            is_creator = course['created_by'] == user_id
            has_admin_role = effective_role in ['superadmin', 'org_admin', 'advisor']
            is_admin = has_admin_role and (effective_role == 'superadmin' or user_data['organization_id'] == course['organization_id'])

            if not (is_creator or is_admin):
                return jsonify({'error': 'Insufficient permissions'}), 403

            data = request.json
            if not data:
                return jsonify({'error': 'No data provided'}), 400

            # Build updates
            updates = {}
            if 'xp_threshold' in data:
                xp_threshold = data['xp_threshold']
                if not isinstance(xp_threshold, (int, float)) or xp_threshold < 0:
                    return jsonify({'error': 'xp_threshold must be a non-negative number'}), 400
                updates['xp_threshold'] = int(xp_threshold)

            if 'is_published' in data:
                is_published = data['is_published']
                if not isinstance(is_published, bool):
                    return jsonify({'error': 'is_published must be a boolean'}), 400
                updates['is_published'] = is_published

            if not updates:
                return jsonify({'error': 'No valid fields to update'}), 400

            # Update course_quests
            result = client.table('course_quests').update(updates).eq(
                'course_id', course_id
            ).eq('quest_id', quest_id).execute()

            if not result.data:
                return jsonify({'error': 'Quest not found in course'}), 404

            logger.info(f"Quest {quest_id} updated in course {course_id}: {updates}")

            return jsonify({
                'success': True,
                'course_quest': result.data[0]
            }), 200

        except Exception as e:
            logger.error(f"Error updating quest in course {course_id}: {str(e)}")
            return jsonify({'error': str(e)}), 500


    @bp.route('/<course_id>/projects/<quest_id>', methods=['PUT'])
    @require_auth
    def update_project_details(user_id, course_id: str, quest_id: str):
        """
        Update a project's title and description.
        Accessible to course creator, org_admin, advisor, and superadmin.

        Path params:
            course_id: Course UUID
            quest_id: Quest UUID (project)

        Body:
            title (str, optional): New project title
            description (str, optional): New project description
        """
        try:
            user_id = session_manager.get_effective_user_id()
            client = get_supabase_admin_client()

            # Check permissions
            course_result = client.table('courses').select('created_by, organization_id').eq('id', course_id).execute()
            if not course_result.data:
                return jsonify({'error': 'Course not found'}), 404

            course = course_result.data[0]
            user_result = client.table('users').select('organization_id, role, org_role').eq('id', user_id).execute()
            if not user_result.data:
                return jsonify({'error': 'User not found'}), 404

            user_data = user_result.data[0]
            effective_role = get_effective_role(user_data)

            is_creator = course['created_by'] == user_id
            has_admin_role = effective_role in ['superadmin', 'org_admin', 'advisor']
            is_admin = has_admin_role and (effective_role == 'superadmin' or user_data['organization_id'] == course['organization_id'])

            if not (is_creator or is_admin):
                return jsonify({'error': 'Insufficient permissions'}), 403

            # Verify quest is in this course
            course_quest = client.table('course_quests').select('id').eq('course_id', course_id).eq('quest_id', quest_id).execute()
            if not course_quest.data:
                return jsonify({'error': 'Project not found in this course'}), 404

            data = request.json
            if not data:
                return jsonify({'error': 'No data provided'}), 400

            updates = {}
            if 'title' in data:
                updates['title'] = data['title'].strip()
            if 'description' in data:
                updates['description'] = data['description'].strip()
                updates['big_idea'] = data['description'].strip()  # Keep big_idea in sync
            if 'header_image_url' in data:
                # Allow null/empty to clear the image
                header_url = data['header_image_url']
                updates['header_image_url'] = header_url.strip() if header_url else None

            if not updates:
                return jsonify({'error': 'No valid fields to update'}), 400

            # Use retry logic for transient connection issues
            import time as time_module  # Import at function scope

            max_retries = 3
            last_error = None
            for attempt in range(max_retries):
                try:
                    update_result = client.table('quests').update(updates).eq('id', quest_id).execute()
                    logger.info(f"Project {quest_id} updated in course {course_id}")
                    return jsonify({'success': True}), 200
                except Exception as update_error:
                    last_error = update_error
                    error_str = str(update_error)

                    # Log detailed error information
                    logger.warning(f"Project update attempt {attempt + 1}/{max_retries} failed for quest {quest_id}")
                    logger.warning(f"Error type: {type(update_error).__name__}")
                    logger.warning(f"Error message: {error_str}")

                    # Log exception attributes if available (Supabase errors have extra info)
                    if hasattr(update_error, 'message'):
                        logger.warning(f"Error.message: {update_error.message}")
                    if hasattr(update_error, 'code'):
                        logger.warning(f"Error.code: {update_error.code}")
                    if hasattr(update_error, 'details'):
                        logger.warning(f"Error.details: {update_error.details}")

                    # Check if this is the unusual "Route not found" error
                    if 'Route' in error_str and 'not found' in error_str:
                        logger.error(f"Unusual PostgREST error detected. This may indicate a Supabase configuration issue.")
                        logger.error(f"Quest ID: {quest_id}, Update data keys: {list(updates.keys())}")
                        logger.error(f"This error typically indicates the Supabase REST API received an unexpected request format.")

                    if attempt < max_retries - 1:
                        time_module.sleep(0.5 * (attempt + 1))  # Exponential backoff

            # All retries failed
            logger.error(f"All {max_retries} project update attempts failed for quest {quest_id}")
            return jsonify({'error': f'Database update failed after {max_retries} attempts: {str(last_error)}'}), 500

        except Exception as e:
            logger.error(f"Error updating project in course {course_id}: {str(e)}")
            return jsonify({'error': str(e)}), 500


    @bp.route('/<course_id>/quests/reorder', methods=['PUT'])
    @require_auth
    def reorder_course_quests(user_id, course_id: str):
        """
        Reorder quests in a course.

        Path params:
            course_id: Course UUID

        Required body:
            - quest_order: Array of quest IDs in desired order
        """
        try:
            user_id = session_manager.get_effective_user_id()
            client = get_supabase_admin_client()  # Use admin client to bypass RLS

            # Check permissions
            course_result = client.table('courses').select('created_by, organization_id').eq('id', course_id).execute()
            if not course_result.data:
                return jsonify({'error': 'Course not found'}), 404

            course = course_result.data[0]
            user_result = client.table('users').select('organization_id, role, org_role').eq('id', user_id).execute()
            if not user_result.data:
                return jsonify({'error': 'User not found'}), 404

            user_data = user_result.data[0]
            effective_role = get_effective_role(user_data)

            is_creator = course['created_by'] == user_id
            has_admin_role = effective_role in ['superadmin', 'org_admin', 'advisor']
            is_admin = has_admin_role and (effective_role == 'superadmin' or user_data['organization_id'] == course['organization_id'])

            if not (is_creator or is_admin):
                return jsonify({'error': 'Insufficient permissions'}), 403

            data = request.json
            if not data or not data.get('quest_order'):
                return jsonify({'error': 'quest_order is required'}), 400

            quest_order = data['quest_order']
            if not isinstance(quest_order, list):
                return jsonify({'error': 'quest_order must be an array'}), 400

            # Phase 1: Set all to temporary negative values to avoid unique constraint conflicts
            for idx, quest_id in enumerate(quest_order):
                client.table('course_quests').update({
                    'sequence_order': -(idx + 1000)  # Use large negative to avoid any collision
                }).eq('course_id', course_id).eq('quest_id', quest_id).execute()

            # Phase 2: Set to final values
            updated_quests = []
            for idx, quest_id in enumerate(quest_order):
                result = client.table('course_quests').update({
                    'sequence_order': idx
                }).eq('course_id', course_id).eq('quest_id', quest_id).execute()

                if result.data:
                    updated_quests.append(result.data[0])

            logger.info(f"Reordered {len(updated_quests)} quests in course {course_id}")

            return jsonify({
                'success': True,
                'course_quests': updated_quests
            }), 200

        except Exception as e:
            logger.error(f"Error reordering quests in course {course_id}: {str(e)}")
            return jsonify({'error': str(e)}), 500

