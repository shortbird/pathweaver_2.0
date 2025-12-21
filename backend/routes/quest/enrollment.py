"""
Quest Enrollment API endpoints.
Handles quest enrollment, re-enrollment, and user quest creation.

Part of the quests.py refactoring (P2-ARCH-1).
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
from database import get_supabase_admin_client
from repositories.quest_repository import QuestRepository, QuestTaskRepository
from repositories.base_repository import NotFoundError, DatabaseError
from utils.auth.decorators import require_auth
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('quest_enrollment', __name__, url_prefix='/api/quests')


@bp.route('/<quest_id>/enroll', methods=['POST'])
@require_auth
def enroll_in_quest(user_id: str, quest_id: str):
    """
    Enroll a user in a quest.
    Creates a user_quests record to track progress.

    Body (optional):
    - load_previous_tasks: boolean - If true, copies tasks from previous enrollment
    - force_new: boolean - If true, creates new enrollment even if previously completed
    """
    try:
        data = request.get_json() or {}
        load_previous_tasks = data.get('load_previous_tasks', False)
        force_new = data.get('force_new', False)
        # Use admin client for reading quest data (public info, no RLS restrictions)
        quest_repo = QuestRepository()

        # Check if quest exists and is active using repository
        quest = quest_repo.find_by_id(quest_id)

        if not quest:
            return jsonify({
                'success': False,
                'error': 'Quest not found'
            }), 404

        if not quest.get('is_active'):
            return jsonify({
                'success': False,
                'error': 'Quest is not active'
            }), 400

        # Check if already enrolled using repository client
        existing = quest_repo.client.table('user_quests')\
            .select('id, is_active, completed_at, personalization_completed')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        # Check if there's an active (in-progress) enrollment
        if existing.data:
            has_completed_enrollment = False
            most_recent_completed_enrollment = None

            for enrollment in existing.data:
                # If there's an active enrollment that's NOT completed, return it (allow personalization)
                if enrollment.get('is_active') and not enrollment.get('completed_at'):
                    return jsonify({
                        'success': True,
                        'message': f'Already enrolled in "{quest.get("title")}"',
                        'enrollment': enrollment,
                        'already_enrolled': True
                    })
                # Check if user has completed this quest before
                if enrollment.get('completed_at'):
                    has_completed_enrollment = True
                    # Track the most recent completed enrollment
                    if not most_recent_completed_enrollment or \
                       enrollment.get('completed_at', '') > most_recent_completed_enrollment.get('completed_at', ''):
                        most_recent_completed_enrollment = enrollment

            # If there are only completed enrollments, ask if they want to load old tasks
            # (unless force_new is specified in request body)
            if has_completed_enrollment and not force_new:
                # Get task count from the most recent completed enrollment
                previous_enrollment = most_recent_completed_enrollment
                previous_tasks = quest_repo.client.table('user_quest_tasks')\
                    .select('id')\
                    .eq('user_quest_id', previous_enrollment['id'])\
                    .execute()

                return jsonify({
                    'success': False,
                    'error': 'quest_previously_completed',
                    'message': f'You have completed this quest before with {len(previous_tasks.data or [])} tasks.',
                    'previous_enrollment': previous_enrollment,
                    'previous_task_count': len(previous_tasks.data or []),
                    'requires_confirmation': True
                }), 409  # Conflict status code

        # Create enrollment using repository
        enrollment = quest_repo.enroll_user(user_id, quest_id)

        # Check if we should load tasks from previous enrollment
        if load_previous_tasks and existing.data:
            logger.info(f"[QUEST_RESTART] Loading tasks from previous enrollment for user {user_id[:8]}, quest {quest_id[:8]}")

            # CRITICAL: Check if the "new" enrollment is actually the same as the previous one
            # If enroll_user just reactivated an existing enrollment, we don't want to copy tasks from itself
            if len(existing.data) == 1 and enrollment['id'] == existing.data[0]['id']:
                logger.info(f"[QUEST_RESTART] Enrollment {enrollment['id'][:8]} was reactivated (not new). Tasks already exist, skipping copy.")
                # Tasks are already there from the previous attempt - just mark as personalized and continue
                # IMPORTANT: Update last_picked_up_at to mark this as a restart (for dashboard filtering)
                admin_client = get_supabase_admin_client()
                admin_client.table('user_quests')\
                    .update({
                        'personalization_completed': True,
                        'last_picked_up_at': datetime.now(timezone.utc).isoformat()
                    })\
                    .eq('id', enrollment['id'])\
                    .execute()

                # Count existing tasks
                existing_tasks = admin_client.table('user_quest_tasks')\
                    .select('id')\
                    .eq('user_quest_id', enrollment['id'])\
                    .eq('approval_status', 'approved')\
                    .execute()

                return jsonify({
                    'success': True,
                    'message': f'Reactivated "{quest.get("title")}" with your existing tasks',
                    'enrollment': enrollment,
                    'skip_wizard': True,
                    'tasks_loaded': len(existing_tasks.data or []),
                    'quest_type': quest.get('quest_type', 'optio')
                })

            try:
                # Get the most recent completed enrollment (that's NOT the current one)
                most_recent_completed_enrollment = None
                for enr in existing.data:
                    if enr['id'] != enrollment['id'] and enr.get('completed_at'):
                        if not most_recent_completed_enrollment or \
                           enr.get('completed_at', '') > most_recent_completed_enrollment.get('completed_at', ''):
                            most_recent_completed_enrollment = enr

                if not most_recent_completed_enrollment:
                    logger.warning(f"[QUEST_RESTART] No previous completed enrollment found (only current one exists)")
                    # Just mark as personalized and continue - no tasks to copy
                    # IMPORTANT: Update last_picked_up_at to mark this as a restart
                    admin_client = get_supabase_admin_client()
                    admin_client.table('user_quests')\
                        .update({
                            'personalization_completed': True,
                            'last_picked_up_at': datetime.now(timezone.utc).isoformat()
                        })\
                        .eq('id', enrollment['id'])\
                        .execute()
                    return jsonify({
                        'success': True,
                        'message': f'Started "{quest.get("title")}" fresh',
                        'enrollment': enrollment,
                        'skip_wizard': False,
                        'quest_type': quest.get('quest_type', 'optio')
                    })

                previous_enrollment = most_recent_completed_enrollment
                admin_client = get_supabase_admin_client()
                previous_tasks = admin_client.table('user_quest_tasks')\
                    .select('*')\
                    .eq('user_quest_id', previous_enrollment['id'])\
                    .eq('approval_status', 'approved')\
                    .order('order_index')\
                    .execute()

                if previous_tasks.data:
                    # Copy tasks to new enrollment
                    new_tasks_data = []
                    for task in previous_tasks.data:
                        task_data = {
                            'user_id': user_id,
                            'quest_id': quest_id,
                            'user_quest_id': enrollment['id'],
                            'title': task['title'],
                            'description': task.get('description', ''),
                            'pillar': task['pillar'],
                            'xp_value': task.get('xp_value', 100),
                            'order_index': task.get('order_index', 0),
                            'is_required': task.get('is_required', True),
                            'is_manual': task.get('is_manual', True),
                            'approval_status': 'approved',
                            'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                            'subject_xp_distribution': task.get('subject_xp_distribution', {})
                        }
                        new_tasks_data.append(task_data)

                    # Bulk insert
                    admin_client.table('user_quest_tasks').insert(new_tasks_data).execute()
                    logger.info(f"[QUEST_RESTART] Copied {len(new_tasks_data)} tasks from previous enrollment")

                    # Mark personalization as completed
                    admin_client.table('user_quests')\
                        .update({'personalization_completed': True})\
                        .eq('id', enrollment['id'])\
                        .execute()

                    return jsonify({
                        'success': True,
                        'message': f'Successfully restarted "{quest.get("title")}" with your previous tasks',
                        'enrollment': enrollment,
                        'skip_wizard': True,
                        'tasks_loaded': len(new_tasks_data),
                        'quest_type': quest.get('quest_type', 'optio')
                    })

            except Exception as copy_error:
                logger.error(f"[QUEST_RESTART] Error copying previous tasks: {str(copy_error)}", exc_info=True)
                # Continue with normal enrollment flow if copy fails

        # Check quest type and handle accordingly
        quest_type = quest.get('quest_type', 'optio')
        skip_wizard = False

        if quest_type == 'course':
            # Course quest - auto-copy preset tasks to user_quest_tasks
            logger.info(f"[COURSE_ENROLL] Course quest detected - auto-copying preset tasks for user {user_id[:8]}, quest {quest_id[:8]}")

            try:
                from routes.quest_types import get_course_tasks_for_quest

                preset_tasks = get_course_tasks_for_quest(quest_id)
                logger.info(f"[COURSE_ENROLL] Found {len(preset_tasks)} preset tasks")

                if preset_tasks and len(preset_tasks) > 0:
                    # Initialize classification service for auto-generating subject distributions
                    from services.subject_classification_service import SubjectClassificationService
                    classification_service = SubjectClassificationService(client=get_supabase_admin_client())

                    # Copy all preset tasks to user_quest_tasks
                    user_tasks_data = []
                    for task in preset_tasks:
                        xp_value = task.get('xp_value', 100)

                        # Auto-generate subject distribution if not present
                        subject_distribution = task.get('subject_xp_distribution', {})
                        if not subject_distribution:
                            try:
                                subject_distribution = classification_service.classify_task_subjects(
                                    task['title'],
                                    task.get('description', ''),
                                    task['pillar'],
                                    xp_value
                                )
                                logger.info(f"[COURSE_ENROLL] Auto-classified task '{task['title'][:30]}': {subject_distribution}")
                            except Exception as e:
                                logger.warning(f"[COURSE_ENROLL] Failed to classify task, using fallback: {str(e)}")
                                subject_distribution = classification_service._fallback_subject_mapping(
                                    task['pillar'],
                                    xp_value
                                )

                        task_data = {
                            'user_id': user_id,
                            'quest_id': quest_id,
                            'user_quest_id': enrollment['id'],
                            'title': task['title'],
                            'description': task.get('description', ''),
                            'pillar': task['pillar'],
                            'xp_value': xp_value,
                            'order_index': task.get('order_index', 0),
                            'is_required': task.get('is_required', True),
                            'is_manual': False,
                            'approval_status': 'approved',
                            'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                            'subject_xp_distribution': subject_distribution
                        }
                        user_tasks_data.append(task_data)
                        logger.info(f"[COURSE_ENROLL] Prepared task: {task['title'][:30]}")

                    # Bulk insert tasks using admin client (system operation)
                    # RLS policies require admin privileges for auto-copying preset tasks
                    if user_tasks_data:
                        logger.info(f"[COURSE_ENROLL] Inserting {len(user_tasks_data)} tasks into user_quest_tasks")
                        admin_client = get_supabase_admin_client()
                        insert_result = admin_client.table('user_quest_tasks').insert(user_tasks_data).execute()
                        logger.info(f"[COURSE_ENROLL] Successfully inserted {len(insert_result.data)} tasks")

                    # Mark personalization as completed (no wizard needed)
                    logger.info(f"[COURSE_ENROLL] Marking personalization as completed for enrollment {enrollment['id'][:8]}")
                    admin_client = get_supabase_admin_client()
                    admin_client.table('user_quests')\
                        .update({'personalization_completed': True})\
                        .eq('id', enrollment['id'])\
                        .execute()
                    logger.info(f"[COURSE_ENROLL] Personalization marked complete")

                    # Only skip wizard if tasks were successfully created
                    skip_wizard = True
                else:
                    logger.warning(f"[COURSE_ENROLL] No preset tasks found for course quest {quest_id[:8]} - will show personalization wizard")
                    # Don't skip wizard - let user personalize like an Optio quest
                    skip_wizard = False

            except Exception as task_error:
                logger.error(f"[COURSE_ENROLL] ERROR copying tasks: {str(task_error)}", exc_info=True)
                # Don't fail the enrollment, but show wizard so user can add tasks manually
                skip_wizard = False

        return jsonify({
            'success': True,
            'message': f'Successfully enrolled in "{quest.get("title")}"',
            'enrollment': enrollment,
            'skip_wizard': skip_wizard,  # Tell frontend to skip personalization wizard
            'quest_type': quest_type
        })

    except NotFoundError as e:
        logger.error(f"Quest not found: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except DatabaseError as e:
        logger.error(f"Database error enrolling in quest {quest_id} for user {user_id}: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to enroll in quest'
        }), 500
    except Exception as e:
        logger.error(f"Unexpected error enrolling in quest {quest_id} for user {user_id}: {str(e)}", exc_info=True)
        import traceback
        return jsonify({
            'success': False,
            'error': 'Failed to enroll in quest'
        }), 500


@bp.route('/create', methods=['POST'])
@require_auth
def create_user_quest(user_id: str):
    """
    Allow ANY authenticated user to create their own quest.
    User-created quests are private by default (visible only to creator).
    Admins can later toggle is_public to make them available in the public quest library.
    """
    try:
        from services.image_service import search_quest_image

        supabase = get_supabase_admin_client()
        data = request.json

        # Validate required fields
        if not data.get('title'):
            return jsonify({'success': False, 'error': 'Title is required'}), 400

        if not data.get('description') and not data.get('big_idea'):
            return jsonify({'success': False, 'error': 'Description is required'}), 400

        # Auto-fetch image if not provided
        image_url = data.get('header_image_url')
        if not image_url:
            # Try to fetch image based on quest title and description
            quest_desc = data.get('big_idea', '').strip() or data.get('description', '').strip()
            image_url = search_quest_image(data['title'].strip(), quest_desc)
            logger.info(f"Auto-fetched image for quest '{data['title']}': {image_url}")

        # Create quest record (private by default, inactive until admin approves)
        quest_data = {
            'title': data['title'].strip(),
            'big_idea': data.get('big_idea', '').strip() or data.get('description', '').strip(),
            'description': data.get('big_idea', '').strip() or data.get('description', '').strip(),
            'is_v3': True,
            'is_active': True,  # Active so user can use it immediately
            'is_public': False,  # Private by default - only visible to creator
            'quest_type': 'optio',  # User-created Optio quest
            'header_image_url': image_url,
            'image_url': image_url,
            'material_link': data.get('material_link', '').strip() if data.get('material_link') else None,
            'created_by': user_id,  # Track who created the quest
            'created_at': datetime.utcnow().isoformat()
        }

        # Insert quest
        quest_result = supabase.table('quests').insert(quest_data).execute()

        if not quest_result.data:
            return jsonify({'success': False, 'error': 'Failed to create quest'}), 500

        quest_id = quest_result.data[0]['id']
        logger.info(f"User {user_id[:8]} created private quest {quest_id}: {quest_data['title']}")

        # Auto-enroll the user using repository pattern for proper error handling
        enrollment = None
        try:
            quest_repo = QuestRepository()
            enrollment = quest_repo.enroll_user(user_id, quest_id)
            logger.info(f"Successfully auto-enrolled user {user_id[:8]} in quest {quest_id[:8]}, enrollment_id: {enrollment['id'][:8]}")

            # VERIFY enrollment was actually created
            verification = quest_repo.get_user_enrollment(user_id, quest_id)
            if not verification:
                raise DatabaseError("Enrollment verification failed - record not found after creation")

        except Exception as enrollment_error:
            # CRITICAL: If enrollment fails, rollback quest creation
            logger.error(f"CRITICAL: Failed to enroll user {user_id[:8]} in quest {quest_id[:8]}: {enrollment_error}", exc_info=True)

            try:
                # SAFETY CHECK: Only delete if no enrollments exist
                enrollment_check = supabase.table('user_quests')\
                    .select('id')\
                    .eq('quest_id', quest_id)\
                    .execute()

                if not enrollment_check.data or len(enrollment_check.data) == 0:
                    # Safe to delete - truly failed enrollment
                    supabase.table('quests').delete().eq('id', quest_id).execute()
                    logger.warning(f"Rolled back quest creation {quest_id[:8]} - enrollment failed with no records created")
                else:
                    # Enrollment may have succeeded despite error - don't delete
                    logger.error(f"Enrollment verification failed but {len(enrollment_check.data)} enrollment(s) exist - preserving quest {quest_id[:8]}")
                    # Return success since enrollment actually exists
                    return jsonify({
                        'success': True,
                        'message': 'Quest created and enrolled successfully (verified after error)',
                        'quest_id': quest_id,
                        'quest': quest_result.data[0],
                        'enrollment': {
                            'enrolled': True,
                            'enrollment_id': enrollment_check.data[0]['id'],
                            'is_active': enrollment_check.data[0].get('is_active', True)
                        }
                    })

            except Exception as rollback_error:
                logger.error(f"Failed to check/rollback quest {quest_id[:8]}: {rollback_error}")

            return jsonify({
                'success': False,
                'error': 'Failed to enroll in your quest. Please try enrolling manually from your quest library.',
                'quest_id': quest_id
            }), 500

        return jsonify({
            'success': True,
            'message': 'Quest created successfully! It\'s now available in your quest library.',
            'quest_id': quest_id,
            'quest': quest_result.data[0],
            'enrollment': {
                'enrolled': True,
                'enrollment_id': enrollment['id'] if enrollment else None,
                'is_active': enrollment.get('is_active', False) if enrollment else False
            }
        })

    except Exception as e:
        logger.error(f"Error creating user quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to create quest: {str(e)}'
        }), 500
