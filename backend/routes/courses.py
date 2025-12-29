"""
Course Routes
API endpoints for course management, quest sequencing, and student enrollments.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth, require_admin
from database import get_user_client, get_supabase_admin_client
from utils.session_manager import session_manager
from middleware.error_handler import ValidationError
from repositories.base_repository import NotFoundError
from utils.logger import get_logger

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
        user_result = client.table('users').select('organization_id, role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        org_id = user_result.data[0]['organization_id']

        # Build query
        query = client.table('courses').select('*').eq('organization_id', org_id)

        if request.args.get('status'):
            query = query.eq('status', request.args.get('status'))
        if request.args.get('created_by'):
            query = query.eq('created_by', request.args.get('created_by'))

        result = query.order('created_at', desc=True).execute()

        return jsonify({
            'success': True,
            'courses': result.data if result.data else [],
            'count': len(result.data) if result.data else 0
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

        # Check user role (admin, org_admin, or teacher)
        user_result = client.table('users').select('organization_id, role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_result.data[0]
        if user_data['role'] not in ['admin', 'org_admin', 'teacher']:
            return jsonify({'error': 'Insufficient permissions. Must be admin or teacher.'}), 403

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
        - visibility, navigation_mode
    """
    try:
        user_id = session_manager.get_effective_user_id()
        client = get_supabase_admin_client()  # Use admin client to bypass RLS

        # Check permissions
        course_result = client.table('courses').select('created_by, organization_id').eq('id', course_id).execute()
        if not course_result.data:
            return jsonify({'error': 'Course not found'}), 404

        course = course_result.data[0]
        user_result = client.table('users').select('organization_id, role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_result.data[0]

        # Must be creator or admin
        is_creator = course['created_by'] == user_id
        is_admin = user_data['role'] in ['admin', 'org_admin'] and user_data['organization_id'] == course['organization_id']

        if not (is_creator or is_admin):
            return jsonify({'error': 'Insufficient permissions'}), 403

        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # Build updates
        updates = {}
        allowed_fields = ['title', 'description', 'intro_content', 'cover_image_url', 'visibility', 'navigation_mode']
        for field in allowed_fields:
            if field in data:
                updates[field] = data[field]

        if not updates:
            return jsonify({'error': 'No valid fields to update'}), 400

        result = client.table('courses').update(updates).eq('id', course_id).execute()
        if not result.data:
            return jsonify({'error': 'Failed to update course'}), 500

        logger.info(f"Course updated: {course_id} by {user_id}")

        return jsonify({
            'success': True,
            'course': result.data[0]
        }), 200

    except Exception as e:
        logger.error(f"Error updating course {course_id}: {str(e)}")
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
        user_result = admin_client.table('users').select('organization_id, role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_result.data[0]

        # Must be creator or admin
        is_creator = course['created_by'] == user_id
        is_admin = user_data['role'] in ['admin', 'org_admin'] and user_data['organization_id'] == course['organization_id']

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
        user_result = client.table('users').select('organization_id, role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_result.data[0]

        is_creator = course['created_by'] == user_id
        is_admin = user_data['role'] in ['admin', 'org_admin', 'teacher'] and user_data['organization_id'] == course['organization_id']

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
            sequence_order = (existing.data[0]['sequence_order'] + 1) if existing.data else 1

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
    """
    try:
        user_id = session_manager.get_effective_user_id()
        client = get_supabase_admin_client()  # Use admin client to bypass RLS

        # Check permissions
        course_result = client.table('courses').select('created_by, organization_id').eq('id', course_id).execute()
        if not course_result.data:
            return jsonify({'error': 'Course not found'}), 404

        course = course_result.data[0]
        user_result = client.table('users').select('organization_id, role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_result.data[0]

        is_creator = course['created_by'] == user_id
        is_admin = user_data['role'] in ['admin', 'org_admin', 'teacher'] and user_data['organization_id'] == course['organization_id']

        if not (is_creator or is_admin):
            return jsonify({'error': 'Insufficient permissions'}), 403

        result = client.table('course_quests').delete().eq(
            'course_id', course_id
        ).eq('quest_id', quest_id).execute()

        logger.info(f"Quest {quest_id} removed from course {course_id}")

        return jsonify({
            'success': True,
            'message': 'Quest removed from course'
        }), 200

    except Exception as e:
        logger.error(f"Error removing quest from course {course_id}: {str(e)}")
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
        user_result = client.table('users').select('organization_id, role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_result.data[0]

        is_creator = course['created_by'] == user_id
        is_admin = user_data['role'] in ['admin', 'org_admin', 'teacher'] and user_data['organization_id'] == course['organization_id']

        if not (is_creator or is_admin):
            return jsonify({'error': 'Insufficient permissions'}), 403

        data = request.json
        if not data or not data.get('quest_order'):
            return jsonify({'error': 'quest_order is required'}), 400

        quest_order = data['quest_order']
        if not isinstance(quest_order, list):
            return jsonify({'error': 'quest_order must be an array'}), 400

        updated_quests = []
        for idx, quest_id in enumerate(quest_order, start=1):
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
            user_result = client.table('users').select('organization_id, role').eq('id', current_user_id).execute()
            if not user_result.data:
                return jsonify({'error': 'User not found'}), 404

            user_data = user_result.data[0]
            if user_data['role'] not in ['admin', 'org_admin', 'teacher']:
                return jsonify({'error': 'Insufficient permissions'}), 403

        # Check if already enrolled
        existing = client.table('course_enrollments').select('*').eq(
            'course_id', course_id
        ).eq('user_id', target_user_id).execute()

        if existing.data:
            return jsonify({
                'success': True,
                'enrollment': existing.data[0],
                'message': 'Already enrolled'
            }), 200

        # Get first quest
        first_quest = client.table('course_quests').select('quest_id').eq(
            'course_id', course_id
        ).order('sequence_order').limit(1).execute()

        enrollment_data = {
            'course_id': course_id,
            'user_id': target_user_id,
            'status': 'active',
            'current_quest_id': first_quest.data[0]['quest_id'] if first_quest.data else None
        }

        result = client.table('course_enrollments').insert(enrollment_data).execute()
        if not result.data:
            return jsonify({'error': 'Failed to enroll'}), 500

        logger.info(f"User {target_user_id} enrolled in course {course_id}")

        return jsonify({
            'success': True,
            'enrollment': result.data[0]
        }), 201

    except Exception as e:
        logger.error(f"Error enrolling in course {course_id}: {str(e)}")
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
            user_result = client.table('users').select('organization_id, role').eq('id', current_user_id).execute()
            if not user_result.data:
                return jsonify({'error': 'User not found'}), 404

            user_data = user_result.data[0]
            if user_data['role'] not in ['admin', 'org_admin', 'teacher']:
                return jsonify({'error': 'Insufficient permissions'}), 403

        # Get enrollment
        enrollment = client.table('course_enrollments').select('*').eq(
            'course_id', course_id
        ).eq('user_id', target_user_id).execute()

        if not enrollment.data:
            return jsonify({
                'success': True,
                'enrolled': False,
                'progress_percentage': 0,
                'quests_completed': 0,
                'quests_total': 0
            }), 200

        # Get all course quests
        course_quests = client.table('course_quests').select('quest_id, is_required').eq(
            'course_id', course_id
        ).execute()

        total_quests = len([q for q in course_quests.data if q['is_required']]) if course_quests.data else 0

        # Get completed quests
        if total_quests > 0:
            quest_ids = [q['quest_id'] for q in course_quests.data]
            completed = client.table('user_quest_progress').select('quest_id').eq(
                'user_id', target_user_id
            ).in_('quest_id', quest_ids).eq('status', 'completed').execute()

            completed_count = len(completed.data) if completed.data else 0
            progress_pct = int((completed_count / total_quests) * 100) if total_quests > 0 else 0
        else:
            completed_count = 0
            progress_pct = 0

        return jsonify({
            'success': True,
            'enrolled': True,
            'status': enrollment.data[0]['status'],
            'current_quest_id': enrollment.data[0].get('current_quest_id'),
            'progress_percentage': progress_pct,
            'quests_completed': completed_count,
            'quests_total': total_quests,
            'enrolled_at': enrollment.data[0]['enrolled_at'],
            'completed_at': enrollment.data[0].get('completed_at')
        }), 200

    except Exception as e:
        logger.error(f"Error getting course progress for {course_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500
