"""
Course Routes
API endpoints for course management, quest sequencing, and student enrollments.
"""

from datetime import datetime
from flask import Blueprint, request, jsonify
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

logger = get_logger(__name__)

bp = Blueprint('courses', __name__, url_prefix='/api/courses')


# ==================== Course CRUD ====================

@bp.route('/', methods=['GET'])
@bp.route('', methods=['GET'])
@require_auth
def list_courses(user_id):
    """
    List courses filtered by organization.

    Query params:
        - status: Filter by status (draft/published/archived)
        - created_by: Filter by creator ID
    """
    try:
        user_id = session_manager.get_effective_user_id()
        client = get_supabase_admin_client()  # Use admin client to bypass RLS

        # Get user's organization
        user_result = client.table('users').select('organization_id, role, org_role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_result.data[0]
        org_id = user_data['organization_id']
        user_role = get_effective_role(user_data)

        # Build query - include org courses AND public courses from other orgs
        # Use filter parameter to control:
        #   'org_only' - shows only org courses
        #   'admin_all' - shows all published courses + org drafts (for org admin visibility management)
        #   'all' (default) - shows org courses + public published courses from other orgs
        filter_mode = request.args.get('filter', 'all')

        if filter_mode == 'org_only':
            # Only show courses from user's organization
            if org_id:
                query = client.table('courses').select('*').eq('organization_id', org_id)
            else:
                # User has no org - show only public published courses
                query = client.table('courses').select('*').eq('visibility', 'public').eq('status', 'published')
        elif filter_mode == 'admin_all' and user_role in ['superadmin', 'org_admin', 'advisor']:
            # For org admins managing course availability - show all courses they could potentially access:
            # 1. All courses from their own org (any status)
            # 2. All published courses from other orgs (for toggling availability)
            if org_id:
                query = client.table('courses').select('*').or_(
                    f"organization_id.eq.{org_id},status.eq.published"
                )
            else:
                # Superadmin with no org - show all courses
                query = client.table('courses').select('*')
        else:
            # Show org courses + published public courses from other orgs + Optio global courses
            if org_id:
                # Include: org courses, Optio global courses (null org_id), and public published from other orgs
                query = client.table('courses').select('*').or_(
                    f"organization_id.eq.{org_id},organization_id.is.null,and(visibility.eq.public,status.eq.published)"
                )
            else:
                # User has no org - show Optio global courses + public published courses
                query = client.table('courses').select('*').or_(
                    "organization_id.is.null,and(visibility.eq.public,status.eq.published)"
                )

        if request.args.get('status'):
            query = query.eq('status', request.args.get('status'))
        if request.args.get('created_by'):
            query = query.eq('created_by', request.args.get('created_by'))

        result = query.order('created_at', desc=True).execute()

        # Get quest counts for each course
        courses = result.data if result.data else []
        if courses:
            course_ids = [c['id'] for c in courses]
            # Get counts from course_quests table (only published quests)
            quest_counts = client.table('course_quests').select('course_id, is_published').in_('course_id', course_ids).execute()

            # Count only published quests per course
            count_map = {}
            for cq in (quest_counts.data or []):
                if cq.get('is_published') is False:
                    continue  # Skip unpublished quests
                cid = cq['course_id']
                count_map[cid] = count_map.get(cid, 0) + 1

            # Get enrollment status for current user
            enrollments = client.table('course_enrollments').select('course_id, status').eq(
                'user_id', user_id
            ).in_('course_id', course_ids).execute()
            enrollment_map = {e['course_id']: e for e in (enrollments.data or [])}

            # Get progress for enrolled courses using CourseProgressService
            progress_service = CourseProgressService(client)

            courses_to_check = list(set(e['course_id'] for e in (enrollments.data or [])))
            for course in courses:
                if course['created_by'] == user_id and course['id'] not in courses_to_check:
                    courses_to_check.append(course['id'])

            progress_results = progress_service.calculate_bulk_progress(user_id, courses_to_check)
            progress_map = {
                cid: {
                    'earned_xp': progress.earned_xp,
                    'total_xp': progress.total_xp,
                    'percentage': progress.percentage,
                    'is_completed': progress.is_completed
                }
                for cid, progress in progress_results.items()
            }

            # Add quest_count, is_enrolled, is_external, and progress to each course
            for course in courses:
                course['quest_count'] = count_map.get(course['id'], 0)
                # Creator is always considered enrolled
                course['is_enrolled'] = course['id'] in enrollment_map or course['created_by'] == user_id
                # Mark courses from other organizations as external
                course['is_external'] = course.get('organization_id') != org_id
                if course['id'] in progress_map:
                    course['progress'] = progress_map[course['id']]

        return jsonify({
            'success': True,
            'courses': courses,
            'count': len(courses)
        }), 200

    except Exception as e:
        logger.error(f"Error listing courses: {str(e)}")
        return jsonify({'error': str(e)}), 500


@bp.route('/', methods=['POST'])
@bp.route('', methods=['POST'])
@require_auth
def create_course(user_id):
    """
    Create a new course.

    Required fields:
        - title: Course title

    Optional fields:
        - description: Course description
        - intro_content: JSONB intro content
        - cover_image_url: Cover image URL
        - visibility: organization/public/private (default: organization)
        - navigation_mode: sequential/freeform (default: sequential)
    """
    try:
        user_id = session_manager.get_effective_user_id()
        client = get_supabase_admin_client()  # Use admin client to bypass RLS

        # Check user role (admin, org_admin, or advisor)
        user_result = client.table('users').select('organization_id, role, org_role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_result.data[0]
        effective_role = get_effective_role(user_data)
        logger.info(f"[CREATE_COURSE] User {user_id}: role={user_data.get('role')}, org_role={user_data.get('org_role')}, effective_role={effective_role}")
        if effective_role not in ['superadmin', 'org_admin', 'advisor']:
            logger.warning(f"[CREATE_COURSE] Permission denied for user {user_id}: effective_role={effective_role}")
            return jsonify({'error': 'Insufficient permissions. Must be org_admin or advisor.'}), 403

        data = request.json
        if not data or not data.get('title'):
            return jsonify({'error': 'Title is required'}), 400

        course_data = {
            'title': data['title'],
            'organization_id': user_data['organization_id'],
            'created_by': user_id,
            'description': data.get('description'),
            'intro_content': data.get('intro_content', {}),
            'cover_image_url': data.get('cover_image_url'),
            'visibility': data.get('visibility', 'organization'),
            'navigation_mode': data.get('navigation_mode', 'sequential'),
            'status': 'draft'
        }

        result = client.table('courses').insert(course_data).execute()
        if not result.data:
            return jsonify({'error': 'Failed to create course'}), 500

        logger.info(f"Course created: {result.data[0]['id']} by {user_id}")

        return jsonify({
            'success': True,
            'course': result.data[0]
        }), 201

    except Exception as e:
        logger.error(f"Error creating course: {str(e)}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<course_id>', methods=['GET'])
@require_auth
def get_course(user_id, course_id: str):
    """
    Get course details with quests.

    Path params:
        course_id: Course UUID
    """
    try:
        client = get_supabase_admin_client()  # Use admin client to bypass RLS

        # Get course
        course_result = client.table('courses').select('*').eq('id', course_id).execute()
        if not course_result.data:
            return jsonify({'error': 'Course not found'}), 404

        course = course_result.data[0]

        # Get course quests with quest details
        quests_result = client.table('course_quests').select(
            'id, sequence_order, custom_title, intro_content, is_required, quests(*)'
        ).eq('course_id', course_id).order('sequence_order').execute()

        course['quests'] = quests_result.data if quests_result.data else []

        return jsonify({
            'success': True,
            'course': course
        }), 200

    except Exception as e:
        logger.error(f"Error getting course {course_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<course_id>', methods=['PUT'])
@require_auth
def update_course(user_id, course_id: str):
    """
    Update course details.

    Path params:
        course_id: Course UUID

    Allowed updates:
        - title, description, intro_content, cover_image_url
        - visibility, navigation_mode, status
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

        # Must be creator or admin/org_admin/advisor in same org
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
        allowed_fields = ['title', 'description', 'intro_content', 'cover_image_url', 'visibility', 'navigation_mode', 'status']
        for field in allowed_fields:
            if field in data:
                updates[field] = data[field]

        if not updates:
            return jsonify({'error': 'No valid fields to update'}), 400

        result = client.table('courses').update(updates).eq('id', course_id).execute()
        if not result.data:
            return jsonify({'error': 'Failed to update course'}), 500

        updated_course = result.data[0]
        logger.info(f"Course updated: {course_id} by {user_id}")

        # Sync badge if title or description was updated and course has a badge
        if ('title' in updates or 'description' in updates) and updated_course.get('badge_id'):
            try:
                badge_result = client.table('badges').select('id, badge_type').eq('id', updated_course['badge_id']).execute()
                if badge_result.data and badge_result.data[0].get('badge_type') == 'course_completion':
                    badge_updates = {}
                    if 'title' in updates:
                        badge_updates['name'] = f"{updates['title']} Completion"
                    if 'description' in updates:
                        badge_updates['description'] = f"Complete the {updates.get('title', updated_course['title'])} course"

                    if badge_updates:
                        client.table('badges').update(badge_updates).eq('id', updated_course['badge_id']).execute()
                        logger.info(f"Badge synced for course {course_id}")
            except Exception as badge_err:
                # Log but don't fail the request
                logger.warning(f"Failed to sync badge for course {course_id}: {str(badge_err)}")

        return jsonify({
            'success': True,
            'course': updated_course
        }), 200

    except Exception as e:
        logger.error(f"Error updating course {course_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<course_id>/cover-image', methods=['POST'])
@require_auth
def upload_course_cover_image(user_id, course_id: str):
    """
    Upload a cover image for a course.

    Path params:
        course_id: Course UUID

    Form data:
        - image: Image file (jpg, jpeg, png, gif, webp)
    """
    try:
        user_id = session_manager.get_effective_user_id()
        client = get_supabase_admin_client()
        upload_service = FileUploadService(client)

        # Check course exists and user has permission
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

        if 'image' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Read file data and extract metadata
        file_data = file.read()
        filename = file.filename
        content_type = file.content_type or 'application/octet-stream'

        result = upload_service.upload_course_cover(
            file_data=file_data,
            filename=filename,
            content_type=content_type,
            course_id=course_id
        )

        if not result.success:
            return jsonify({'error': result.error_message}), 400

        # Update course with new cover image URL
        client.table('courses').update({'cover_image_url': result.url}).eq('id', course_id).execute()

        logger.info(f"Cover image uploaded for course {course_id}: {result.url}")

        return jsonify({
            'success': True,
            'url': result.url
        }), 200

    except Exception as e:
        logger.error(f"Error uploading cover image for course {course_id}: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@bp.route('/<course_id>', methods=['DELETE'])
@require_auth
def delete_course(user_id, course_id: str):
    """
    Delete a course.

    Path params:
        course_id: Course UUID

    Body (optional):
        delete_quests: bool - If true, also delete the associated quests/projects

    Note: This cascades to delete course_quests and course_enrollments.
    """
    try:
        user_id = session_manager.get_effective_user_id()
        client = get_supabase_admin_client()

        # Get optional body parameter
        data = request.get_json(silent=True) or {}
        delete_quests = data.get('delete_quests', False)

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

        # Must be creator or admin/org_admin/advisor in same org
        is_creator = course['created_by'] == user_id
        has_admin_role = effective_role in ['superadmin', 'org_admin', 'advisor']
        is_admin = has_admin_role and (effective_role == 'superadmin' or user_data['organization_id'] == course['organization_id'])

        if not (is_creator or is_admin):
            return jsonify({'error': 'Insufficient permissions'}), 403

        # End user quest enrollments BEFORE deleting (to prevent orphans)
        # We need to do this before cascade deletes course_quests and course_enrollments
        course_quests = client.table('course_quests')\
            .select('quest_id')\
            .eq('course_id', course_id)\
            .execute()

        quest_ids = [cq['quest_id'] for cq in (course_quests.data or [])]

        enrollments = client.table('course_enrollments')\
            .select('user_id')\
            .eq('course_id', course_id)\
            .execute()

        user_ids = [e['user_id'] for e in (enrollments.data or [])]

        # End all user quest enrollments for this course's quests
        now = datetime.utcnow().isoformat()
        quests_ended = 0

        if quest_ids and user_ids:
            for quest_id in quest_ids:
                result = client.table('user_quests')\
                    .update({
                        'is_active': False,
                        'completed_at': now,
                        'last_set_down_at': now
                    })\
                    .in_('user_id', user_ids)\
                    .eq('quest_id', quest_id)\
                    .eq('is_active', True)\
                    .execute()
                quests_ended += len(result.data or [])

            logger.info(f"Ended {quests_ended} user quest enrollments before deleting course {course_id}")

        # Delete the course (cascade will handle course_quests and course_enrollments)
        client.table('courses').delete().eq('id', course_id).execute()

        logger.info(f"Course deleted: {course_id} by {user_id}")

        # Optionally delete the associated quests/projects
        quests_deleted = 0
        quests_skipped = 0
        if delete_quests and quest_ids:
            for quest_id in quest_ids:
                try:
                    # Check if this quest is used in any other courses
                    # (course_quests for this course were already cascade-deleted)
                    other_courses = client.table('course_quests')\
                        .select('course_id')\
                        .eq('quest_id', quest_id)\
                        .execute()

                    if other_courses.data:
                        # Quest is used in other courses, skip deletion
                        logger.info(f"Quest {quest_id} is used in {len(other_courses.data)} other course(s), skipping deletion")
                        quests_skipped += 1
                        continue

                    # Delete lessons first (cascade should handle tasks)
                    client.table('curriculum_lessons').delete().eq('quest_id', quest_id).execute()
                    # Delete user_quest_tasks for this quest
                    client.table('user_quest_tasks').delete().eq('quest_id', quest_id).execute()
                    # Delete the quest
                    client.table('quests').delete().eq('id', quest_id).execute()
                    quests_deleted += 1
                except Exception as quest_error:
                    logger.warning(f"Failed to delete quest {quest_id}: {str(quest_error)}")

            logger.info(f"Deleted {quests_deleted} quests along with course {course_id} (skipped {quests_skipped} shared quests)")

        message = 'Course deleted successfully'
        if delete_quests:
            if quests_deleted > 0 and quests_skipped > 0:
                message = f'Course deleted. {quests_deleted} project(s) deleted, {quests_skipped} skipped (used in other courses).'
            elif quests_deleted > 0:
                message = f'Course and {quests_deleted} project(s) deleted successfully.'
            elif quests_skipped > 0:
                message = f'Course deleted. {quests_skipped} project(s) were not deleted as they are used in other courses.'

        return jsonify({
            'success': True,
            'message': message,
            'quests_deleted': quests_deleted if delete_quests else 0,
            'quests_skipped': quests_skipped if delete_quests else 0
        }), 200

    except Exception as e:
        logger.error(f"Error deleting course {course_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


# ==================== Publishing ====================

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
        admin_client = get_supabase_admin_client()

        # Check permissions
        course_result = admin_client.table('courses').select('*').eq('id', course_id).execute()
        if not course_result.data:
            return jsonify({'error': 'Course not found'}), 404

        course = course_result.data[0]
        user_result = admin_client.table('users').select('organization_id, role, org_role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_result.data[0]
        effective_role = get_effective_role(user_data)

        # Must be creator or admin/org_admin/advisor in same org
        is_creator = course['created_by'] == user_id
        has_admin_role = effective_role in ['superadmin', 'org_admin', 'advisor']
        is_admin = has_admin_role and (effective_role == 'superadmin' or user_data['organization_id'] == course['organization_id'])

        if not (is_creator or is_admin):
            return jsonify({'error': 'Insufficient permissions'}), 403

        data = request.json or {}
        badge_id = course.get('badge_id')

        # Create badge if requested
        if data.get('create_badge') and not badge_id:
            badge_data = {
                'name': data.get('badge_name', f"{course['title']} Completion"),
                'description': data.get('badge_description', f"Complete the {course['title']} course"),
                'badge_type': 'course_completion',
                'pillar_primary': 'none',
                'min_quests': 0,
                'min_xp': 0,
                'min_tasks': 0,
                'image_url': course.get('cover_image_url'),
                'organization_id': course['organization_id']
            }
            badge_result = admin_client.table('badges').insert(badge_data).execute()
            if badge_result.data:
                badge_id = badge_result.data[0]['id']
                logger.info(f"Created course completion badge: {badge_id}")

        # Update course status
        updates = {'status': 'published'}
        if badge_id:
            updates['badge_id'] = badge_id

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


# ==================== Quest Management ====================

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
                'is_required': item.get('is_required', True),
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
        - is_required: Boolean (default: true)
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
            'is_required': data.get('is_required', True)
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

        if not updates:
            return jsonify({'error': 'No valid fields to update'}), 400

        client.table('quests').update(updates).eq('id', quest_id).execute()

        logger.info(f"Project {quest_id} updated in course {course_id}")

        return jsonify({'success': True}), 200

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


# ==================== Enrollment ====================

@bp.route('/<course_id>/enroll', methods=['POST'])
@require_auth
def enroll_in_course(user_id, course_id: str):
    """
    Enroll a student in a course.
    Auto-enrolls the student in all quests associated with the course,
    skipping the AI personalization wizard.

    Path params:
        course_id: Course UUID

    Optional body:
        - user_id: User to enroll (admin/teacher only, defaults to self)
    """
    try:
        current_user_id = session_manager.get_effective_user_id()
        client = get_supabase_admin_client()  # Use admin client to bypass RLS

        # Get course
        course_result = client.table('courses').select('*').eq('id', course_id).execute()
        if not course_result.data:
            return jsonify({'error': 'Course not found'}), 404

        course = course_result.data[0]

        # Determine who to enroll
        data = request.json or {}
        target_user_id = data.get('user_id', current_user_id)

        # Check permissions if enrolling someone else
        if target_user_id != current_user_id:
            user_result = client.table('users').select('organization_id, role, org_role').eq('id', current_user_id).execute()
            if not user_result.data:
                return jsonify({'error': 'User not found'}), 404

            user_data = user_result.data[0]
            effective_role = get_effective_role(user_data)
            if effective_role not in ['superadmin', 'org_admin', 'advisor']:
                return jsonify({'error': 'Insufficient permissions'}), 403

        # Check if already enrolled
        existing = client.table('course_enrollments').select('*').eq(
            'course_id', course_id
        ).eq('user_id', target_user_id).execute()

        # Get all quests for the course (ordered by sequence)
        course_quests = client.table('course_quests').select('quest_id').eq(
            'course_id', course_id
        ).order('sequence_order').execute()

        first_quest_id = course_quests.data[0]['quest_id'] if course_quests.data else None

        if existing.data:
            existing_enrollment = existing.data[0]
            # If already active, return early
            if existing_enrollment.get('status') == 'active':
                return jsonify({
                    'success': True,
                    'enrollment': existing_enrollment,
                    'message': 'Already enrolled'
                }), 200

            # Reactivate completed enrollment
            logger.info(f"Reactivating completed course enrollment for user {target_user_id} in course {course_id}")
            client.table('course_enrollments').update({
                'status': 'active',
                'completed_at': None
            }).eq('id', existing_enrollment['id']).execute()

            # Re-fetch the updated enrollment
            result = client.table('course_enrollments').select('*').eq(
                'id', existing_enrollment['id']
            ).execute()
        else:
            # Create new course enrollment
            enrollment_data = {
                'course_id': course_id,
                'user_id': target_user_id,
                'status': 'active',
                'current_quest_id': first_quest_id
            }

            result = client.table('course_enrollments').insert(enrollment_data).execute()

        if not result.data:
            return jsonify({'error': 'Failed to enroll'}), 500

        # Auto-enroll in all course quests (skip AI personalization)
        quest_enrollments_created = 0
        if course_quests.data:
            for course_quest in course_quests.data:
                quest_id = course_quest['quest_id']

                # Check if already enrolled in this quest
                existing_quest_enrollment = client.table('user_quests').select('id, is_active').eq(
                    'user_id', target_user_id
                ).eq('quest_id', quest_id).execute()

                if existing_quest_enrollment.data:
                    existing_quest = existing_quest_enrollment.data[0]
                    # If inactive, reactivate it for the course
                    if not existing_quest.get('is_active'):
                        client.table('user_quests').update({
                            'is_active': True,
                            'completed_at': None,
                            'last_picked_up_at': datetime.utcnow().isoformat()
                        }).eq('id', existing_quest['id']).execute()
                        logger.info(f"Reactivated quest enrollment {existing_quest['id']} for course enrollment")
                        quest_enrollments_created += 1
                    # Already enrolled and active, skip
                    continue

                # Create quest enrollment with personalization_completed=True (skip wizard)
                quest_enrollment_data = {
                    'user_id': target_user_id,
                    'quest_id': quest_id,
                    'status': 'picked_up',
                    'is_active': True,
                    'times_picked_up': 1,
                    'last_picked_up_at': datetime.utcnow().isoformat(),
                    'started_at': datetime.utcnow().isoformat(),
                    'personalization_completed': True  # Skip AI personalization for course quests
                }

                try:
                    quest_result = client.table('user_quests').insert(quest_enrollment_data).execute()
                    if quest_result.data:
                        quest_enrollments_created += 1
                        user_quest_id = quest_result.data[0]['id']
                        logger.info(f"Auto-enrolled user {target_user_id} in quest {quest_id} (course enrollment)")

                        # Copy lesson-linked tasks to user_quest_tasks
                        try:
                            # Get all task IDs linked to lessons for this quest
                            linked_tasks_result = client.table('curriculum_lesson_tasks')\
                                .select('task_id')\
                                .eq('quest_id', quest_id)\
                                .execute()

                            logger.info(f"[COURSE ENROLL] Quest {quest_id[:8]}: Found {len(linked_tasks_result.data or [])} linked tasks in curriculum_lesson_tasks")

                            if not linked_tasks_result.data:
                                logger.info(f"[COURSE ENROLL] Quest {quest_id[:8]}: No tasks linked to lessons - skipping task copy")
                            else:
                                task_ids = list(set([lt['task_id'] for lt in linked_tasks_result.data]))
                                logger.info(f"[COURSE ENROLL] Quest {quest_id[:8]}: Task IDs to check: {task_ids[:3]}...")

                                # Check for existing tasks with same source_task_id (avoid duplicates)
                                existing_tasks = client.table('user_quest_tasks')\
                                    .select('source_task_id')\
                                    .eq('user_id', target_user_id)\
                                    .eq('quest_id', quest_id)\
                                    .in_('source_task_id', task_ids)\
                                    .execute()
                                existing_source_ids = set(t['source_task_id'] for t in (existing_tasks.data or []) if t.get('source_task_id'))

                                # Filter out tasks that already exist
                                task_ids_to_copy = [tid for tid in task_ids if tid not in existing_source_ids]

                                if task_ids_to_copy:
                                    # Fetch the source task data
                                    source_tasks_result = client.table('user_quest_tasks')\
                                        .select('id, title, description, pillar, xp_value, order_index, is_required, diploma_subjects, subject_xp_distribution')\
                                        .in_('id', task_ids_to_copy)\
                                        .execute()

                                    if source_tasks_result.data:
                                        tasks_to_insert = []
                                        for task in source_tasks_result.data:
                                            tasks_to_insert.append({
                                                'user_id': target_user_id,
                                                'quest_id': quest_id,
                                                'user_quest_id': user_quest_id,
                                                'title': task['title'],
                                                'description': task.get('description', ''),
                                                'pillar': task['pillar'],
                                                'xp_value': task.get('xp_value', 100),
                                                'order_index': task.get('order_index', 0),
                                                'is_required': task.get('is_required', True),
                                                'is_manual': False,
                                                'approval_status': 'approved',
                                                'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                                                'subject_xp_distribution': task.get('subject_xp_distribution'),
                                                'source_task_id': task['id']
                                            })

                                        if tasks_to_insert:
                                            client.table('user_quest_tasks').insert(tasks_to_insert).execute()
                                            logger.info(f"Copied {len(tasks_to_insert)} lesson-linked tasks for user {target_user_id} in quest {quest_id}")
                        except Exception as task_err:
                            logger.warning(f"Failed to copy tasks for quest {quest_id}: {task_err}")
                except Exception as quest_err:
                    logger.warning(f"Failed to auto-enroll in quest {quest_id}: {quest_err}")

        logger.info(f"User {target_user_id} enrolled in course {course_id}, auto-enrolled in {quest_enrollments_created} quests")

        return jsonify({
            'success': True,
            'enrollment': result.data[0],
            'quests_enrolled': quest_enrollments_created
        }), 201

    except Exception as e:
        logger.error(f"Error enrolling in course {course_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<course_id>/unenroll', methods=['POST'])
@require_auth
def unenroll_from_course(user_id, course_id: str):
    """
    Unenroll from a course and all related quests.

    This will:
    1. Delete the course_enrollments record
    2. Deactivate all user_quests records for quests in this course
    3. Optionally delete user_quest_tasks for those quests
    """
    try:
        current_user_id = session_manager.get_effective_user_id()
        client = get_supabase_admin_client()

        # Get course quests first
        course_quests = client.table('course_quests')\
            .select('quest_id')\
            .eq('course_id', course_id)\
            .execute()

        quest_ids = [cq['quest_id'] for cq in (course_quests.data or [])]

        # Delete course enrollment
        client.table('course_enrollments')\
            .delete()\
            .eq('course_id', course_id)\
            .eq('user_id', current_user_id)\
            .execute()

        logger.info(f"Deleted course enrollment for user {current_user_id} from course {course_id}")

        # Deactivate quest enrollments and delete tasks
        quests_unenrolled = 0
        tasks_deleted = 0

        for quest_id in quest_ids:
            # Get user_quest record
            user_quest = client.table('user_quests')\
                .select('id')\
                .eq('user_id', current_user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            if user_quest.data:
                user_quest_id = user_quest.data[0]['id']

                # Delete user_quest_tasks for this enrollment
                deleted_tasks = client.table('user_quest_tasks')\
                    .delete()\
                    .eq('user_quest_id', user_quest_id)\
                    .execute()
                tasks_deleted += len(deleted_tasks.data or [])

                # Delete the user_quest record
                client.table('user_quests')\
                    .delete()\
                    .eq('id', user_quest_id)\
                    .execute()
                quests_unenrolled += 1

        logger.info(f"User {current_user_id} unenrolled from course {course_id}: {quests_unenrolled} quests, {tasks_deleted} tasks deleted")

        return jsonify({
            'success': True,
            'quests_unenrolled': quests_unenrolled,
            'tasks_deleted': tasks_deleted
        })

    except Exception as e:
        logger.error(f"Error unenrolling from course {course_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<course_id>/end', methods=['POST'])
@require_auth
def end_course(user_id, course_id: str):
    """
    End a course enrollment and all related quests.

    Unlike unenroll, this preserves all progress, tasks, and XP.
    It marks the course and quests as completed rather than deleting them.

    This will:
    1. Update course_enrollments to status='completed' with completed_at timestamp
    2. Mark all user_quests for this course as is_active=False with completed_at timestamp
    """
    try:
        current_user_id = session_manager.get_effective_user_id()
        client = get_supabase_admin_client()

        # Verify enrollment exists
        enrollment = client.table('course_enrollments')\
            .select('id, status')\
            .eq('course_id', course_id)\
            .eq('user_id', current_user_id)\
            .execute()

        if not enrollment.data:
            return jsonify({'error': 'Not enrolled in this course'}), 404

        # Check if already completed
        if enrollment.data[0].get('status') == 'completed':
            return jsonify({
                'success': True,
                'message': 'Course already completed',
                'already_completed': True
            })

        # Get course quests
        course_quests = client.table('course_quests')\
            .select('quest_id')\
            .eq('course_id', course_id)\
            .execute()

        quest_ids = [cq['quest_id'] for cq in (course_quests.data or [])]

        # Mark course enrollment as completed
        now = datetime.utcnow().isoformat()
        client.table('course_enrollments')\
            .update({
                'status': 'completed',
                'completed_at': now
            })\
            .eq('course_id', course_id)\
            .eq('user_id', current_user_id)\
            .execute()

        logger.info(f"Marked course {course_id} as completed for user {current_user_id}")

        # End all quest enrollments (preserve progress)
        quests_ended = 0
        total_xp = 0

        for quest_id in quest_ids:
            # Get user_quest record
            user_quest = client.table('user_quests')\
                .select('id, is_active')\
                .eq('user_id', current_user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            if user_quest.data:
                user_quest_id = user_quest.data[0]['id']

                # Only update if still active
                if user_quest.data[0].get('is_active'):
                    client.table('user_quests')\
                        .update({
                            'is_active': False,
                            'completed_at': now,
                            'last_set_down_at': now
                        })\
                        .eq('id', user_quest_id)\
                        .execute()
                    quests_ended += 1

                # Calculate XP earned for this quest
                completed_tasks = client.table('quest_task_completions')\
                    .select('user_quest_task_id, user_quest_tasks!inner(xp_value)')\
                    .eq('user_id', current_user_id)\
                    .eq('quest_id', quest_id)\
                    .execute()

                quest_xp = sum(
                    task.get('user_quest_tasks', {}).get('xp_value', 0)
                    for task in (completed_tasks.data or [])
                )
                total_xp += quest_xp

        logger.info(f"User {current_user_id} ended course {course_id}: {quests_ended} quests ended, {total_xp} total XP")

        return jsonify({
            'success': True,
            'message': f'Course completed! You finished {quests_ended} projects and earned {total_xp} XP.',
            'stats': {
                'quests_ended': quests_ended,
                'total_xp': total_xp
            }
        })

    except Exception as e:
        logger.error(f"Error ending course {course_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<course_id>/progress', methods=['GET'])
@require_auth
def get_course_progress(user_id, course_id: str):
    """
    Get student's progress in a course.

    Path params:
        course_id: Course UUID

    Query params:
        - user_id: User ID (admin/teacher only, defaults to self)
    """
    try:
        current_user_id = session_manager.get_effective_user_id()
        client = get_supabase_admin_client()  # Use admin client to bypass RLS

        # Determine whose progress to check
        target_user_id = request.args.get('user_id', current_user_id)

        # Check permissions if checking someone else's progress
        if target_user_id != current_user_id:
            user_result = client.table('users').select('organization_id, role, org_role').eq('id', current_user_id).execute()
            if not user_result.data:
                return jsonify({'error': 'User not found'}), 404

            user_data = user_result.data[0]
            effective_role = get_effective_role(user_data)
            if effective_role not in ['superadmin', 'org_admin', 'advisor']:
                return jsonify({'error': 'Insufficient permissions'}), 403

        # Get course to check creator status
        course_result = client.table('courses').select('created_by').eq('id', course_id).execute()
        if not course_result.data:
            return jsonify({'error': 'Course not found'}), 404

        course = course_result.data[0]
        is_creator = course['created_by'] == target_user_id

        # Get enrollment
        enrollment = client.table('course_enrollments').select('*').eq(
            'course_id', course_id
        ).eq('user_id', target_user_id).execute()

        # Creator is always considered enrolled, even without formal enrollment record
        if not enrollment.data and not is_creator:
            return jsonify({
                'success': True,
                'enrolled': False,
                'progress_percentage': 0,
                'quests_completed': 0,
                'quests_total': 0
            }), 200

        # Get all published course quests
        course_quests = client.table('course_quests').select('quest_id, is_required, is_published').eq(
            'course_id', course_id
        ).execute()

        # Only count published and required quests
        published_quests = [q for q in (course_quests.data or []) if q.get('is_published') is not False]
        total_quests = len([q for q in published_quests if q['is_required']])

        # Get completed quests (user_quests with completed_at set)
        if total_quests > 0:
            quest_ids = [q['quest_id'] for q in published_quests]
            completed = client.table('user_quests').select('quest_id').eq(
                'user_id', target_user_id
            ).in_('quest_id', quest_ids).not_.is_('completed_at', 'null').execute()

            completed_count = len(completed.data) if completed.data else 0
            progress_pct = int((completed_count / total_quests) * 100) if total_quests > 0 else 0
        else:
            completed_count = 0
            progress_pct = 0

        # Handle response for both formal enrollments and creators without enrollment
        enrollment_record = enrollment.data[0] if enrollment.data else None

        return jsonify({
            'success': True,
            'enrolled': True,
            'is_creator': is_creator,
            'status': enrollment_record['status'] if enrollment_record else ('active' if is_creator else None),
            'current_quest_id': enrollment_record.get('current_quest_id') if enrollment_record else None,
            'progress_percentage': progress_pct,
            'quests_completed': completed_count,
            'quests_total': total_quests,
            'enrolled_at': enrollment_record['enrolled_at'] if enrollment_record else None,
            'completed_at': enrollment_record.get('completed_at') if enrollment_record else None
        }), 200

    except Exception as e:
        logger.error(f"Error getting course progress for {course_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


# ==================== Course Homepage ====================

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
