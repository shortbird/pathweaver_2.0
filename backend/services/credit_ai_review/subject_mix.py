"""A subject split as percentages, and XP as one of the task sizes.

The AI suggests a split as percentages, an approval records one in XP, and a
worked example stores one as percentages. Comparing any two of them means
putting both on the same footing first, which is all this does.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from config.constants import TASK_XP_SIZES
from generated.subjects import SUBJECT_KEYS

#: A split that moved less than this many points in every subject is the same
#: split. Rounding a rescaled 75 XP task moves a subject by a few points on its
#: own, and that is not a reviewer disagreeing with anybody.
SUBJECT_DIFF_POINTS = 10


def to_percent(split: Any) -> Dict[str, int]:
    """{subject key: whole percent}, summing to 100. {} when nothing is usable.

    Takes XP amounts or percentages alike. Unknown subjects and non-positive
    amounts are dropped rather than trusted.
    """
    if isinstance(split, list):
        # The model answers with [{"subject": k, "percent": n}]: its schema
        # dialect has no open-ended maps.
        split = {str((row or {}).get('subject')): (row or {}).get('percent')
                 for row in split if isinstance(row, dict)}
    if not isinstance(split, dict):
        return {}

    amounts: Dict[str, float] = {}
    for key, value in split.items():
        key = str(key).strip().lower()
        if key not in SUBJECT_KEYS:
            continue
        try:
            amount = float(value)
        except (TypeError, ValueError):
            continue
        if amount > 0:
            amounts[key] = amounts.get(key, 0) + amount

    total = sum(amounts.values())
    if total <= 0:
        return {}

    percent = {k: int(v * 100 // total) for k, v in amounts.items()}
    # Largest remainder, so the parts always add up to exactly 100.
    short = 100 - sum(percent.values())
    by_remainder = sorted(amounts, key=lambda k: (amounts[k] * 100 / total) - percent[k], reverse=True)
    for key in by_remainder[:short]:
        percent[key] += 1
    return {k: v for k, v in percent.items() if v > 0}


def differs(a: Dict[str, int], b: Dict[str, int]) -> bool:
    """True when two percentage splits disagree by a real amount."""
    for key in set(a) | set(b):
        if abs(a.get(key, 0) - b.get(key, 0)) >= SUBJECT_DIFF_POINTS:
            return True
    return False


def snap_xp_down(value: Any, ceiling: int) -> Optional[int]:
    """The task size nearest `value` that is not above `ceiling`.

    None when no size fits under the ceiling -- a claim below the smallest
    size, which only a legacy task can carry.
    """
    try:
        xp = float(value)
    except (TypeError, ValueError):
        return None
    allowed = [s for s in TASK_XP_SIZES if s <= ceiling]
    if not allowed:
        return None
    return min(allowed, key=lambda size: (abs(size - xp), size))
