"""Snapping an AI's XP number onto the task sizes (config.constants.TASK_XP_SIZES).

Every task generator used to clamp to its own range (50-200, 25-150) and keep
whatever number came back, so a task could be worth 125 or 175 -- sizes the
reviewer and the grader do not have. Snapping keeps every AI-written task on
the one scale in prompts/xp_scale.py.
"""

from config.constants import TASK_XP_SIZES


def snap_to_task_size(value, default: int = 50, lo: int = TASK_XP_SIZES[0],
                      hi: int = TASK_XP_SIZES[-1]) -> int:
    """Nearest task size to ``value`` within [lo, hi]; ``default`` when it is
    not a number. Ties go to the smaller size: when in doubt, the work is
    smaller."""
    try:
        xp = int(value)
    except (TypeError, ValueError):
        xp = default
    sizes = [s for s in TASK_XP_SIZES if lo <= s <= hi] or list(TASK_XP_SIZES)
    return min(sizes, key=lambda size: (abs(size - xp), size))
