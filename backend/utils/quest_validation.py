"""
Quest validation: the checks that gate activating a quest and making it public.

WHAT WAS HERE. A 563-line `QuestValidator` class -- reading-level estimation,
syllable counting, XP-balance scoring, an educational-value heuristic. It was
never instantiated. Not "instantiated somewhere dynamic": referenced nowhere at
all, in app code, tests or scripts. Deleted 2026-09-09; it is in git history if
any of it is ever wanted (`git log -- backend/utils/quest_validation.py`).

It mattered because dead code does not stay merely useless. Its `valid_pillars`
list still held the pre-2025 pillar display names, so a task carrying a modern
key would have scored as "invalid or missing pillar" -- a wrong answer waiting
for the first caller, in a file whose name suggests it is the authority on
whether a quest is valid.

The three functions below are what the codebase actually imports.
"""

from utils.logger import get_logger

logger = get_logger(__name__)

def validate_course_quest_has_preset_tasks(quest_id: str) -> tuple[bool, str]:
    """
    Validate that a course quest has at least one preset task OR has curriculum lessons.

    Args:
        quest_id: The quest ID to validate

    Returns:
        tuple: (is_valid, error_message)
            - is_valid: True if quest has preset tasks, curriculum lessons, or is not a course quest
            - error_message: Error message if validation fails, empty string otherwise
    """
    try:
        from database import get_supabase_admin_client
        # admin client justified: shared utility — operates on caller-supplied IDs; caller enforces access control
        supabase = get_supabase_admin_client()

        # Get quest type
        quest = supabase.table('quests')\
            .select('quest_type')\
            .eq('id', quest_id)\
            .single()\
            .execute()

        if not quest.data:
            return False, 'Quest not found'

        # Only validate course quests
        if quest.data.get('quest_type') != 'course':
            return True, ''

        # Check for preset tasks in course_quest_tasks table
        preset_tasks = supabase.table('course_quest_tasks')\
            .select('id')\
            .eq('quest_id', quest_id)\
            .limit(1)\
            .execute()

        if preset_tasks.data and len(preset_tasks.data) > 0:
            return True, ''

        # Also check for curriculum lessons (created via curriculum upload)
        # Quests with lessons are valid even without preset tasks
        curriculum_lessons = supabase.table('curriculum_lessons')\
            .select('id')\
            .eq('quest_id', quest_id)\
            .limit(1)\
            .execute()

        if curriculum_lessons.data and len(curriculum_lessons.data) > 0:
            return True, ''

        return False, 'Course quests must have at least one preset task or lesson before they can be activated or made public. Please add tasks or lessons first.'

    except Exception as e:
        logger.error(f"Error validating course quest {quest_id}: {str(e)}")
        return False, f'Validation error: {str(e)}'


def can_activate_quest(quest_id: str) -> tuple[bool, str]:
    """
    Check if a quest can be activated (made is_active=True).

    Args:
        quest_id: The quest ID to check

    Returns:
        tuple: (can_activate, error_message)
            - can_activate: True if quest can be activated
            - error_message: Error message if cannot activate, empty string otherwise
    """
    # Currently only validates course quests have preset tasks
    # Can be extended with additional validation rules in the future
    return validate_course_quest_has_preset_tasks(quest_id)


def can_make_public(quest_id: str) -> tuple[bool, str]:
    """
    Check if a quest can be made public (is_public=True).

    Args:
        quest_id: The quest ID to check

    Returns:
        tuple: (can_make_public, error_message)
            - can_make_public: True if quest can be made public
            - error_message: Error message if cannot make public, empty string otherwise
    """
    # Currently only validates course quests have preset tasks
    # Can be extended with additional validation rules in the future
    return validate_course_quest_has_preset_tasks(quest_id)