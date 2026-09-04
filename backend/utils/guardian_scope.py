"""Guardian-delegated reads: one gate for "may this adult look at this kid's quest".

A parent opening a child's quest in the mobile app sees the child's own quest
screen, pointed at the child (frontend-v2 `app/(app)/parent/quest/...`). Rather
than keep a parallel set of parent-shaped read endpoints whose payloads drift
from the student's — which is what `/api/parent/quest/<sid>/<qid>` had become:
no `big_idea`, no journal moments, no class credit ring — the student-scoped GET
routes accept `?student_id=` and swap whose rows they read after this check.

Who passes:
  * the student themselves (a no-op — passing your own id changes nothing),
  * a superadmin,
  * a parent who manages the student as a dependent (`users.managed_by_parent_id`),
  * a parent with an approved row in `parent_student_links`.

This is deliberately the SAME set `routes/family_quests.verify_parent_has_access_to_child`
admits on the write side, so a parent never sees a screen whose buttons their
own POST would refuse.

Observers are deliberately NOT included. `verify_parent_access` lets them read
the curated parent dashboard; the quest working surface is a different thing —
it fronts task authoring, evidence upload and completion, none of which an
observer may do. They keep their own read-only student view.
"""

from database import get_supabase_admin_client
from utils.exceptions import OpError
from utils.logger import get_logger
from utils.validation.sanitizers import PostgrestFilterError, pgrst_uuid

logger = get_logger(__name__)


class GuardianAccessError(OpError):
    """The caller has no guardian claim on the student they asked to view.

    Its own type rather than middleware's authorization error: utils may not
    import middleware (tests/unit/test_import_layers.py). Each route turns this
    into the 403 shape that route already speaks.
    """


def guardian_relationship(caller_id: str, student_id: str):
    """Describe how `caller_id` is tied to `student_id`, or None if not at all.

    Returns ``{'first_name': str, 'is_dependent': bool}`` — is_dependent meaning
    the student is a managed under-13 profile (`managed_by_parent_id`), which is
    the line the destructive actions sit behind: completing and removing a
    task undo work that a student with their own login must own.
    """
    if not caller_id or not student_id:
        return None

    # admin client justified: the relationship lookup IS the authorization check;
    # reads users + parent_student_links to decide whether a caller may act for a student
    supabase = get_supabase_admin_client()

    student = supabase.table('users').select('first_name, managed_by_parent_id') \
        .eq('id', student_id).maybe_single().execute()
    if not (student and student.data):
        return None

    described = {
        'first_name': student.data.get('first_name') or '',
        'is_dependent': student.data.get('managed_by_parent_id') == caller_id,
    }
    if described['is_dependent'] or caller_id == student_id:
        return described

    link = supabase.table('parent_student_links').select('id') \
        .eq('parent_user_id', caller_id) \
        .eq('student_user_id', student_id) \
        .eq('status', 'approved').limit(1).execute()
    if link.data:
        return described

    caller = supabase.table('users').select('role').eq('id', caller_id).maybe_single().execute()
    if caller and caller.data and caller.data.get('role') == 'superadmin':
        return described

    return None


def is_guardian_of(caller_id: str, student_id: str) -> bool:
    """True when `caller_id` may act for `student_id` as a guardian or superadmin."""
    if caller_id and caller_id == student_id:
        return True
    return guardian_relationship(caller_id, student_id) is not None


def guardian_capabilities(caller_id: str, student_id: str) -> dict:
    """What a guardian may DO on this student's quest screen.

    Shipped in the delegated quest payload so the app doesn't have to infer the
    relationship a second time, and so the buttons it renders are exactly the
    ones the write endpoints accept:

    * adding a task is allowed for every verified child (family_quests.create_task_for_dependent),
    * completing and removing tasks are managed-dependent only (the same rule
      family_quests enforces on delete/uncomplete).
    """
    rel = guardian_relationship(caller_id, student_id) or {}
    is_dependent = bool(rel.get('is_dependent'))
    return {
        'student_id': student_id,
        'student_name': rel.get('first_name') or '',
        'is_dependent': is_dependent,
        'can_add_tasks': True,
        'can_complete_tasks': is_dependent,
        'can_remove_tasks': is_dependent,
    }


def resolve_student_scope(caller_id: str, student_id) -> str:
    """Return the user id a student-scoped read should target.

    `student_id` is the request's `?student_id=` (or None). Without it the
    caller reads their own rows, which is every existing call site. With it the
    caller must be a guardian of that student, or this raises
    GuardianAccessError — a 403, not a 500, via the route's own handler.
    """
    if not student_id:
        return caller_id

    try:
        student_id = pgrst_uuid(student_id, 'student_id')
    except PostgrestFilterError as e:
        raise GuardianAccessError(str(e)) from e

    if student_id == caller_id:
        return caller_id

    if not is_guardian_of(caller_id, student_id):
        logger.warning(
            f"Denied delegated read: {caller_id[:8]} is not a guardian of {student_id[:8]}"
        )
        raise GuardianAccessError("You do not have access to this student's data")

    return student_id
