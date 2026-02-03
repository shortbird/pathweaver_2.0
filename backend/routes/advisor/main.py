"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Uses AdvisorService for all business logic (service layer pattern)
- Uses CheckinService for check-in functionality
- Service layer is the preferred pattern over direct repository usage
- Advisor-specific logic properly encapsulated in dedicated service

Advisor Routes - API endpoints for advisor functionality
Handles custom badge creation, student monitoring, and advisor-student management
"""

import sys
from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_role, require_advisor
from middleware.error_handler import ValidationError, NotFoundError
from services.advisor_service import AdvisorService
from services.quest_invitation_service import QuestInvitationService

from utils.logger import get_logger

logger = get_logger(__name__)

advisor_bp = Blueprint('advisor', __name__)

# ==================== Student Management ====================

@advisor_bp.route('/students', methods=['GET'])
@require_advisor
def get_students(user_id):
    """Get all students assigned to this advisor"""
    try:
        # Create service instance per-request
        advisor_service = AdvisorService()
        students = advisor_service.get_advisor_students(user_id)

        # Add last check-in date for each student
        from services.checkin_service import CheckinService
        checkin_service = CheckinService()

        for student in students:
            last_checkin_info = checkin_service.get_last_checkin_info(
                student['id'],
                advisor_id=user_id
            )
            student['last_checkin'] = last_checkin_info

        return jsonify({
            'success': True,
            'students': students,
            'count': len(students)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching students: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch students'
        }), 500


@advisor_bp.route('/students/<student_id>/assign', methods=['POST'])
@require_advisor
def assign_student(user_id, student_id):
    """Assign a student to this advisor"""
    try:
        advisor_service = AdvisorService()
        success = advisor_service.assign_student_to_advisor(student_id, user_id)
        return jsonify({
            'success': True,
            'message': 'Student assigned successfully'
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Error assigning student: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to assign student'
        }), 500


@advisor_bp.route('/students/<student_id>/progress', methods=['GET'])
@require_advisor
def get_student_progress(user_id, student_id):
    """Get comprehensive progress report for a student"""
    try:
        advisor_service = AdvisorService()
        report = advisor_service.get_student_progress_report(student_id, user_id)
        return jsonify({
            'success': True,
            'report': report
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 403
    except Exception as e:
        logger.error(f"Error fetching student progress: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch student progress'
        }), 500


# ==================== Custom Badge Management ====================

@advisor_bp.route('/badges', methods=['GET'])
@require_advisor
def get_custom_badges(user_id):
    """Get all custom badges created by this advisor"""
    try:
        advisor_service = AdvisorService()
        badges = advisor_service.get_advisor_custom_badges(user_id)
        return jsonify({
            'success': True,
            'badges': badges,
            'count': len(badges)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching custom badges: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch custom badges'
        }), 500


@advisor_bp.route('/badges', methods=['POST'])
@require_advisor
def create_custom_badge(user_id):
    """Create a new custom badge"""
    try:
        data = request.get_json()

        # Validate required fields
        required_fields = ['name', 'description', 'identity_statement', 'primary_pillar', 'min_quests', 'xp_requirement']
        for field in required_fields:
            if field not in data:
                raise ValidationError(f"Missing required field: {field}")

        # Validate pillar
        valid_pillars = [
            'STEM & Logic',
            'Life & Wellness',
            'Language & Communication',
            'Society & Culture',
            'Arts & Creativity'
        ]
        if data['primary_pillar'] not in valid_pillars:
            raise ValidationError(f"Invalid pillar. Must be one of: {', '.join(valid_pillars)}")

        # Validate numeric fields
        if not isinstance(data['min_quests'], int) or data['min_quests'] < 1:
            raise ValidationError("min_quests must be a positive integer")

        if not isinstance(data['xp_requirement'], int) or data['xp_requirement'] < 0:
            raise ValidationError("xp_requirement must be a non-negative integer")

        # Create badge
        advisor_service = AdvisorService()
        badge = advisor_service.create_custom_badge(
            advisor_id=user_id,
            name=data['name'],
            description=data['description'],
            identity_statement=data['identity_statement'],
            primary_pillar=data['primary_pillar'],
            min_quests=data['min_quests'],
            xp_requirement=data['xp_requirement'],
            icon=data.get('icon', '🎯'),
            color=data.get('color', '#6d469b'),
            is_public=data.get('is_public', False)
        )

        return jsonify({
            'success': True,
            'badge': badge,
            'message': 'Custom badge created successfully'
        }), 201

    except ValidationError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Error creating custom badge: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to create custom badge'
        }), 500


@advisor_bp.route('/badges/<badge_id>', methods=['PUT'])
@require_advisor
def update_custom_badge(user_id, badge_id):
    """Update a custom badge"""
    try:
        data = request.get_json()

        # Validate pillar if provided
        if 'primary_pillar' in data:
            valid_pillars = [
                'STEM & Logic',
                'Life & Wellness',
                'Language & Communication',
                'Society & Culture',
                'Arts & Creativity'
            ]
            if data['primary_pillar'] not in valid_pillars:
                raise ValidationError(f"Invalid pillar. Must be one of: {', '.join(valid_pillars)}")

        # Validate numeric fields if provided
        if 'min_quests' in data:
            if not isinstance(data['min_quests'], int) or data['min_quests'] < 1:
                raise ValidationError("min_quests must be a positive integer")

        if 'xp_requirement' in data:
            if not isinstance(data['xp_requirement'], int) or data['xp_requirement'] < 0:
                raise ValidationError("xp_requirement must be a non-negative integer")

        # Update badge
        advisor_service = AdvisorService()
        badge = advisor_service.update_custom_badge(badge_id, user_id, data)

        return jsonify({
            'success': True,
            'badge': badge,
            'message': 'Badge updated successfully'
        }), 200

    except ValidationError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 403
    except Exception as e:
        logger.error(f"Error updating custom badge: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update badge'
        }), 500


@advisor_bp.route('/badges/<badge_id>', methods=['DELETE'])
@require_advisor
def delete_custom_badge(user_id, badge_id):
    """Delete a custom badge"""
    try:
        advisor_service = AdvisorService()
        success = advisor_service.delete_custom_badge(badge_id, user_id)
        return jsonify({
            'success': True,
            'message': 'Badge deleted successfully'
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 403
    except Exception as e:
        logger.error(f"Error deleting custom badge: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to delete badge'
        }), 500


# ==================== Badge Assignment ====================

@advisor_bp.route('/badges/<badge_id>/assign', methods=['POST'])
@require_advisor
def assign_badge(user_id, badge_id):
    """Assign a badge to a student"""
    try:
        data = request.get_json()

        if 'student_id' not in data:
            raise ValidationError("Missing required field: student_id")

        advisor_service = AdvisorService()
        result = advisor_service.assign_badge_to_student(
            badge_id=badge_id,
            student_id=data['student_id'],
            advisor_id=user_id
        )

        return jsonify({
            'success': True,
            'user_badge': result,
            'message': 'Badge assigned to student successfully'
        }), 201

    except ValidationError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Error assigning badge: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to assign badge'
        }), 500


# ==================== Advisor Dashboard Stats ====================

@advisor_bp.route('/dashboard', methods=['GET'])
@require_advisor
def get_advisor_dashboard(user_id):
    """Get advisor dashboard summary statistics"""
    try:
        advisor_service = AdvisorService()
        students = advisor_service.get_advisor_students(user_id)
        custom_badges = advisor_service.get_advisor_custom_badges(user_id)

        # Calculate stats
        total_students = len(students)
        active_students = len([s for s in students if s.get('last_active')])
        total_custom_badges = len(custom_badges)

        # Get total quests completed by all students
        total_quests_completed = sum(s.get('quest_count', 0) for s in students)

        return jsonify({
            'success': True,
            'stats': {
                'total_students': total_students,
                'active_students': active_students,
                'total_custom_badges': total_custom_badges,
                'total_quests_completed': total_quests_completed
            },
            'recent_students': students[:5],  # Top 5 recent students
            'recent_badges': custom_badges[:5]  # Top 5 recent custom badges
        }), 200

    except Exception as e:
        logger.error(f"Error fetching advisor dashboard: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch dashboard data'
        }), 500

# ==================== Task Management ====================

@advisor_bp.route('/students/<student_id>/quests-with-tasks', methods=['GET'])
@require_advisor
def get_student_quests_with_tasks(user_id, student_id):
    """Get all active quests for a student with their tasks - for task management interface"""
    try:
        advisor_service = AdvisorService()

        # Get quests with tasks
        quests = advisor_service.get_student_active_quests_with_tasks(
            student_id=student_id,
            advisor_id=user_id
        )

        return jsonify({
            'success': True,
            'quests': quests,
            'count': len(quests)
        }), 200

    except ValueError as e:
        # Permission error
        return jsonify({
            'success': False,
            'error': str(e)
        }), 403

    except Exception as e:
        logger.error(f"Error fetching student quests with tasks: {str(e)}")
        import traceback
        return jsonify({
            'success': False,
            'error': 'Failed to fetch student quests'
        }), 500


# ==================== Quest Invitations ====================

@advisor_bp.route('/invitable-quests', methods=['GET'])
@require_role('advisor', 'org_admin', 'superadmin')
def get_invitable_quests(user_id):
    """
    Get quests that this advisor can invite students to.
    Returns:
    - Advisor's own created quests (even if inactive/private)
    - Public active quests visible to their organization
    - Superadmins can see quests from all organizations
    """
    try:
        from database import get_supabase_admin_client
        admin = get_supabase_admin_client()

        # Get advisor's role and organization
        user_response = admin.table('users')\
            .select('organization_id, role')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user_response.data:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404

        org_id = user_response.data.get('organization_id')
        is_superadmin = user_response.data.get('role') == 'superadmin'

        # Get advisor's own created quests (any status)
        my_quests_query = admin.table('quests')\
            .select('id, title, description, big_idea, header_image_url, is_active, is_public, created_by, organization_id, created_at')\
            .eq('created_by', user_id)\
            .order('created_at', desc=True)

        my_quests_response = my_quests_query.execute()
        my_quests = my_quests_response.data or []

        # Mark these as "my_quest" for frontend grouping
        for quest in my_quests:
            quest['is_my_quest'] = True

        # Get public active quests visible to the organization
        library_query = admin.table('quests')\
            .select('id, title, description, big_idea, header_image_url, is_active, is_public, created_by, organization_id, created_at')\
            .eq('is_active', True)\
            .eq('is_public', True)\
            .neq('created_by', user_id)  # Exclude advisor's own quests (already in my_quests)

        # Superadmins can see all quests from all organizations
        if not is_superadmin:
            # Filter by organization visibility for regular advisors
            if org_id:
                # Global quests (no org) + organization's quests
                library_query = library_query.or_(f'organization_id.is.null,organization_id.eq.{org_id}')
            else:
                # No organization - only global quests
                library_query = library_query.is_('organization_id', 'null')

        library_query = library_query.order('created_at', desc=True).limit(100)
        library_response = library_query.execute()
        library_quests = library_response.data or []

        # Mark these as library quests
        for quest in library_quests:
            quest['is_my_quest'] = False

        return jsonify({
            'success': True,
            'my_quests': my_quests,
            'library_quests': library_quests,
            'total': len(my_quests) + len(library_quests)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching invitable quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch quests'
        }), 500


@advisor_bp.route('/invite-to-quest', methods=['POST'])
@require_role('advisor', 'org_admin', 'superadmin')
def invite_students_to_quest(user_id):
    """Invite students to a specific quest"""
    try:
        data = request.get_json()

        # Validate required fields
        if 'quest_id' not in data:
            raise ValidationError("Missing required field: quest_id")

        if 'user_ids' not in data or not isinstance(data['user_ids'], list):
            raise ValidationError("Missing or invalid field: user_ids (must be array)")

        if len(data['user_ids']) == 0:
            raise ValidationError("user_ids array cannot be empty")

        # Create invitations
        invitation_service = QuestInvitationService()
        result = invitation_service.invite_students_to_quest(
            advisor_id=user_id,
            quest_id=data['quest_id'],
            user_ids=data['user_ids'],
            expires_at=data.get('expires_at')
        )

        return jsonify({
            'success': True,
            'invitations_created': result['invitations_created'],
            'invitations': result['invitations']
        }), 201

    except ValidationError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except NotFoundError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Error inviting students to quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to create invitations'
        }), 500


@advisor_bp.route('/quest-invitations', methods=['GET'])
@require_role('advisor', 'org_admin', 'superadmin')
def get_quest_invitations(user_id):
    """Get all quest invitations for advisor's organization"""
    try:
        status = request.args.get('status')
        quest_id = request.args.get('quest_id')

        invitation_service = QuestInvitationService()
        invitations = invitation_service.get_organization_invitations(
            advisor_id=user_id,
            status=status,
            quest_id=quest_id
        )

        return jsonify({
            'success': True,
            'invitations': invitations,
            'count': len(invitations)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching quest invitations: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch invitations'
        }), 500


# ==================== Course Enrollment ====================

@advisor_bp.route('/enrollable-courses', methods=['GET'])
@require_role('advisor', 'org_admin', 'superadmin')
def get_enrollable_courses(user_id):
    """
    Get published courses that this advisor can enroll students in.
    Returns:
    - Published courses from advisor's organization
    - Public published courses from other organizations
    - Superadmins can see all published courses
    """
    try:
        from database import get_supabase_admin_client
        admin = get_supabase_admin_client()

        # Get advisor's role and organization
        user_response = admin.table('users')\
            .select('organization_id, role')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user_response.data:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404

        org_id = user_response.data.get('organization_id')
        is_superadmin = user_response.data.get('role') == 'superadmin'

        # Build query for published courses
        query = admin.table('courses')\
            .select('id, title, description, cover_image_url, status, visibility, organization_id, created_at')\
            .eq('status', 'published')

        if is_superadmin:
            # Superadmin can see all published courses
            pass
        elif org_id:
            # Org advisor: org courses + public courses + global courses (null org_id)
            query = query.or_(f'organization_id.eq.{org_id},visibility.eq.public,organization_id.is.null')
        else:
            # No org: only global and public courses
            query = query.or_('organization_id.is.null,visibility.eq.public')

        query = query.order('created_at', desc=True).limit(100)
        courses_response = query.execute()
        courses = courses_response.data or []

        # Get quest counts for each course
        if courses:
            course_ids = [c['id'] for c in courses]
            quest_counts = admin.table('course_quests')\
                .select('course_id, is_published')\
                .in_('course_id', course_ids)\
                .execute()

            # Count only published quests per course
            count_map = {}
            for cq in (quest_counts.data or []):
                if cq.get('is_published') is False:
                    continue
                cid = cq['course_id']
                count_map[cid] = count_map.get(cid, 0) + 1

            for course in courses:
                course['quest_count'] = count_map.get(course['id'], 0)
                course['is_org_course'] = course.get('organization_id') == org_id

        return jsonify({
            'success': True,
            'courses': courses,
            'total': len(courses)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching enrollable courses: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch courses'
        }), 500


@advisor_bp.route('/enroll-in-course', methods=['POST'])
@require_role('advisor', 'org_admin', 'superadmin')
def enroll_students_in_course(user_id):
    """
    Enroll multiple students in a published course.
    This directly enrolls students (no invitation flow needed).
    """
    try:
        data = request.get_json()

        # Validate required fields
        if 'course_id' not in data:
            raise ValidationError("Missing required field: course_id")

        if 'user_ids' not in data or not isinstance(data['user_ids'], list):
            raise ValidationError("Missing or invalid field: user_ids (must be array)")

        if len(data['user_ids']) == 0:
            raise ValidationError("user_ids array cannot be empty")

        if len(data['user_ids']) > 50:
            raise ValidationError("Maximum 50 students per enrollment request")

        from database import get_supabase_admin_client
        admin = get_supabase_admin_client()

        # Verify course exists and is published
        course_response = admin.table('courses')\
            .select('id, title, status, organization_id')\
            .eq('id', data['course_id'])\
            .single()\
            .execute()

        if not course_response.data:
            return jsonify({
                'success': False,
                'error': 'Course not found'
            }), 404

        course = course_response.data
        if course['status'] != 'published':
            return jsonify({
                'success': False,
                'error': 'Can only enroll students in published courses'
            }), 400

        # Get advisor's organization
        user_response = admin.table('users')\
            .select('organization_id, role')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user_response.data:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404

        advisor_org = user_response.data.get('organization_id')
        is_superadmin = user_response.data.get('role') == 'superadmin'

        # Verify students are in advisor's organization (unless superadmin)
        if not is_superadmin:
            students_response = admin.table('users')\
                .select('id, organization_id')\
                .in_('id', data['user_ids'])\
                .execute()

            if not students_response.data:
                return jsonify({
                    'success': False,
                    'error': 'No valid students found'
                }), 400

            # Check all students are in advisor's org
            for student in students_response.data:
                if student['organization_id'] != advisor_org:
                    return jsonify({
                        'success': False,
                        'error': 'Can only enroll students from your organization'
                    }), 403

        # Use CourseEnrollmentService for bulk enrollment
        from services.course_enrollment_service import CourseEnrollmentService
        enrollment_service = CourseEnrollmentService(admin)
        result = enrollment_service.bulk_enroll(data['user_ids'], data['course_id'])

        return jsonify({
            'success': True,
            'course_title': course['title'],
            'enrolled': result['enrolled'],
            'skipped': result['skipped'],
            'failed': result['failed'],
            'results': result['results']
        }), 201

    except ValidationError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Error enrolling students in course: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to enroll students'
        }), 500
