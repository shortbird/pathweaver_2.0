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

        # Get quest counts for each course
        courses = result.data if result.data else []
        if courses:
            course_ids = [c['id'] for c in courses]
            # Get counts from course_quests table
            quest_counts = client.table('course_quests').select('course_id').in_('course_id', course_ids).execute()

            # Count quests per course
            count_map = {}
            for cq in (quest_counts.data or []):
                cid = cq['course_id']
                count_map[cid] = count_map.get(cid, 0) + 1

            # Add quest_count to each course
            for course in courses:
                course['quest_count'] = count_map.get(course['id'], 0)

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

        # Check user role (admin, org_admin, or teacher)
        user_result = client.table('users').select('organization_id, role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_result.data[0]
        if user_data['role'] not in ['superadmin', 'org_admin', 'advisor']:
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
        user_result = client.table('users').select('organization_id, role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_result.data[0]

        # Must be creator or admin
        is_creator = course['created_by'] == user_id
        is_admin = user_data['role'] in ['superadmin', 'org_admin'] and (user_data['role'] == 'superadmin' or user_data['organization_id'] == course['organization_id'])

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
    import uuid as uuid_module
    try:
        user_id = session_manager.get_effective_user_id()
        client = get_supabase_admin_client()

        # Check course exists and user has permission
        course_result = client.table('courses').select('created_by, organization_id').eq('id', course_id).execute()
        if not course_result.data:
            return jsonify({'error': 'Course not found'}), 404

        course = course_result.data[0]
        user_result = client.table('users').select('organization_id, role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_result.data[0]
        is_creator = course['created_by'] == user_id
        is_admin = user_data['role'] in ['superadmin', 'org_admin', 'advisor'] and (user_data['role'] == 'superadmin' or user_data['organization_id'] == course['organization_id'])

        if not (is_creator or is_admin):
            return jsonify({'error': 'Insufficient permissions'}), 403

        # Check if file was provided
        if 'image' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Validate file type
        allowed_extensions = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
        file_extension = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''

        if file_extension not in allowed_extensions:
            return jsonify({
                'error': f'Invalid file type. Allowed types: {", ".join(allowed_extensions)}'
            }), 400

        # Check file size (10MB max for cover images)
        file.seek(0, 2)
        file_size = file.tell()
        file.seek(0)

        max_size = 10 * 1024 * 1024  # 10MB
        if file_size > max_size:
            return jsonify({'error': 'File size exceeds 10MB limit'}), 400

        # Use existing quest-images bucket with courses prefix
        try:
            client.storage.create_bucket('quest-images', {'public': True})
        except:
            pass  # Bucket already exists

        # Generate unique filename with courses prefix
        unique_filename = f"courses/{course_id}/{uuid_module.uuid4()}.{file_extension}"

        # Read file content
        file_content = file.read()

        # Upload to Supabase Storage
        logger.info(f"Uploading file: {unique_filename}, size: {len(file_content)}, type: {file.content_type}")
        try:
            upload_result = client.storage.from_('quest-images').upload(
                path=unique_filename,
                file=file_content,
                file_options={"content-type": file.content_type or f"image/{file_extension}"}
            )
            logger.info(f"Upload result: {upload_result}")
        except Exception as upload_err:
            logger.error(f"Storage upload failed: {str(upload_err)}")
            return jsonify({'error': f'Storage upload failed: {str(upload_err)}'}), 500

        # Get public URL
        url = client.storage.from_('quest-images').get_public_url(unique_filename)

        # Update course with new cover image URL
        client.table('courses').update({'cover_image_url': url}).eq('id', course_id).execute()

        logger.info(f"Cover image uploaded for course {course_id}: {url}")

        return jsonify({
            'success': True,
            'url': url
        }), 200

    except Exception as e:
        import traceback
        logger.error(f"Error uploading cover image for course {course_id}: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<course_id>', methods=['DELETE'])
@require_auth
def delete_course(user_id, course_id: str):
    """
    Delete a course.

    Path params:
        course_id: Course UUID

    Note: This cascades to delete course_quests and course_enrollments.
    """
    try:
        user_id = session_manager.get_effective_user_id()
        client = get_supabase_admin_client()

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
        is_admin = user_data['role'] in ['superadmin', 'org_admin'] and (user_data['role'] == 'superadmin' or user_data['organization_id'] == course['organization_id'])

        if not (is_creator or is_admin):
            return jsonify({'error': 'Insufficient permissions'}), 403

        # Delete the course (cascade will handle course_quests and course_enrollments)
        client.table('courses').delete().eq('id', course_id).execute()

        logger.info(f"Course deleted: {course_id} by {user_id}")

        return jsonify({
            'success': True,
            'message': 'Course deleted successfully'
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
        user_result = admin_client.table('users').select('organization_id, role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_result.data[0]

        # Must be creator or admin
        is_creator = course['created_by'] == user_id
        is_admin = user_data['role'] in ['superadmin', 'org_admin'] and (user_data['role'] == 'superadmin' or user_data['organization_id'] == course['organization_id'])

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
            'id, sequence_order, custom_title, intro_content, is_required, xp_threshold, quest_id, quests(id, title, description, quest_type, header_image_url)'
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
        user_result = client.table('users').select('organization_id, role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_result.data[0]

        is_creator = course['created_by'] == user_id
        is_admin = user_data['role'] in ['superadmin', 'org_admin', 'advisor'] and (user_data['role'] == 'superadmin' or user_data['organization_id'] == course['organization_id'])

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
        is_admin = user_data['role'] in ['superadmin', 'org_admin', 'advisor'] and (user_data['role'] == 'superadmin' or user_data['organization_id'] == course['organization_id'])

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
        user_result = client.table('users').select('organization_id, role').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_result.data[0]

        is_creator = course['created_by'] == user_id
        is_admin = user_data['role'] in ['superadmin', 'org_admin', 'advisor'] and (user_data['role'] == 'superadmin' or user_data['organization_id'] == course['organization_id'])

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
        is_admin = user_data['role'] in ['superadmin', 'org_admin', 'advisor'] and (user_data['role'] == 'superadmin' or user_data['organization_id'] == course['organization_id'])

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
            if user_data['role'] not in ['superadmin', 'org_admin', 'advisor']:
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
            if user_data['role'] not in ['superadmin', 'org_admin', 'advisor']:
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
        client = get_supabase_admin_client()

        # Get course details
        course_result = client.table('courses').select('*').eq('id', course_id).execute()
        if not course_result.data:
            return jsonify({'error': 'Course not found'}), 404

        course = course_result.data[0]

        # Get course quests with quest details
        course_quests_result = client.table('course_quests').select(
            'quest_id, sequence_order, xp_threshold, custom_title, is_required, quests(id, title, description, header_image_url)'
        ).eq('course_id', course_id).order('sequence_order').execute()

        quests_with_data = []
        for cq in (course_quests_result.data or []):
            quest_data = cq.get('quests', {}) or {}
            quest_id = quest_data.get('id') or cq.get('quest_id')

            if not quest_id:
                continue

            # Get lessons for this quest
            lessons_result = client.table('curriculum_lessons')\
                .select('id, title, sequence_order, estimated_duration_minutes')\
                .eq('quest_id', quest_id)\
                .order('sequence_order')\
                .execute()

            lessons = lessons_result.data or []

            # Get user's quest enrollment
            user_quest_result = client.table('user_quests')\
                .select('id, is_active, completed_at, started_at')\
                .eq('user_id', current_user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            quest_enrollment = user_quest_result.data[0] if user_quest_result.data else None

            # Get task completion counts and XP
            completed_tasks = 0
            total_tasks = 0
            earned_xp = 0
            total_xp = 0

            if quest_enrollment:
                enrollment_id = quest_enrollment['id']

                # Get approved tasks for this enrollment with XP values
                user_tasks_result = client.table('user_quest_tasks')\
                    .select('id, xp_value')\
                    .eq('user_quest_id', enrollment_id)\
                    .eq('approval_status', 'approved')\
                    .execute()

                user_tasks = user_tasks_result.data or []
                total_tasks = len(user_tasks)
                total_xp = sum(t.get('xp_value', 0) or 0 for t in user_tasks)

                if total_tasks > 0:
                    task_ids = [t['id'] for t in user_tasks]
                    # Create a map of task_id -> xp_value for quick lookup
                    task_xp_map = {t['id']: t.get('xp_value', 0) or 0 for t in user_tasks}

                    completions_result = client.table('quest_task_completions')\
                        .select('user_quest_task_id')\
                        .eq('user_id', current_user_id)\
                        .in_('user_quest_task_id', task_ids)\
                        .execute()

                    completions = completions_result.data or []
                    completed_tasks = len(completions)
                    # Sum XP from completed tasks using the task's xp_value
                    earned_xp = sum(task_xp_map.get(c['user_quest_task_id'], 0) for c in completions)

            # Get lesson progress for this quest (non-blocking if table doesn't exist)
            lesson_progress_map = {}
            try:
                lesson_progress_result = client.table('curriculum_lesson_progress')\
                    .select('lesson_id, status, progress_percentage')\
                    .eq('user_id', current_user_id)\
                    .eq('quest_id', quest_id)\
                    .execute()

                for lp in (lesson_progress_result.data or []):
                    lesson_progress_map[lp['lesson_id']] = {
                        'status': lp['status'],
                        'progress_percentage': lp['progress_percentage']
                    }
            except Exception as progress_err:
                logger.warning(f"Could not fetch lesson progress: {progress_err}")

            # Add progress to each lesson
            for lesson in lessons:
                progress = lesson_progress_map.get(lesson['id'], {})
                lesson['progress'] = {
                    'status': progress.get('status', 'not_started'),
                    'percentage': progress.get('progress_percentage', 0)
                }

            quests_with_data.append({
                'id': quest_id,
                'title': cq.get('custom_title') or quest_data.get('title'),
                'description': quest_data.get('description'),
                'header_image_url': quest_data.get('header_image_url'),
                'sequence_order': cq.get('sequence_order', 0),
                'xp_threshold': cq.get('xp_threshold', 0),
                'is_required': cq.get('is_required', True),
                'lessons': lessons,
                'enrollment': quest_enrollment,
                'progress': {
                    'completed_tasks': completed_tasks,
                    'total_tasks': total_tasks,
                    'earned_xp': earned_xp,
                    'total_xp': total_xp,
                    'percentage': round((earned_xp / total_xp * 100), 1) if total_xp > 0 else 0,
                    'is_completed': (quest_enrollment.get('completed_at') is not None and not quest_enrollment.get('is_active')) if quest_enrollment else False
                }
            })

        # Get course enrollment status
        enrollment_result = client.table('course_enrollments')\
            .select('*')\
            .eq('course_id', course_id)\
            .eq('user_id', current_user_id)\
            .execute()

        enrollment = enrollment_result.data[0] if enrollment_result.data else None

        # Calculate overall course progress (XP-based)
        total_required_quests = len([q for q in quests_with_data if q.get('is_required', True)])
        completed_quests = len([q for q in quests_with_data if q['progress']['is_completed'] and q.get('is_required', True)])

        # Sum XP across all required quests
        course_earned_xp = sum(q['progress']['earned_xp'] for q in quests_with_data if q.get('is_required', True))
        course_total_xp = sum(q['progress']['total_xp'] for q in quests_with_data if q.get('is_required', True))
        course_progress = round((course_earned_xp / course_total_xp * 100), 1) if course_total_xp > 0 else 0

        return jsonify({
            'success': True,
            'course': {
                'id': course['id'],
                'title': course['title'],
                'description': course.get('description'),
                'cover_image_url': course.get('cover_image_url'),
                'navigation_mode': course.get('navigation_mode', 'sequential'),
                'status': course.get('status', 'draft')
            },
            'quests': quests_with_data,
            'enrollment': enrollment,
            'progress': {
                'completed_quests': completed_quests,
                'total_quests': total_required_quests,
                'earned_xp': course_earned_xp,
                'total_xp': course_total_xp,
                'percentage': course_progress
            }
        }), 200

    except Exception as e:
        import traceback
        logger.error(f"Error getting course homepage for {course_id}: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500
