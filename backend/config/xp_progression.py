"""
XP Progression System - Single Source of Truth

Defines mastery levels, XP thresholds, and progression logic.
"""

# Mastery levels by XP amount
MASTERY_LEVELS = {
    0: {'level': 1, 'name': 'Novice', 'tier': 'explorer'},
    500: {'level': 2, 'name': 'Learner', 'tier': 'explorer'},
    1500: {'level': 3, 'name': 'Practitioner', 'tier': 'builder'},
    3500: {'level': 4, 'name': 'Specialist', 'tier': 'builder'},
    7000: {'level': 5, 'name': 'Expert', 'tier': 'creator'},
    12500: {'level': 6, 'name': 'Master', 'tier': 'creator'},
    20000: {'level': 7, 'name': 'Virtuoso', 'tier': 'scholar'},
    30000: {'level': 8, 'name': 'Legend', 'tier': 'scholar'},
    45000: {'level': 9, 'name': 'Sage', 'tier': 'sage'},
    65000: {'level': 10, 'name': 'Grandmaster', 'tier': 'sage'},
}

# Achievement tiers by total XP
ACHIEVEMENT_TIERS = {
    'explorer': {'min_xp': 0, 'display_name': 'Explorer'},
    'builder': {'min_xp': 250, 'display_name': 'Builder'},
    'creator': {'min_xp': 750, 'display_name': 'Creator'},
    'scholar': {'min_xp': 1500, 'display_name': 'Scholar'},
    'sage': {'min_xp': 3000, 'display_name': 'Sage'},
}

# Default XP values
DEFAULT_TASK_XP = 50
DEFAULT_QUEST_XP = 100
MAX_QUEST_XP = 1000
MIN_TASK_XP = 10

# Bonus XP (marked for Phase 2 removal)
COMPLETION_BONUS_MULTIPLIER = 0.5  # 50% bonus for completing all tasks
COLLABORATION_BONUS_MULTIPLIER = 2.0  # 2x bonus (DEPRECATED - to be removed)
BADGE_BONUS_XP = 500  # (DEPRECATED - to be removed)

def get_mastery_level(xp: int) -> dict:
    """
    Get mastery level for XP amount.

    Args:
        xp: Total XP earned

    Returns:
        dict: Mastery level data with 'level', 'name', and 'tier'
    """
    for threshold in sorted(MASTERY_LEVELS.keys(), reverse=True):
        if xp >= threshold:
            return MASTERY_LEVELS[threshold]
    return MASTERY_LEVELS[0]

def get_achievement_tier(total_xp: int) -> str:
    """
    Get achievement tier based on total XP.

    Args:
        total_xp: Total XP across all pillars

    Returns:
        str: Tier key (explorer, builder, creator, scholar, sage)
    """
    for tier_key in ['sage', 'scholar', 'creator', 'builder', 'explorer']:
        if total_xp >= ACHIEVEMENT_TIERS[tier_key]['min_xp']:
            return tier_key
    return 'explorer'

def get_next_tier_info(total_xp: int) -> dict:
    """
    Get information about the next achievement tier.

    Args:
        total_xp: Current total XP

    Returns:
        dict: Next tier info with 'tier_key', 'display_name', 'min_xp', 'xp_needed'
        Returns None if already at max tier (sage)
    """
    current_tier = get_achievement_tier(total_xp)
    tier_order = ['explorer', 'builder', 'creator', 'scholar', 'sage']

    current_index = tier_order.index(current_tier)
    if current_index >= len(tier_order) - 1:
        return None  # Already at max tier

    next_tier_key = tier_order[current_index + 1]
    next_tier = ACHIEVEMENT_TIERS[next_tier_key]

    return {
        'tier_key': next_tier_key,
        'display_name': next_tier['display_name'],
        'min_xp': next_tier['min_xp'],
        'xp_needed': next_tier['min_xp'] - total_xp,
    }

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

def get_xp_progress_percentage(current_xp: int, target_tier: str = None) -> float:
    """
    Calculate progress percentage toward next tier.

    Args:
        current_xp: Current XP amount
        target_tier: Optional target tier key. If None, uses next tier.

    Returns:
        float: Percentage (0-100) of progress toward target tier
    """
    if target_tier:
        target_xp = ACHIEVEMENT_TIERS[target_tier]['min_xp']
        current_tier_key = get_achievement_tier(current_xp)
        current_tier_xp = ACHIEVEMENT_TIERS[current_tier_key]['min_xp']
    else:
        next_tier = get_next_tier_info(current_xp)
        if not next_tier:
            return 100.0  # Already at max tier

        current_tier_key = get_achievement_tier(current_xp)
        current_tier_xp = ACHIEVEMENT_TIERS[current_tier_key]['min_xp']
        target_xp = next_tier['min_xp']

    if target_xp == current_tier_xp:
        return 100.0

    progress = ((current_xp - current_tier_xp) / (target_xp - current_tier_xp)) * 100
    return min(100.0, max(0.0, progress))
