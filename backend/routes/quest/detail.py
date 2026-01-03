"""
Quest Detail API endpoints.
Handles quest detail views and enrollment status checking.

Part of the quests.py refactoring (P2-ARCH-1).
"""

from flask import Blueprint, jsonify
from database import get_supabase_admin_client, get_supabase_client
from utils.auth.decorators import require_auth
from utils.source_utils import get_quest_header_image
from utils.pillar_mapping import normalize_pillar_name
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('quest_detail', __name__, url_prefix='/api/quests')


@bp.route('/<quest_id>', methods=['GET'])
@require_auth
def get_quest_detail(user_id: str, quest_id: str):
    """
    Get detailed information about a specific quest.
    Includes user's progress if enrolled.
    Uses user-specific tasks if enrolled, otherwise shows quest template.
    """
    try:
        # Use admin client for all queries since we're accessing user-specific data
        # User authentication is already enforced by @require_auth decorator
        supabase = get_supabase_admin_client()

        # Get quest basic info (without tasks - they're user-specific now)
        quest = supabase.table('quests')\
            .select('*')\
            .eq('id', quest_id)\
            .single()\
            .execute()

        logger.info(f"[QUEST DETAIL] Quest query response: {quest.data}")

        if not quest.data:
            return jsonify({
                'success': False,
                'error': 'Quest not found'
            }), 404

        quest_data = quest.data

        # Add source header image if no custom header exists
        if not quest_data.get('header_image_url') and quest_data.get('source'):
            source_header = get_quest_header_image(quest_data)
            if source_header:
                quest_data['header_image_url'] = source_header

        # Check if user is enrolled and get their personalized tasks
        logger.info(f"[QUEST DETAIL] Checking enrollment for user {user_id[:8]} on quest {quest_id[:8]}")

        # Get all enrollments for this user and quest
        # Using admin client since user_id is already authenticated via @require_auth
        all_enrollments = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        enrollments_data = all_enrollments.data or []
        logger.info(f"[QUEST DETAIL] All enrollments found: {len(enrollments_data)}")
        for enrollment in enrollments_data:
            logger.info(f"[QUEST DETAIL] Enrollment: id={enrollment.get('id')}, is_active={enrollment.get('is_active')}, completed_at={enrollment.get('completed_at')}, personalization_completed={enrollment.get('personalization_completed')}")

        # Find active or completed enrollment
        active_enrollment = None
        completed_enrollment = None

        for enrollment in enrollments_data:
            # IMPORTANT: Check is_active FIRST before completed_at
            # A quest can have both is_active=True AND completed_at set when restarted
            # In this case, it should be treated as ACTIVE, not completed
            is_active = enrollment.get('is_active')
            has_completed_at = enrollment.get('completed_at')

            if is_active:
                # Active enrollment (even if it has a completed_at from previous completion)
                active_enrollment = enrollment
            elif has_completed_at and not is_active:
                # Truly completed (has completed_at AND is_active=False)
                completed_enrollment = enrollment

        # Get user-specific tasks if enrolled (regardless of personalization_completed status)
        if active_enrollment or completed_enrollment:
            # Prioritize active enrollment over completed (fixes restart bug)
            enrollment_to_use = active_enrollment or completed_enrollment
            logger.info(f"[QUEST_DETAIL] Using enrollment ID: {enrollment_to_use['id'][:8]}, user_id: {user_id[:8]}, quest_id: {quest_id[:8]}")

            # Debug: Check ALL tasks for this user and quest (ignoring user_quest_id)
            all_user_tasks_debug = supabase.table('user_quest_tasks')\
                .select('id, user_quest_id, title')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()
            logger.info(f"[QUEST_DETAIL] DEBUG: Found {len(all_user_tasks_debug.data or [])} tasks for user+quest combo (any enrollment)")
            for task in (all_user_tasks_debug.data or [])[:3]:  # Log first 3
                logger.info(f"[QUEST_DETAIL] DEBUG Task: title={task['title'][:30]}, user_quest_id={task['user_quest_id'][:8]}")

            # Get user's personalized tasks
            user_tasks = supabase.table('user_quest_tasks')\
                .select('*')\
                .eq('user_quest_id', enrollment_to_use['id'])\
                .eq('approval_status', 'approved')\
                .order('order_index')\
                .execute()

            logger.info(f"[QUEST_DETAIL] Found {len(user_tasks.data or [])} approved tasks for user_quest_id {enrollment_to_use['id'][:8]}")

            # Get task completions with evidence (only columns that exist in table)
            task_completions = supabase.table('quest_task_completions')\
                .select('user_quest_task_id, evidence_text, evidence_url, completed_at')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            completed_task_ids = {t['user_quest_task_id'] for t in task_completions.data} if task_completions.data else set()

            # DEBUG: Log completion data
            logger.info(f"[QUEST_DETAIL] Task completions for user {user_id[:8]} on quest {quest_id[:8]}:")
            logger.info(f"[QUEST_DETAIL] Found {len(task_completions.data or [])} completion records")
            for comp in (task_completions.data or [])[:5]:  # Log first 5
                logger.info(f"[QUEST_DETAIL]   Completion: user_quest_task_id={comp['user_quest_task_id'][:8]}, completed_at={comp.get('completed_at')}")
            logger.info(f"[QUEST_DETAIL] Completed task IDs set: {[id[:8] for id in list(completed_task_ids)[:5]]}")

            # Create a mapping of task_id to completion data for easy lookup
            completion_data_map = {t['user_quest_task_id']: t for t in task_completions.data} if task_completions.data else {}

            # Debug: Check raw pillar values from database
            logger.info(f"[QUEST_DETAIL] Raw tasks from DB for quest {quest_id}:")
            for i, task in enumerate(user_tasks.data or []):
                logger.info(f"  Task {i}: '{task.get('title')}' - pillar='{task.get('pillar')}'")

            # Mark tasks as completed and map field names for frontend compatibility
            quest_tasks = user_tasks.data or []
            for task in quest_tasks:
                task_is_completed = task['id'] in completed_task_ids
                task['is_completed'] = task_is_completed
                # DEBUG: Log each task's completion status
                logger.info(f"[QUEST_DETAIL] Task '{task.get('title')[:30]}': id={task['id'][:8]}, is_completed={task_is_completed}, in_completed_set={task['id'] in completed_task_ids}")

                # Add evidence data if task is completed
                if task['id'] in completion_data_map:
                    completion = completion_data_map[task['id']]
                    task['evidence_text'] = completion.get('evidence_text')
                    task['evidence_url'] = completion.get('evidence_url')
                    task['completed_at'] = completion.get('completed_at')
                    # Note: evidence_type and evidence_blocks are not in quest_task_completions table
                    # They may be stored in evidence_document_blocks table separately

                # Map xp_value to xp_amount for frontend compatibility
                if 'xp_value' in task:
                    task['xp_amount'] = task['xp_value']
                # Map diploma_subjects to school_subjects for frontend compatibility
                if 'diploma_subjects' in task:
                    task['school_subjects'] = task['diploma_subjects']
                # Normalize pillar to new key format for frontend
                # Frontend expects lowercase keys like 'stem', 'art', etc.
                if 'pillar' in task:
                    original_pillar = task['pillar']
                    # Normalize pillar to new single-word key (handles legacy values)
                    try:
                        pillar_key = normalize_pillar_name(task['pillar'])
                    except ValueError:
                        pillar_key = 'art'  # Default fallback
                    logger.info(f"[QUEST_DETAIL] Task '{task.get('title')}': DB pillar='{original_pillar}' -> sending key='{pillar_key}' to frontend")
                    task['pillar'] = pillar_key  # Send key, not display name

            quest_data['quest_tasks'] = quest_tasks

            # Calculate progress
            total_tasks = len(quest_tasks)
            completed_count = len(completed_task_ids)

            # Prioritize active enrollment over completed (fixes restart bug)
            if active_enrollment:
                logger.info(f"[QUEST DETAIL] Using active enrollment")
                quest_data['user_enrollment'] = active_enrollment
                quest_data['completed_enrollment'] = None
                quest_data['progress'] = {
                    'completed_tasks': completed_count,
                    'total_tasks': total_tasks,
                    'percentage': (completed_count / total_tasks * 100) if total_tasks > 0 else 0
                }
            elif completed_enrollment:
                logger.info(f"[QUEST DETAIL] Using completed enrollment")
                quest_data['completed_enrollment'] = completed_enrollment
                quest_data['user_enrollment'] = None
                quest_data['progress'] = {
                    'completed_tasks': completed_count,
                    'total_tasks': total_tasks,
                    'percentage': 100
                }
        else:
            # Not enrolled - show empty quest (personalization required)
            logger.info(f"[QUEST DETAIL] User not enrolled or personalization not completed")
            quest_data['quest_tasks'] = []
            quest_data['user_enrollment'] = None
            quest_data['completed_enrollment'] = None
            quest_data['progress'] = None

        # Add quest type-specific data for non-enrolled users
        # Import helper functions here to avoid circular import
        from routes.quest_types import get_sample_tasks_for_quest, get_course_tasks_for_quest

        quest_type = quest_data.get('quest_type', 'optio')

        if not (active_enrollment or completed_enrollment):
            # User not enrolled - show sample/preset tasks based on quest type
            if quest_type == 'optio':
                # Optio quest - show sample tasks as inspiration
                sample_tasks = get_sample_tasks_for_quest(quest_id, randomize=True)
                quest_data['sample_tasks'] = sample_tasks
                quest_data['preset_tasks'] = []
                logger.info(f"[QUEST DETAIL] Added {len(sample_tasks)} sample tasks for Optio quest")
            elif quest_type == 'course':
                # Course quest - show preset tasks
                preset_tasks = get_course_tasks_for_quest(quest_id)
                quest_data['preset_tasks'] = preset_tasks
                quest_data['sample_tasks'] = []
                logger.info(f"[QUEST DETAIL] Added {len(preset_tasks)} preset tasks for Course quest")
        else:
            # User is enrolled - no need for sample/preset tasks
            quest_data['sample_tasks'] = []
            quest_data['preset_tasks'] = []

        # Check if this quest is part of an active course enrollment
        # This is used to disable the "End Quest" button for course quests
        active_course_enrollment = None
        try:
            # Find courses that contain this quest
            course_quests_result = supabase.table('course_quests')\
                .select('course_id')\
                .eq('quest_id', quest_id)\
                .execute()

            if course_quests_result.data:
                course_ids = [cq['course_id'] for cq in course_quests_result.data]

                # Check if user has active enrollment in any of these courses
                course_enrollments = supabase.table('course_enrollments')\
                    .select('id, course_id, status')\
                    .eq('user_id', user_id)\
                    .in_('course_id', course_ids)\
                    .eq('status', 'active')\
                    .execute()

                if course_enrollments.data:
                    active_course_enrollment = course_enrollments.data[0]
                    logger.info(f"[QUEST DETAIL] Quest {quest_id[:8]} is part of active course enrollment {active_course_enrollment['id'][:8]}")
        except Exception as course_err:
            logger.warning(f"[QUEST DETAIL] Error checking course enrollment: {course_err}")

        quest_data['active_course_enrollment'] = active_course_enrollment

        return jsonify({
            'success': True,
            'quest': quest_data
        })

    except Exception as e:
        logger.error(f"Error getting quest detail: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch quest details'
        }), 500


@bp.route('/<quest_id>/enrollment-status', methods=['GET'])
@require_auth
def check_enrollment_status(user_id: str, quest_id: str):
    """
    Check if user is enrolled in a specific quest.
    Returns enrollment details if enrolled.
    """
    try:
        supabase = get_supabase_client()

        # Check for any enrollment
        enrollment = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not enrollment.data:
            return jsonify({
                'enrolled': False,
                'status': 'not_enrolled'
            })

        # Check for active enrollment
        for enr in enrollment.data:
            if enr.get('is_active') and not enr.get('completed_at'):
                return jsonify({
                    'enrolled': True,
                    'status': 'active',
                    'enrollment': enr
                })
            elif enr.get('completed_at'):
                return jsonify({
                    'enrolled': True,
                    'status': 'completed',
                    'enrollment': enr
                })

        # Has enrollment but it's inactive
        return jsonify({
            'enrolled': True,
            'status': 'inactive',
            'enrollment': enrollment.data[0]
        })

    except Exception as e:
        logger.error(f"Error checking enrollment status: {str(e)}")
        return jsonify({
            'error': 'Failed to check enrollment status'
        }), 500
