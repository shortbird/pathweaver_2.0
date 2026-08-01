"""
Who is allowed to set a task's XP value.

Background: XP is student-editable by default -- "the process is the goal", and a
learner sizing their own work is part of that. Schools running Optio as their SIS
told us the default breaks down in a classroom: students were awarding themselves
large XP for small tasks, and guides had to chase the numbers down afterward.

So XP editing is now an *organization-level* capability, off by default:

    organizations.feature_flags.lock_xp_editing = true

Absent or falsy (every org today, and every platform user, who has no org at all)
keeps the current behavior exactly. When an org turns it on, only guides --
advisor, org_admin, superadmin -- may choose or change a task's XP. Learners and
parents can still create, edit, and complete tasks; the XP number is simply not
theirs to set, and the server assigns a calibrated default instead.

Enforcement lives at every route where a non-guide can supply ``xp_value``:
task edit (routes/tasks/crud.py), the personalization accept/manual-add paths,
learning-moment promotion, and parent-created dependent tasks. Frontends hide the
XP control using the same flag, but the server is the authority.
"""

from typing import Optional, Tuple

from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.org_features import org_has_feature

logger = get_logger(__name__)

# feature_flags key. Named for the restriction so "absent = off" (the convention
# in utils/org_features) means "students keep editing XP" -- i.e. no behavior
# change for any org that never opts in.
XP_LOCK_FLAG = 'lock_xp_editing'

# Roles a school would call "guides": they set XP regardless of the flag.
XP_GUIDE_ROLES = frozenset({'superadmin', 'org_admin', 'advisor'})

# XP assigned to a learner-created task when the org has locked XP editing and
# no server-generated value is available. Matches the platform default used by
# the personalization and task-library paths.
DEFAULT_TASK_XP = 100

# Ceiling for any XP a non-guide supplies, flag or no flag. Mirrors the cap in
# routes/tasks/crud.py and MAX_STUDENT_XP in the web client.
MAX_LEARNER_TASK_XP = 200

# Message shown when a learner tries to change XP in a locked org. Written for
# the student, not the developer -- this reaches the UI verbatim.
XP_LOCKED_MESSAGE = (
    "Your school sets the XP for tasks. You can still edit everything else -- "
    "ask your guide if this task's XP looks wrong."
)


def is_xp_guide(role: Optional[str]) -> bool:
    """True if `role` (an effective role) may always set XP."""
    return role in XP_GUIDE_ROLES


def get_effective_role_for(user_id: Optional[str]) -> Optional[str]:
    """
    Look up a user's effective role (unwrapping ``org_managed`` -> ``org_role``).

    Convenience for routes that only carry a user_id. Returns None if the user
    can't be read, which `is_xp_guide` treats as "not a guide" -- fail closed on
    the privilege, since the surrounding checks then fall back to the org policy.
    """
    if not user_id:
        return None

    try:
        from utils.roles import get_effective_role

        # admin client justified: reads the caller's own role for an
        # authorization decision; single-row, two-column self read.
        supabase = get_supabase_admin_client()
        result = supabase.table('users')\
            .select('role, org_role')\
            .eq('id', user_id)\
            .maybe_single()\
            .execute()

        data = getattr(result, 'data', None)
        return get_effective_role(data) if data else None

    except Exception as e:
        logger.warning(f"Could not resolve effective role for user {user_id}: {e}")
        return None


def xp_locked_for_learner(learner_id: Optional[str]) -> bool:
    """
    True when the organization owning `learner_id` has locked XP editing.

    Resolves the learner's own organization -- not the caller's -- so a parent or
    guide acting on a student is judged by the student's school. Platform users
    (organization_id NULL) are never locked. Fails open on error: a transient DB
    blip should not stop a student from editing their own work.
    """
    if not learner_id:
        return False

    try:
        # admin client justified: resolves a task owner's organization_id to
        # apply that org's XP policy; single-column read keyed by user id.
        supabase = get_supabase_admin_client()
        result = supabase.table('users')\
            .select('organization_id')\
            .eq('id', learner_id)\
            .maybe_single()\
            .execute()

        org_id = (getattr(result, 'data', None) or {}).get('organization_id')
        if not org_id:
            return False

        return org_has_feature(org_id, XP_LOCK_FLAG)

    except Exception as e:
        logger.warning(f"Could not resolve XP lock for user {learner_id}: {e}")
        return False


def can_set_task_xp(caller_role: Optional[str], learner_id: Optional[str]) -> bool:
    """
    True when a caller with `caller_role` may set the XP of `learner_id`'s task.

    Guides always may. Everyone else may unless the learner's org locked it.
    """
    if is_xp_guide(caller_role):
        return True
    return not xp_locked_for_learner(learner_id)


def resolve_learner_task_xp(
    requested_xp,
    *,
    caller_role: Optional[str] = None,
    learner_id: Optional[str] = None,
    locked: Optional[bool] = None,
    server_xp: Optional[int] = None,
    default_xp: int = DEFAULT_TASK_XP,
    min_xp: int = 1,
    max_xp: int = MAX_LEARNER_TASK_XP,
) -> Tuple[int, bool]:
    """
    Decide the XP a newly created task should carry, and report whether the
    caller's requested value was overridden.

    Guides get their value through untouched (only coerced to int). For everyone
    else:

      * org not locked -> the requested value, coerced and clamped to
        [min_xp, max_xp]. The clamp applies regardless of the flag: a
        client-supplied number reaching an auto-approved task is exactly how
        self-awarded XP inflation happened in the first place.
      * org locked -> `server_xp` when the platform generated one for this task
        (the AI's calibrated suggestion), otherwise `default_xp`. The requested
        value is discarded.

    Pass `locked` when the caller already resolved it (batch loops), otherwise it
    is looked up from `learner_id`.

    Returns ``(xp_value, was_overridden)``.
    """
    try:
        requested = int(requested_xp)
    except (TypeError, ValueError):
        requested = default_xp

    if is_xp_guide(caller_role):
        return requested, False

    if locked is None:
        locked = xp_locked_for_learner(learner_id)

    if locked:
        assigned = server_xp if isinstance(server_xp, int) and server_xp > 0 else default_xp
        assigned = min(max(assigned, min_xp), max_xp)
        return assigned, assigned != requested

    clamped = min(max(requested, min_xp), max_xp)
    return clamped, clamped != requested
