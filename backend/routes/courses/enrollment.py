"""
Courses Module - Enrollment

Student enrollment, unenrollment, and progress tracking.
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
                            logger.info(f"Auto-enrolled user {target_user_id} in quest {quest_id} (course enrollment)")

                            # Note: Tasks are NOT auto-copied. Students activate tasks manually
                            # by clicking on them in the lesson view. This gives students agency
                            # over which optional tasks they want to pursue.
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

        Completion requires ALL required projects to meet their completion criteria:
        - XP threshold met (if set)
        - ALL required tasks completed

        This will:
        1. Validate all projects meet completion requirements
        2. Update course_enrollments to status='completed' with completed_at timestamp
        3. Mark all user_quests for this course as is_active=False with completed_at timestamp
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

            # Get course quests (only published and required)
            course_quests = client.table('course_quests')\
                .select('quest_id, is_required, is_published, xp_threshold, quests(title)')\
                .eq('course_id', course_id)\
                .execute()

            # Filter to required, published quests
            required_quests = [
                cq for cq in (course_quests.data or [])
                if cq.get('is_required', True) and cq.get('is_published') is not False
            ]
            all_quest_ids = [cq['quest_id'] for cq in (course_quests.data or [])]

            # Check completion eligibility for all required quests
            # Allow force parameter to bypass the check (for admin use or testing)
            data = request.get_json(silent=True) or {}
            force_complete = data.get('force', False)

            incomplete_projects = []
            if not force_complete and required_quests:
                progress_service = CourseProgressService(client)

                for cq in required_quests:
                    quest_id = cq['quest_id']
                    quest_title = cq.get('quests', {}).get('title', 'Unknown Project')

                    eligibility = progress_service.check_quest_completion_eligibility(
                        current_user_id, quest_id, course_id
                    )

                    if not eligibility.get('can_complete'):
                        reasons = []
                        if not eligibility.get('xp_met'):
                            reasons.append(f"XP: {eligibility.get('earned_xp', 0)}/{eligibility.get('required_xp', 0)}")
                        if not eligibility.get('required_tasks_met'):
                            incomplete_count = eligibility.get('total_required', 0) - eligibility.get('completed_required', 0)
                            reasons.append(f"{incomplete_count} required task{'s' if incomplete_count != 1 else ''} incomplete")

                        incomplete_projects.append({
                            'quest_id': quest_id,
                            'title': quest_title,
                            'reasons': reasons,
                            'requirements': {
                                'xp_met': eligibility.get('xp_met', True),
                                'required_tasks_met': eligibility.get('required_tasks_met', True),
                                'earned_xp': eligibility.get('earned_xp', 0),
                                'required_xp': eligibility.get('required_xp', 0),
                                'completed_required_tasks': eligibility.get('completed_required', 0),
                                'total_required_tasks': eligibility.get('total_required', 0),
                                'incomplete_lessons': eligibility.get('incomplete_lessons', [])
                            }
                        })

            if incomplete_projects:
                project_names = [p['title'] for p in incomplete_projects]
                return jsonify({
                    'success': False,
                    'error': 'Cannot complete course yet',
                    'reason': 'INCOMPLETE_PROJECTS',
                    'message': f"{len(incomplete_projects)} project{'s' if len(incomplete_projects) != 1 else ''} not completed: {', '.join(project_names)}",
                    'incomplete_projects': incomplete_projects
                }), 400

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

            for quest_id in all_quest_ids:
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

