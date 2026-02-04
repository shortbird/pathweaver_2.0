"""
Courses Module - Course CRUD

Course creation, retrieval, update, delete, and image uploads.
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

            # Generate slug from title
            base_slug = generate_slug(data['title'])
            slug = ensure_unique_slug(client, base_slug) if base_slug else None

            course_data = {
                'title': data['title'],
                'slug': slug,
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
            allowed_fields = [
                'title', 'description', 'intro_content', 'cover_image_url',
                'visibility', 'navigation_mode', 'status',
                # Showcase fields for public course pages
                'slug', 'learning_outcomes', 'final_deliverable',
                'educational_value', 'parent_guidance'
            ]
            for field in allowed_fields:
                if field in data:
                    updates[field] = data[field]

            # If slug is being updated, ensure uniqueness
            if 'slug' in updates and updates['slug']:
                base_slug = generate_slug(updates['slug'])
                updates['slug'] = ensure_unique_slug(client, base_slug, course_id)

            # Auto-generate slug if title changes and no slug exists
            if 'title' in updates:
                existing_course = client.table('courses').select('slug').eq('id', course_id).execute()
                if existing_course.data and not existing_course.data[0].get('slug'):
                    base_slug = generate_slug(updates['title'])
                    updates['slug'] = ensure_unique_slug(client, base_slug, course_id)

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


    @bp.route('/<course_id>/generate-showcase', methods=['POST'])
    @require_auth
    def generate_showcase_fields(user_id, course_id: str):
        """
        Generate showcase fields using AI based on course projects and lessons.

        Path params:
            course_id: Course UUID

        Returns:
            Generated showcase fields: learning_outcomes, final_deliverable,
            guidance_level, academic_alignment, age_range, estimated_hours
        """
        try:
            user_id = session_manager.get_effective_user_id()
            client = get_supabase_admin_client()

            # Check permissions
            course_result = client.table('courses').select('*').eq('id', course_id).execute()
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

            # Get projects (quests) for this course
            quests_result = client.table('course_quests').select(
                'quest_id, quests(id, title, description, quest_type)'
            ).eq('course_id', course_id).order('sequence_order').execute()

            projects = []
            quest_ids = []
            for cq in (quests_result.data or []):
                quest = cq.get('quests') or {}
                if quest:
                    projects.append(quest)
                    quest_ids.append(quest.get('id'))

            # Get lessons for all quests in this course
            lessons = []
            if quest_ids:
                lessons_result = client.table('curriculum_lessons').select(
                    'id, title, content, quest_id'
                ).in_('quest_id', quest_ids).order('sequence_order').execute()
                lessons = lessons_result.data or []

            # Check if we have enough content to generate
            if not projects:
                return jsonify({
                    'error': 'No projects found. Add at least one project to generate showcase fields.'
                }), 400

            # Generate showcase fields using AI
            from services.course_showcase_ai_service import CourseShowcaseAIService
            ai_service = CourseShowcaseAIService()

            result = ai_service.generate_showcase_fields(course, projects, lessons)

            if not result.get('success'):
                return jsonify({'error': 'AI generation failed'}), 500

            logger.info(f"Generated showcase fields for course {course_id}")

            return jsonify({
                'success': True,
                'showcase': result['showcase']
            }), 200

        except Exception as e:
            logger.error(f"Error generating showcase fields for course {course_id}: {str(e)}")
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


    @bp.route('/quests/<quest_id>/header-image', methods=['POST'])
    @require_auth
    def upload_quest_header_image(user_id, quest_id: str):
        """
        Upload a header image for a quest/project.

        Path params:
            quest_id: Quest UUID

        Form data:
            - image: Image file (jpg, jpeg, png, gif, webp)
        """
        try:
            user_id = session_manager.get_effective_user_id()
            client = get_supabase_admin_client()
            upload_service = FileUploadService(client)

            # Check quest exists and user has permission
            quest_result = client.table('quests').select('created_by, organization_id').eq('id', quest_id).execute()
            if not quest_result.data:
                return jsonify({'error': 'Quest not found'}), 404

            quest = quest_result.data[0]
            user_result = client.table('users').select('organization_id, role, org_role').eq('id', user_id).execute()
            if not user_result.data:
                return jsonify({'error': 'User not found'}), 404

            user_data = user_result.data[0]
            effective_role = get_effective_role(user_data)
            is_creator = quest['created_by'] == user_id
            has_admin_role = effective_role in ['superadmin', 'org_admin', 'advisor']
            is_admin = has_admin_role and (effective_role == 'superadmin' or user_data['organization_id'] == quest['organization_id'])

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

            result = upload_service.upload_quest_header(
                file_data=file_data,
                filename=filename,
                content_type=content_type,
                quest_id=quest_id
            )

            if not result.success:
                return jsonify({'error': result.error_message}), 400

            # Update quest with new header image URL
            # Use retry logic for transient connection issues
            import time as time_module  # Import at top of function scope

            update_data = {
                'header_image_url': result.url,
                'updated_at': datetime.utcnow().isoformat()
            }

            max_retries = 3
            last_error = None
            for attempt in range(max_retries):
                try:
                    update_result = client.table('quests').update(update_data).eq('id', quest_id).execute()
                    if update_result.data:
                        logger.info(f"Header image uploaded for quest {quest_id}: {result.url}")
                        break
                    else:
                        # Update succeeded but no data returned - this is OK for updates
                        logger.info(f"Header image uploaded for quest {quest_id}: {result.url} (no data returned)")
                        break
                except Exception as update_error:
                    last_error = update_error
                    error_str = str(update_error)

                    # Log detailed error information
                    logger.warning(f"Quest update attempt {attempt + 1}/{max_retries} failed for quest {quest_id}")
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
                        logger.error(f"Quest ID: {quest_id}, Update data: {update_data}")
                        logger.error(f"This error typically indicates the Supabase REST API received an unexpected request format.")

                    if attempt < max_retries - 1:
                        time_module.sleep(0.5 * (attempt + 1))  # Exponential backoff
                    else:
                        # All retries failed - return the uploaded URL anyway since storage succeeded
                        logger.error(f"All {max_retries} quest update attempts failed. Storage upload succeeded but DB update failed.")
                        # Return success with the URL - the image is uploaded, just not linked
                        return jsonify({
                            'success': True,
                            'url': result.url,
                            'warning': 'Image uploaded but database update failed. Please save the project to link the image.'
                        }), 200

            return jsonify({
                'success': True,
                'url': result.url
            }), 200

        except Exception as e:
            logger.error(f"Error uploading header image for quest {quest_id}: {str(e)}", exc_info=True)
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

