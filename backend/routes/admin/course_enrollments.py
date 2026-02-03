"""
Course Enrollment Management Routes

Admin routes for managing course enrollments.
Supports bulk enrollment/unenrollment for both superadmins and org_admins.

Endpoints:
    GET  /<course_id>/enrollable-users  - Get users eligible for enrollment
    POST /<course_id>/bulk-enroll       - Bulk enroll multiple users
    GET  /<course_id>/enrollments       - Get enrolled users with progress
    POST /<course_id>/bulk-unenroll     - Bulk unenroll users
    GET  /user-enrollments              - Get all enrollments for a specific user
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_org_admin, validate_uuid_param
from services.course_enrollment_service import CourseEnrollmentService
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('course_enrollments', __name__, url_prefix='/api/admin/courses')


@bp.route('/<course_id>/enrollable-users', methods=['GET'])
@require_org_admin
@validate_uuid_param('course_id')
def get_enrollable_users(current_user_id, current_org_id, is_superadmin, course_id):
    """
    Get users eligible for enrollment in a course.

    For superadmin: Returns platform users (organization_id IS NULL)
    For org_admin: Returns their organization's users only

    Query params:
        - search (str): Search by email, first_name, last_name
        - page (int): Page number (default 1)
        - per_page (int): Users per page (default 25, max 50)
        - role (str): Filter by role

    Returns:
        200: List of users with enrollment status
        403: Access denied
        404: Course not found
    """
    try:
        client = get_supabase_admin_client()

        # Verify course exists and check access
        course_result = client.table('courses').select('id, organization_id').eq('id', course_id).execute()
        if not course_result.data:
            return jsonify({'error': 'Course not found'}), 404

        course = course_result.data[0]
        course_org_id = course.get('organization_id')

        # Check course access
        if not is_superadmin:
            if course_org_id and course_org_id != current_org_id:
                return jsonify({'error': 'Access denied'}), 403

            # For Optio courses, verify they're available to this org
            if not course_org_id:
                org_result = client.table('organizations')\
                    .select('course_visibility_policy')\
                    .eq('id', current_org_id)\
                    .single()\
                    .execute()

                if org_result.data:
                    policy = org_result.data.get('course_visibility_policy', 'all_optio')
                    if policy == 'private_only':
                        return jsonify({'error': 'Optio courses are not available for your organization'}), 403
                    elif policy == 'curated':
                        curated_result = client.table('organization_course_access')\
                            .select('id')\
                            .eq('organization_id', current_org_id)\
                            .eq('course_id', course_id)\
                            .execute()
                        if not curated_result.data:
                            return jsonify({'error': 'This course is not available for your organization'}), 403

        # Parse query params
        search = request.args.get('search', '')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 25))
        role = request.args.get('role')

        service = CourseEnrollmentService(client)
        result = service.get_enrollable_users(
            course_id=course_id,
            organization_id=current_org_id,
            is_superadmin=is_superadmin,
            page=page,
            per_page=per_page,
            search=search if search else None,
            role=role
        )

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error getting enrollable users for course {course_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<course_id>/bulk-enroll', methods=['POST'])
@require_org_admin
@validate_uuid_param('course_id')
def bulk_enroll_users(current_user_id, current_org_id, is_superadmin, course_id):
    """
    Bulk enroll multiple users in a course.

    Authorization:
        - Superadmin: Can enroll any platform user
        - Org_admin: Can enroll their org's users in org courses or available Optio courses

    Request body:
        {
            "user_ids": ["uuid1", "uuid2", ...]  // max 50
        }

    Returns:
        200: Enrollment results
        400: Validation error
        403: Access denied
        404: Course not found
    """
    try:
        client = get_supabase_admin_client()

        # Verify course exists and check access
        course_result = client.table('courses').select('id, organization_id, title').eq('id', course_id).execute()
        if not course_result.data:
            return jsonify({'error': 'Course not found'}), 404

        course = course_result.data[0]
        course_org_id = course.get('organization_id')

        # Check course access
        if not is_superadmin:
            # Org admins can access:
            # 1. Their own organization's courses
            # 2. Optio courses (no org_id) that are available based on visibility policy
            if course_org_id and course_org_id != current_org_id:
                return jsonify({'error': 'Access denied'}), 403

            # For Optio courses, verify they're available to this org
            if not course_org_id:
                # Get org visibility policy
                org_result = client.table('organizations')\
                    .select('course_visibility_policy')\
                    .eq('id', current_org_id)\
                    .single()\
                    .execute()

                if not org_result.data:
                    return jsonify({'error': 'Organization not found'}), 404

                policy = org_result.data.get('course_visibility_policy', 'all_optio')

                if policy == 'private_only':
                    return jsonify({'error': 'Optio courses are not available for your organization'}), 403
                elif policy == 'curated':
                    # Check if course is in curated list
                    curated_result = client.table('organization_course_access')\
                        .select('id')\
                        .eq('organization_id', current_org_id)\
                        .eq('course_id', course_id)\
                        .execute()
                    if not curated_result.data:
                        return jsonify({'error': 'This course is not available for your organization'}), 403

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        user_ids = data.get('user_ids', [])
        if not user_ids:
            return jsonify({'error': 'user_ids is required'}), 400

        if len(user_ids) > 50:
            return jsonify({'error': 'Maximum 50 users per bulk enrollment'}), 400

        # Verify all users belong to the correct pool
        if not is_superadmin:
            # Org admin: verify users are in their organization
            users_result = client.table('users')\
                .select('id')\
                .in_('id', user_ids)\
                .eq('organization_id', current_org_id)\
                .execute()

            valid_user_ids = set(u['id'] for u in (users_result.data or []))
            invalid_users = [uid for uid in user_ids if uid not in valid_user_ids]

            if invalid_users:
                return jsonify({
                    'error': f'{len(invalid_users)} users are not in your organization',
                    'invalid_user_ids': invalid_users
                }), 400
        else:
            # Superadmin: verify users are platform users (no organization)
            users_result = client.table('users')\
                .select('id')\
                .in_('id', user_ids)\
                .is_('organization_id', 'null')\
                .neq('role', 'superadmin')\
                .execute()

            valid_user_ids = set(u['id'] for u in (users_result.data or []))
            invalid_users = [uid for uid in user_ids if uid not in valid_user_ids]

            if invalid_users:
                return jsonify({
                    'error': f'{len(invalid_users)} users are not platform users or are superadmins',
                    'invalid_user_ids': invalid_users
                }), 400

        # Perform bulk enrollment
        service = CourseEnrollmentService(client)
        result = service.bulk_enroll(user_ids, course_id)

        logger.info(f"User {current_user_id} bulk enrolled {result['enrolled']} users in course {course_id}")

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error bulk enrolling users in course {course_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<course_id>/enrollments', methods=['GET'])
@require_org_admin
@validate_uuid_param('course_id')
def get_course_enrollments(current_user_id, current_org_id, is_superadmin, course_id):
    """
    Get all enrollments for a course with progress data.

    Authorization:
        - Superadmin: Can view any course
        - Org_admin: Can view their org's courses or available Optio courses

    Query params:
        - search (str): Search by user email/name
        - status (str): Filter by enrollment status (active/completed)
        - page (int): Page number (default 1)
        - per_page (int): Enrollments per page (default 25, max 50)

    Returns:
        200: List of enrollments with user data and progress
        403: Access denied
        404: Course not found
    """
    try:
        client = get_supabase_admin_client()

        # Verify course exists and check access
        course_result = client.table('courses').select('id, organization_id, title').eq('id', course_id).execute()
        if not course_result.data:
            return jsonify({'error': 'Course not found'}), 404

        course = course_result.data[0]
        course_org_id = course.get('organization_id')

        # Check course access
        if not is_superadmin:
            if course_org_id and course_org_id != current_org_id:
                return jsonify({'error': 'Access denied'}), 403

            # For Optio courses, verify they're available to this org
            if not course_org_id:
                org_result = client.table('organizations')\
                    .select('course_visibility_policy')\
                    .eq('id', current_org_id)\
                    .single()\
                    .execute()

                if org_result.data:
                    policy = org_result.data.get('course_visibility_policy', 'all_optio')
                    if policy == 'private_only':
                        return jsonify({'error': 'Optio courses are not available for your organization'}), 403
                    elif policy == 'curated':
                        curated_result = client.table('organization_course_access')\
                            .select('id')\
                            .eq('organization_id', current_org_id)\
                            .eq('course_id', course_id)\
                            .execute()
                        if not curated_result.data:
                            return jsonify({'error': 'This course is not available for your organization'}), 403

        # Parse query params
        search = request.args.get('search', '')
        status = request.args.get('status')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 25))

        service = CourseEnrollmentService(client)
        result = service.get_enrollments_with_progress(
            course_id=course_id,
            page=page,
            per_page=per_page,
            search=search if search else None,
            status=status
        )

        # Add course info to response
        result['course'] = {
            'id': course['id'],
            'title': course.get('title')
        }

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error getting enrollments for course {course_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<course_id>/bulk-unenroll', methods=['POST'])
@require_org_admin
@validate_uuid_param('course_id')
def bulk_unenroll_users(current_user_id, current_org_id, is_superadmin, course_id):
    """
    Bulk unenroll multiple users from a course.

    This will:
    1. Delete course_enrollments records
    2. Deactivate all user_quests records for quests in this course
    3. Delete user_quest_tasks for those quests

    Authorization:
        - Superadmin: Can unenroll any user
        - Org_admin: Can unenroll their org's users from org or available Optio courses

    Request body:
        {
            "user_ids": ["uuid1", "uuid2", ...]
        }

    Returns:
        200: Unenrollment results
        400: Validation error
        403: Access denied
        404: Course not found
    """
    try:
        client = get_supabase_admin_client()

        # Verify course exists and check access
        course_result = client.table('courses').select('id, organization_id').eq('id', course_id).execute()
        if not course_result.data:
            return jsonify({'error': 'Course not found'}), 404

        course = course_result.data[0]
        course_org_id = course.get('organization_id')

        # Check course access
        if not is_superadmin:
            if course_org_id and course_org_id != current_org_id:
                return jsonify({'error': 'Access denied'}), 403

            # For Optio courses, verify they're available to this org
            if not course_org_id:
                org_result = client.table('organizations')\
                    .select('course_visibility_policy')\
                    .eq('id', current_org_id)\
                    .single()\
                    .execute()

                if org_result.data:
                    policy = org_result.data.get('course_visibility_policy', 'all_optio')
                    if policy == 'private_only':
                        return jsonify({'error': 'Optio courses are not available for your organization'}), 403
                    elif policy == 'curated':
                        curated_result = client.table('organization_course_access')\
                            .select('id')\
                            .eq('organization_id', current_org_id)\
                            .eq('course_id', course_id)\
                            .execute()
                        if not curated_result.data:
                            return jsonify({'error': 'This course is not available for your organization'}), 403

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        user_ids = data.get('user_ids', [])
        if not user_ids:
            return jsonify({'error': 'user_ids is required'}), 400

        # Verify users are actually enrolled before unenrolling
        enrolled_result = client.table('course_enrollments')\
            .select('user_id')\
            .eq('course_id', course_id)\
            .in_('user_id', user_ids)\
            .execute()

        enrolled_user_ids = [e['user_id'] for e in (enrolled_result.data or [])]

        if not enrolled_user_ids:
            return jsonify({
                'success': True,
                'unenrolled': 0,
                'failed': 0,
                'message': 'No users were enrolled in this course',
                'results': []
            }), 200

        # Perform bulk unenrollment
        service = CourseEnrollmentService(client)
        result = service.bulk_unenroll(enrolled_user_ids, course_id)

        logger.info(f"User {current_user_id} bulk unenrolled {result['unenrolled']} users from course {course_id}")

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error bulk unenrolling users from course {course_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/user-enrollments', methods=['GET'])
@require_org_admin
def get_user_enrollments(current_user_id, current_org_id, is_superadmin):
    """
    Get all course enrollments for a specific user.

    Authorization:
        - Superadmin: Can view any platform user's enrollments
        - Org_admin: Can view their org's users' enrollments only

    Query params:
        - user_id (str): Required - The user to get enrollments for

    Returns:
        200: List of course enrollments with course data
        400: Missing user_id
        403: Access denied
        404: User not found
    """
    try:
        client = get_supabase_admin_client()

        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify({'error': 'user_id query parameter is required'}), 400

        # Verify user exists and check access
        user_result = client.table('users').select('id, organization_id').eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user = user_result.data[0]
        user_org_id = user.get('organization_id')

        # Check user access
        if not is_superadmin:
            # Org admin can only view their org's users
            if user_org_id != current_org_id:
                return jsonify({'error': 'Access denied'}), 403
        else:
            # Superadmin can only view platform users (no organization)
            if user_org_id is not None:
                return jsonify({'error': 'This user belongs to an organization'}), 403

        # Get all enrollments for this user with course details
        enrollments_result = client.table('course_enrollments')\
            .select('id, course_id, status, enrolled_at, completed_at, courses(id, title, description, status, organization_id)')\
            .eq('user_id', user_id)\
            .execute()

        enrollments = []
        for enrollment in (enrollments_result.data or []):
            course = enrollment.get('courses', {})
            enrollments.append({
                'id': enrollment.get('id'),
                'course_id': enrollment.get('course_id'),
                'status': enrollment.get('status'),
                'enrolled_at': enrollment.get('enrolled_at'),
                'completed_at': enrollment.get('completed_at'),
                'course': {
                    'id': course.get('id'),
                    'title': course.get('title'),
                    'description': course.get('description'),
                    'status': course.get('status'),
                    'organization_id': course.get('organization_id')
                } if course else None
            })

        return jsonify({
            'enrollments': enrollments,
            'total': len(enrollments)
        }), 200

    except Exception as e:
        logger.error(f"Error getting enrollments for user {user_id}: {e}")
        return jsonify({'error': str(e)}), 500
