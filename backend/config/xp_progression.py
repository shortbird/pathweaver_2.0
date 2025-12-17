"""
XP Progression System - Single Source of Truth

Defines XP values and progression logic.
Students earn XP for completing tasks and quests - no mastery levels or tiers.
"""

# Default XP values
DEFAULT_TASK_XP = 50
DEFAULT_QUEST_XP = 100
MAX_QUEST_XP = 1000
MIN_TASK_XP = 10

# Bonus XP (marked for Phase 2 removal)
COMPLETION_BONUS_MULTIPLIER = 0.5  # 50% bonus for completing all tasks
BADGE_BONUS_XP = 500  # (DEPRECATED - to be removed)

def calculate_completion_bonus(base_xp: int) -> int:
    """
    Calculate completion bonus for finishing all tasks in a quest.
    Rounds to nearest 50.

    Args:
        base_xp: Total XP from all tasks

    Returns:
        int: Bonus XP amount (rounded to nearest 50)
    """
    bonus = int(base_xp * COMPLETION_BONUS_MULTIPLIER)
    # Round to nearest 50
    return round(bonus / 50) * 50

