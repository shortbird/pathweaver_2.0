"""
Student XP Goals — a weekly XP target, and how far along the student is.

A school asked for something between "no target at all" and a grade: a number
the student is aiming at this week that the student, their parents, and their
teachers can all see. XP is already the unit students think in and already
accrues from completed tasks, so this adds a target, not a new kind of progress.

Two things live here:

  * The target. Stored in ``student_weekly_xp_goals``, one row per *change*.
    ``effective_from`` is the Monday a target starts applying from, and it keeps
    applying to later weeks until a newer row supersedes it -- a student who set
    500 in September is still aiming at 500 in October without re-entering it,
    and the history of what the target used to be survives, which matters
    because "they hit their goal" means nothing if the goal was quietly lowered.

  * The progress. Summed at read time from ``quest_task_completions`` joined to
    ``user_quest_tasks.xp_value``. Deliberately NOT stored: ``users.total_xp``
    is a running counter that reversals and XP edits adjust, and a second
    per-week counter would drift away from it the first time either happened.
    (``quest_task_completions`` has no ``xp_awarded`` column -- every XP rollup
    in the codebase derives the number this way.)

The week runs Monday..Sunday in the *organization's* timezone, not the server's
and not the viewer's. A parent in another state opening their child's page must
see the same week boundary the child's school does, or the two of them disagree
about whether Sunday night's work counted.

Enabled per-org, opt-in, via the top-level ``feature_flags.xp_goals`` key read
by ``utils.org_features.org_has_feature`` -- same idiom as ``lock_xp_editing``.
Platform students (no organization) never have it: absent = off, and the server
is the authority, not the hidden UI.
"""

from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.org_features import org_has_feature

logger = get_logger(__name__)

# feature_flags key. Absent or falsy = off, per the utils.org_features convention.
XP_GOALS_FLAG = 'xp_goals'

# Matches organizations.timezone's column default.
DEFAULT_TZ = 'America/New_York'

# Bounds mirrored from the CHECK constraint on student_weekly_xp_goals.target_xp.
# A 0 is not a goal, and the ceiling stops a typo from drawing a progress bar
# that can never move.
MIN_TARGET_XP = 1
MAX_TARGET_XP = 10000

MAX_NOTE_LEN = 280

# Roles that may set another student's goal, and the capacity recorded on the
# row. Observers are absent on purpose: they watch, they do not set targets.
SETTER_ROLES = ('student', 'parent', 'advisor', 'org_admin', 'superadmin')


def _admin():
    # admin client justified: reads a student's completions and org row on
    # behalf of a parent or teacher who cannot see those rows under RLS. Every
    # caller has already passed the relationship check in can_view_goal /
    # can_set_goal, and student_weekly_xp_goals is service-role only by design.
    return get_supabase_admin_client()


# ---------------------------------------------------------------------------
# Weeks
# ---------------------------------------------------------------------------

def _tz_for_org(org_id: Optional[str]) -> ZoneInfo:
    """The org's timezone, falling back to the platform default.

    A missing or malformed timezone is a settings problem, not a reason to fail
    the page -- the fallback just shifts a week boundary by a few hours.
    """
    tz_name = DEFAULT_TZ
    if org_id:
        try:
            rows = (_admin().table('organizations').select('timezone')
                    .eq('id', org_id).limit(1).execute().data or [])
            tz_name = (rows[0].get('timezone') if rows else None) or DEFAULT_TZ
        except Exception as e:  # noqa: BLE001
            logger.warning(f'[xp_goals] timezone lookup failed for org {org_id}: {e}')
    try:
        return ZoneInfo(tz_name)
    except Exception:  # noqa: BLE001
        return ZoneInfo(DEFAULT_TZ)


def week_start_for(tz: ZoneInfo, on: Optional[date] = None) -> date:
    """The Monday of the week containing `on` (default: today, in `tz`)."""
    today = on or datetime.now(timezone.utc).astimezone(tz).date()
    return today - timedelta(days=today.weekday())


def week_bounds_utc(tz: ZoneInfo, week_start: date) -> Tuple[str, str]:
    """The half-open UTC window [Monday 00:00, next Monday 00:00) for a week.

    Half-open, not inclusive-inclusive: a task completed at exactly midnight
    Sunday-into-Monday belongs to the new week, and must not be counted twice.
    """
    start_local = datetime.combine(week_start, time.min, tzinfo=tz)
    end_local = datetime.combine(week_start + timedelta(days=7), time.min, tzinfo=tz)
    return (start_local.astimezone(timezone.utc).isoformat(),
            end_local.astimezone(timezone.utc).isoformat())


# ---------------------------------------------------------------------------
# Feature gate
# ---------------------------------------------------------------------------

def _user_row(user_id: str, columns: str) -> Dict[str, Any]:
    if not user_id:
        return {}
    try:
        rows = (_admin().table('users').select(columns)
                .eq('id', user_id).limit(1).execute().data or [])
        return rows[0] if rows else {}
    except Exception as e:  # noqa: BLE001
        logger.warning(f'[xp_goals] could not read user {user_id}: {e}')
        return {}


def _student_row(student_id: str) -> Dict[str, Any]:
    return _user_row(student_id, 'id, organization_id')


def enabled_for_org(org_id: Optional[str]) -> bool:
    """True when this organization has XP goals turned on. Fails closed."""
    return org_has_feature(org_id, XP_GOALS_FLAG)


def enabled_for_student(student_id: str) -> bool:
    """True when the student's *own* school has XP goals on.

    The student's org decides, not the viewer's: a superadmin or a parent in a
    different org looking at this student sees the student's school's policy.
    """
    return enabled_for_org(_student_row(student_id).get('organization_id'))


# ---------------------------------------------------------------------------
# Access
# ---------------------------------------------------------------------------

def can_view_goal(caller_id: str, student_id: str) -> bool:
    """Anyone who may already read this student's work may see their goal.

    Reuses ``portfolio_access.can_view_portfolio`` rather than growing a sixth
    copy of "is this caller that student's parent" -- the whole point of that
    module is that the divergent copies disagreed. The set is: the student, a
    parent, an assigned advisor, a teacher of a class they're enrolled in, a
    linked observer, an org admin of their org, and Optio staff.

    Connected peers are excluded (``allow_peers=False``). A peer connection is
    consent to show another student your *work*; a weekly XP target is a private
    goal, and quietly turning it into a number your friends can see would be a
    disclosure no parent approved.
    """
    from utils.portfolio_access import can_view_portfolio
    return can_view_portfolio(caller_id, student_id, allow_peers=False)


def setter_role(caller_id: str, student_id: str) -> Optional[str]:
    """The capacity `caller_id` may set this student's goal in, or None.

    Returns the role to record on the row, which is also the permission answer:
    None means no. Strictly narrower than ``can_view_goal`` -- an observer reads
    the goal but does not get to choose it, because an observer is someone the
    family let watch, not someone accountable for the student's week.
    """
    if not caller_id or not student_id:
        return None
    if caller_id == student_id:
        return 'student'

    from utils import portfolio_access as pa

    caller = _user_row(caller_id, 'id, email, role, org_role, org_roles, organization_id')
    if not caller:
        return None

    from utils.platform_staff import is_optio_platform_user
    if is_optio_platform_user(caller):
        return 'superadmin'

    if pa.is_parent_of(caller_id, student_id):
        return 'parent'
    if pa.is_advisor_of(caller_id, student_id) or pa.teaches_student(caller_id, student_id):
        return 'advisor'

    return 'org_admin' if pa.is_org_admin_over(caller, _student_row(student_id)) else None


def can_set_goal(caller_id: str, student_id: str) -> bool:
    return setter_role(caller_id, student_id) is not None


# ---------------------------------------------------------------------------
# The target
# ---------------------------------------------------------------------------

def goal_in_force(student_id: str, week_start: date) -> Optional[Dict[str, Any]]:
    """The target applying to `week_start`: the newest row at or before it.

    None when the student has never set one, or when every row they have starts
    in a later week (which happens the moment someone sets next week's goal
    early -- that target must not retroactively govern this week).
    """
    try:
        rows = (_admin().table('student_weekly_xp_goals')
                .select('id, target_xp, effective_from, set_by, set_by_role, note, '
                        'created_at, updated_at')
                .eq('student_user_id', student_id)
                .lte('effective_from', week_start.isoformat())
                .order('effective_from', desc=True)
                .limit(1).execute().data or [])
        return rows[0] if rows else None
    except Exception as e:  # noqa: BLE001
        logger.error(f'[xp_goals] goal lookup failed for {student_id}: {e}')
        return None


def goal_history(student_id: str, limit: int = 12) -> List[Dict[str, Any]]:
    """Recent target changes, newest first. Bounded by `limit`, so no truncation."""
    try:
        return (_admin().table('student_weekly_xp_goals')
                .select('id, target_xp, effective_from, set_by, set_by_role, note, updated_at')
                .eq('student_user_id', student_id)
                .order('effective_from', desc=True)
                .limit(limit).execute().data or [])
    except Exception as e:  # noqa: BLE001
        logger.error(f'[xp_goals] history lookup failed for {student_id}: {e}')
        return []


def clean_target(value: Any) -> Optional[int]:
    """Coerce a submitted target, or None if it isn't a usable number.

    Rejects rather than clamps: silently turning a requested 50000 into 10000
    would show the student a goal nobody chose.
    """
    try:
        target = int(value)
    except (TypeError, ValueError):
        return None
    if target < MIN_TARGET_XP or target > MAX_TARGET_XP:
        return None
    return target


def clean_note(value: Any) -> Optional[str]:
    text = ' '.join(str(value or '').split())[:MAX_NOTE_LEN]
    return text or None


def set_goal(student_id: str, target_xp: int, *, set_by: str, set_by_role: str,
             note: Optional[str] = None,
             week_start: Optional[date] = None) -> Optional[Dict[str, Any]]:
    """Set the standing weekly target, starting from `week_start` (default: now).

    Upserts on (student, effective_from) so changing your mind twice on a Monday
    edits that week's row instead of stacking rows the "newest at or before"
    lookup would then have to break ties between.
    """
    student = _student_row(student_id)
    org_id = student.get('organization_id')
    tz = _tz_for_org(org_id)
    effective_from = (week_start or week_start_for(tz)).isoformat()

    payload = {
        'student_user_id': student_id,
        'organization_id': org_id,
        'target_xp': target_xp,
        'effective_from': effective_from,
        'set_by': set_by,
        'set_by_role': set_by_role,
        'note': note,
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }
    try:
        result = (_admin().table('student_weekly_xp_goals')
                  .upsert(payload, on_conflict='student_user_id,effective_from')
                  .execute())
        rows = result.data or []
        return rows[0] if rows else None
    except Exception as e:  # noqa: BLE001
        logger.error(f'[xp_goals] could not save goal for {student_id}: {e}')
        return None


def clear_goal(student_id: str, week_start: Optional[date] = None) -> bool:
    """Remove the target that starts at `week_start` (default: the current week).

    Deletes only that row, so clearing this week's change falls back to whatever
    was standing before rather than erasing the student's whole history.
    """
    tz = _tz_for_org(_student_row(student_id).get('organization_id'))
    effective_from = (week_start or week_start_for(tz)).isoformat()
    try:
        (_admin().table('student_weekly_xp_goals').delete()
         .eq('student_user_id', student_id)
         .eq('effective_from', effective_from).execute())
        return True
    except Exception as e:  # noqa: BLE001
        logger.error(f'[xp_goals] could not clear goal for {student_id}: {e}')
        return False


# ---------------------------------------------------------------------------
# The progress
# ---------------------------------------------------------------------------

def weekly_xp(student_id: str, tz: ZoneInfo, week_start: date) -> Tuple[int, int]:
    """``(xp_earned, tasks_completed)`` for one student in one week.

    Not paged: this is one student over seven days, bounded well under the
    PostgREST 1000-row cap by anything a human can actually do. Rows whose task
    row is missing (a hard-deleted task) contribute 0 rather than raising --
    the goal card degrading to a smaller number beats it failing to render.
    """
    start_iso, end_iso = week_bounds_utc(tz, week_start)
    try:
        rows = (_admin().table('quest_task_completions')
                .select('id, user_quest_tasks(xp_value)')
                .eq('user_id', student_id)
                .gte('completed_at', start_iso)
                .lt('completed_at', end_iso)
                .execute().data or [])
    except Exception as e:  # noqa: BLE001
        logger.error(f'[xp_goals] weekly XP query failed for {student_id}: {e}')
        return 0, 0

    total = 0
    for row in rows:
        task = row.get('user_quest_tasks') or {}
        if isinstance(task, list):
            task = task[0] if task else {}
        try:
            total += int(task.get('xp_value') or 0)
        except (TypeError, ValueError):
            # non-numeric xp: skip it
            continue
    return total, len(rows)


# ---------------------------------------------------------------------------
# What the surfaces actually ask for
# ---------------------------------------------------------------------------

def summary(student_id: str, caller_id: str,
            week_start: Optional[date] = None) -> Dict[str, Any]:
    """Everything a goal card needs, for one student, in one call.

    Always returns a well-formed payload. ``enabled: False`` is the answer for
    every org that hasn't opted in and every platform student, and the card
    renders nothing at all in that case -- callers do not have to distinguish
    "off" from "not set yet".
    """
    student = _student_row(student_id)
    org_id = student.get('organization_id')
    if not enabled_for_org(org_id):
        return {'enabled': False}

    tz = _tz_for_org(org_id)
    start = week_start or week_start_for(tz)
    earned, tasks = weekly_xp(student_id, tz, start)
    goal = goal_in_force(student_id, start)
    target = int(goal['target_xp']) if goal else None

    return {
        'enabled': True,
        'week_start': start.isoformat(),
        'week_end': (start + timedelta(days=6)).isoformat(),
        'timezone': str(tz),
        'xp_earned': earned,
        'tasks_completed': tasks,
        'target_xp': target,
        'note': (goal or {}).get('note'),
        'set_by_role': (goal or {}).get('set_by_role'),
        'set_by_self': bool(goal) and goal.get('set_by') == student_id,
        'effective_from': (goal or {}).get('effective_from'),
        # Reported rather than left to each client to recompute, so the web app,
        # the mobile app, and any digest email agree on what "met" means.
        'met': bool(target) and earned >= target,
        'remaining_xp': max(target - earned, 0) if target else None,
        'percent': min(round(earned * 100 / target), 100) if target else None,
        'can_edit': can_set_goal(caller_id, student_id),
    }
