"""
Helper functions for quest personalization.
"""

from typing import Dict, Any
from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.pillar_mapping import normalize_pillar_name

logger = get_logger(__name__)


def get_effective_user_id(parent_user_id: str, acting_as_dependent_id: str = None) -> str:
    """
    Determine the effective user ID for quest operations.

    If acting_as_dependent_id is provided, verify parent owns the dependent
    and return the dependent's ID. Otherwise, return the parent's ID.

    Args:
        parent_user_id: The authenticated user's ID
        acting_as_dependent_id: Optional dependent user ID

    Returns:
        The effective user ID to use for operations

    Raises:
        PermissionError: If parent doesn't own the dependent
    """
    if not acting_as_dependent_id:
        return parent_user_id

    from repositories.dependent_repository import DependentRepository
    from repositories.base_repository import PermissionError as RepoPermissionError

    try:
        supabase = get_supabase_admin_client()
        dependent_repo = DependentRepository(client=supabase)

        # This will raise PermissionError if parent doesn't own dependent
        dependent_repo.get_dependent(acting_as_dependent_id, parent_user_id)

        logger.info(f"Parent {parent_user_id[:8]} acting as dependent {acting_as_dependent_id[:8]}")
        return acting_as_dependent_id

    except RepoPermissionError as e:
        logger.warning(f"Unauthorized dependent access attempt: {str(e)}")
        raise PermissionError(f"You do not have permission to manage this dependent profile")
    except Exception as e:
        logger.error(f"Error verifying dependent ownership: {str(e)}")
        raise PermissionError("Failed to verify dependent ownership")


def check_and_complete_personalization(user_id: str, quest_id: str, session_id: str):
    """
    Check if user has processed all AI-generated tasks and mark personalization complete.
    Triggers async sanitization when complete.

    Args:
        user_id: The user's ID
        quest_id: The quest ID
        session_id: The personalization session ID
    """
    try:
        supabase = get_supabase_admin_client()

        # Get the session to check how many tasks were generated
        session_response = supabase.table('quest_personalization_sessions')\
            .select('ai_generated_tasks')\
            .eq('id', session_id)\
            .single()\
            .execute()

        if not session_response.data:
            logger.warning(f"Session {session_id} not found - cannot check completion")
            return

        ai_generated_tasks = session_response.data.get('ai_generated_tasks', [])
        total_tasks = len(ai_generated_tasks) if ai_generated_tasks else 0

        if total_tasks == 0:
            logger.info(f"Session {session_id} has no AI tasks - skipping completion check")
            return

        # Extract task titles from the ai_generated_tasks list (handle both dict and potential malformed data)
        task_titles = []
        for task in ai_generated_tasks:
            if isinstance(task, dict):
                title = task.get('title')
                if title:
                    task_titles.append(title)
            elif isinstance(task, str):
                # If it's a string, assume it's the title itself
                task_titles.append(task)

        if not task_titles:
            logger.warning(f"Session {session_id} has {total_tasks} tasks but no valid titles - skipping completion check")
            return

        # Count how many tasks user has accepted for this quest
        accepted_tasks = supabase.table('user_quest_tasks')\
            .select('id', count='exact')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_manual', False)\
            .execute()

        accepted_count = accepted_tasks.count if accepted_tasks.count is not None else 0

        # Count how many tasks from THIS session are in the library
        # (skipped tasks get saved to library)
        library_tasks = supabase.table('quest_sample_tasks')\
            .select('id', count='exact')\
            .eq('quest_id', quest_id)\
            .in_('title', task_titles)\
            .execute()

        library_count = library_tasks.count if library_tasks.count is not None else 0

        # Total processed = accepted + those added to library (skipped or accepted)
        # Note: accepted tasks are ALSO added to library, so we need to avoid double-counting
        # The library count includes ALL tasks (accepted + skipped), so we just use that
        processed_count = library_count

        logger.info(f"[PERSONALIZATION] Session {session_id[:8]}: {processed_count}/{total_tasks} tasks processed (library count)")

        # If all tasks have been processed, mark personalization complete and sanitize
        if processed_count >= total_tasks:
            # Get user_quest_id
            enrollment = supabase.table('user_quests')\
                .select('id, personalization_completed')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .eq('is_active', True)\
                .execute()

            if not enrollment.data:
                logger.warning(f"No active enrollment found for user {user_id[:8]}, quest {quest_id[:8]}")
                return

            enrollment_data = enrollment.data[0]

            # Check if already marked complete
            if enrollment_data.get('personalization_completed'):
                logger.info(f"[PERSONALIZATION] Already marked complete for user {user_id[:8]}, quest {quest_id[:8]}")
                return

            # Mark personalization as complete
            supabase.table('user_quests')\
                .update({'personalization_completed': True})\
                .eq('id', enrollment_data['id'])\
                .execute()

            logger.info(f"[PERSONALIZATION] ✓ COMPLETE for user {user_id[:8]}, quest {quest_id[:8]} - {processed_count}/{total_tasks} tasks processed")

            # Trigger async sanitization
            from services.task_library_service import TaskLibraryService
            library_service = TaskLibraryService()

            logger.info(f"[PERSONALIZATION] Starting background AI sanitization for quest {quest_id[:8]}")
            sanitization_result = library_service.sanitize_library(quest_id, [], async_mode=True)

            if sanitization_result.get('success'):
                logger.info(f"[PERSONALIZATION] Background sanitization started for quest {quest_id[:8]}")
            else:
                logger.error(f"[PERSONALIZATION] Failed to start sanitization: {sanitization_result.get('error')}")

    except Exception as e:
        logger.error(f"Error checking personalization completion: {str(e)}")
        import traceback
        # Don't fail the request if completion check fails


def normalize_diploma_subjects(diploma_subjects: Any, total_xp: int) -> Dict[str, int]:
    """
    Normalize diploma_subjects to dict format.

    Args:
        diploma_subjects: Raw diploma subjects (list or dict)
        total_xp: Total XP value

    Returns:
        Normalized dict mapping subject -> XP
    """
    if isinstance(diploma_subjects, list):
        xp_per = (total_xp // len(diploma_subjects) // 25) * 25
        remainder = total_xp - (xp_per * len(diploma_subjects))
        return {s: xp_per + (remainder if i == 0 else 0) for i, s in enumerate(diploma_subjects)}
    elif isinstance(diploma_subjects, dict):
        return diploma_subjects
    else:
        return {'Electives': total_xp}


def get_or_create_enrollment(user_id: str, quest_id: str) -> str:
    """
    Get existing enrollment or create new one.

    Args:
        user_id: User ID
        quest_id: Quest ID

    Returns:
        user_quest_id (UUID string)

    Raises:
        RuntimeError: If enrollment creation fails
    """
    from datetime import datetime

    supabase = get_supabase_admin_client()

    # Check if already enrolled
    existing_enrollment = supabase.table('user_quests')\
        .select('id, is_active')\
        .eq('user_id', user_id)\
        .eq('quest_id', quest_id)\
        .eq('is_active', True)\
        .execute()

    if existing_enrollment.data:
        return existing_enrollment.data[0]['id']

    # Create new enrollment
    enrollment = supabase.table('user_quests')\
        .insert({
            'user_id': user_id,
            'quest_id': quest_id,
            'started_at': datetime.utcnow().isoformat(),
            'is_active': True
        })\
        .execute()

    if not enrollment.data:
        raise RuntimeError('Failed to create quest enrollment')

    return enrollment.data[0]['id']


def get_next_order_index(user_id: str, quest_id: str) -> int:
    """
    Get the next order_index for a new task.

    Args:
        user_id: User ID
        quest_id: Quest ID

    Returns:
        Next order_index
    """
    supabase = get_supabase_admin_client()

    existing_tasks = supabase.table('user_quest_tasks')\
        .select('order_index')\
        .eq('user_id', user_id)\
        .eq('quest_id', quest_id)\
        .execute()

    max_order = max(
        [t.get('order_index', -1) for t in existing_tasks.data],
        default=-1
    ) if existing_tasks.data else -1

    return max_order + 1
