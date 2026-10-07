"""The smallest XP a school's own task may be worth: 25 unless the org lowers it.

Ticket a6f7b429 (Jon England, Horizon, 2026-10-07): "When we save a task,
the XP minimum goes back to 25 and overrides the custom XP we set for that
task... Students are now seeing odd totals like 100/65." The one quest form
(9296270f, 2026-09-23) re-sends every task through clean_task on each save, and
clean_task raised anything under 25 to 25 -- while the single-task edit used
max(0, xp) and kept it. Two floors on one row: whichever path wrote last won.

Owner decision on that ticket: organizations can override the XP floor if they
want. So the floor is per org, stored at
organizations.feature_flags.sis_settings.min_task_xp (no migration: it rides
the existing settings blob and PATCH /api/sis/settings), and every place that
floors a school-authored task asks this module -- the full save, the
single-task edit, the add-task path, the training editor and the AI drafter --
so they cannot disagree again.

Absent or invalid means 25, which is exactly the behaviour before the setting
existed. The allowed range is 1..25: an org may lower the floor, never raise it
(25 is still Optio's default task size), and never to 0 (a task worth nothing
cannot count toward anything).

This is the floor for SCHOOL-AUTHORED tasks only. Optio's own reviewer scale
(config.constants.MIN_TASK_XP, the credit dashboard's XpSizeInput) is not an
org setting and does not read this.
"""

from typing import Any, Dict, Optional, Union

#: The key inside feature_flags.sis_settings.
SETTING_KEY = 'min_task_xp'
#: Optio's default, and the answer for any org that has not set one.
DEFAULT_MIN_TASK_XP = 25
#: The lowest an org may set. 0 would make a task worth nothing.
LOWEST_MIN_TASK_XP = 1


def _is_whole(raw: Any) -> bool:
    # bool is an int subclass; True is not a floor of 1.
    return isinstance(raw, int) and not isinstance(raw, bool)


def parse_min_task_xp(raw: Any) -> int:
    """A stored value as a floor. Anything outside 1..25 reads as 25."""
    if _is_whole(raw) and LOWEST_MIN_TASK_XP <= raw <= DEFAULT_MIN_TASK_XP:
        return raw
    return DEFAULT_MIN_TASK_XP


def invalid_min_task_xp(raw: Any) -> Optional[str]:
    """The error to show for a submitted value, or None when it may be stored.
    None (clear the setting, back to 25) is allowed."""
    if raw is None:
        return None
    if not _is_whole(raw) or not (LOWEST_MIN_TASK_XP <= raw <= DEFAULT_MIN_TASK_XP):
        return (f'The smallest XP for a task must be a whole number from '
                f'{LOWEST_MIN_TASK_XP} to {DEFAULT_MIN_TASK_XP}.')
    return None


def _org_flags(org_id: str) -> Dict[str, Any]:
    # Through the module gate's per-request cache: the quest routes have
    # usually read this organizations row already on this request.
    from modules.enabled import org_flags
    return org_flags(org_id)


def org_min_task_xp(org: Union[str, Dict[str, Any], None]) -> int:
    """The org's task XP floor. `org` is an org id, an organizations row (with
    its feature_flags), or None (an Optio library quest: the default)."""
    if not org:
        return DEFAULT_MIN_TASK_XP
    if isinstance(org, dict):
        flags = org.get('feature_flags') or {}
    else:
        flags = _org_flags(org)
    settings = flags.get('sis_settings') if isinstance(flags, dict) else None
    if not isinstance(settings, dict):
        return DEFAULT_MIN_TASK_XP
    return parse_min_task_xp(settings.get(SETTING_KEY))
