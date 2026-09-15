"""Student scope: one gate for "may this adult work on this kid's account".

A parent opens a child's quest, journal, dashboard or portfolio and sees the
child's OWN screen, pointed at the child. Rather than keep a parallel set of
parent-shaped endpoints whose payloads drift from the student's -- which is
what `/api/parent/quest/<sid>/<qid>` had become: no `big_idea`, no journal
moments, no class credit ring -- the student-scoped routes accept a
`student_id` and swap whose rows they read and write after this check. The
parent stays themselves for the whole request (attribution, audit, their own
session); only the SUBJECT of the request changes. This replaced the
token-swapping "act as" session on 2026-09-15.

Who passes:
  * the student themselves (a no-op -- passing your own id changes nothing),
  * a parent, by any of the three links `utils.portfolio_access.is_parent_of`
    knows (managed_by_parent_id, an approved parent_student_links row, a
    shared household),
  * Optio platform staff.

That is the SAME answer `utils.auth.relationships` gives the 182 URL-addressed
routes that declare `allow=('self', 'parent')`, and it is now computed by the
same function (`relationship_between`), so a guardian never sees a screen
whose buttons their own POST would refuse and a stranger is refused the same
way everywhere. This module used to carry its own superadmin lookup; that was
a second copy of a decision that already had one owner.

Observers are deliberately NOT included. `verify_parent_access` lets them read
the curated parent dashboard; the working surfaces front task authoring,
evidence upload and completion, none of which an observer may do. They keep
their own read-only student view.

There is no `is_dependent` line any more. Until 2026-09-15 a guardian could
add a task to any child's quest but complete or remove one only on a managed
(under-13, no login) profile, on the theory that a student with their own login
owns their work. Paige Hanna could not finish a task for her 12-year-old
because he had an email address. The owner's decision: a parent may do
everything the child can do, whatever the child's age or login. `is_dependent`
still gates account LIFECYCLE -- delete, promote, add credentials -- in
`repositories.dependent_repository`, which is a different question.
"""

from dataclasses import dataclass
from typing import Optional

from flask import request

from database import get_supabase_admin_client
from utils.exceptions import OpError
from utils.logger import get_logger
from utils.validation.sanitizers import PostgrestFilterError, pgrst_uuid

logger = get_logger(__name__)

#: The request parameter that names the student. Query string on GET/DELETE,
#: JSON body or form field on POST/PUT.
STUDENT_ID_PARAM = 'student_id'

#: The name the task-completion and personalization routes used before scope
#: was one thing. Accepted for one release so an app that predates the change
#: keeps working. routes/dependents_acting_as.py went on 2026-09-15; delete this
#: alias one release after mobile useQuestDetail.completeTask stops sending it.
STUDENT_ID_ALIAS = 'acting_as_dependent_id'


class GuardianAccessError(OpError):
    """The caller has no guardian claim on the student they asked to act for.

    Its own type rather than middleware's authorization error: utils may not
    import middleware (tests/unit/test_import_layers.py). Each route turns this
    into the 403 shape that route already speaks.
    """


@dataclass(frozen=True)
class StudentScope:
    """Who asked, whose account the request is about, and how they are tied.

    `via` is 'self', 'parent' or 'superadmin'. `delegated` is the question the
    write routes ask before stamping an attribution column: a parent completing
    a task records themselves as `completed_by_user_id`; a student does not.
    """
    caller_id: str
    student_id: str
    via: str

    @property
    def delegated(self) -> bool:
        return self.caller_id != self.student_id


def guardian_relationship(caller_id: str, student_id: str):
    """Describe how `caller_id` is tied to `student_id`, or None if not at all.

    Returns ``{'first_name': str, 'is_dependent': bool, 'via': str}``.
    `is_dependent` is informational now (the app shows an "Under 13" chip);
    nothing in this module decides on it.

    The decision itself is `utils.auth.relationships.relationship_between`
    with `allow=('self', 'parent')`: the same predicate order, the same
    fail-closed behaviour, and the same platform-staff fallback the URL gate
    uses. This function only adds the student's name and flag on top.
    """
    if not caller_id or not student_id:
        return None

    # Imported here, not at module scope: relationships imports decorators,
    # decorators imports session_manager, and session_manager reaches back
    # into database -- the cycle closes if this module joins it at import.
    from utils.auth.relationships import STAFF, relationship_between

    matched = relationship_between(caller_id, student_id, allow=('self', 'parent'))
    if matched is None:
        return None

    # admin client justified: the relationship above IS the authorization
    # check; this reads the student's name and flag for the payload only.
    supabase = get_supabase_admin_client()
    student = supabase.table('users') \
        .select('first_name, is_dependent') \
        .eq('id', student_id).maybe_single().execute()
    # A row, or nothing to reason about. `.data` is typed as arbitrary JSON, and
    # an answer that is not a row cannot describe a student -- so a surprising
    # shape fails closed here rather than at the first .get().
    student_row = student.data if student else None
    if not isinstance(student_row, dict):
        return None

    return {
        'first_name': student_row.get('first_name') or '',
        'is_dependent': bool(student_row.get('is_dependent')),
        'via': 'superadmin' if matched == STAFF else matched,
    }


def is_guardian_of(caller_id: str, student_id: str) -> bool:
    """True when `caller_id` may act for `student_id` as a guardian or staff."""
    if caller_id and caller_id == student_id:
        return True
    return guardian_relationship(caller_id, student_id) is not None


def guardian_capabilities(caller_id: str, student_id: str) -> dict:
    """What a guardian may DO on this student's screens.

    Shipped in delegated payloads as `viewer_context` so the app renders
    exactly the buttons the write endpoints accept. Since 2026-09-15 every
    verified guardian gets all three; the dict is kept because the mobile app
    reads it, and an app that predates the change simply sees more `True`.
    """
    rel = guardian_relationship(caller_id, student_id) or {}
    return {
        'student_id': student_id,
        'student_name': rel.get('first_name') or '',
        'is_dependent': bool(rel.get('is_dependent')),
        'can_add_tasks': True,
        'can_complete_tasks': True,
        'can_remove_tasks': True,
    }


def _log_delegated_read(caller_id: str, student_id: str, discloses: str,
                        via: str) -> None:
    """A parent reading a child's record is a FERPA disclosure; log it the
    way the URL gate does, through the same function, so the two kinds of
    delegated read are one kind of event in the compliance report."""
    from utils.auth.relationships import log_disclosure
    log_disclosure(caller_id, student_id, discloses,
                   None if via == 'superadmin' else via)


def resolve_student_scope(caller_id: str, student_id,
                          *, discloses: Optional[str] = None) -> str:
    """Return the user id a student-scoped read should target.

    `student_id` is the request's `student_id` (or None). Without it the
    caller reads their own rows, which is every existing call site. With it the
    caller must be a guardian of that student, or this raises
    GuardianAccessError -- a 403, not a 500, via the route's own handler.

    `discloses` names the education record the route hands over ('quest',
    'progress', 'journal', ...). When set and the read is delegated, the
    disclosure is logged. Reads of your own record are never logged.
    """
    if not student_id:
        return caller_id

    try:
        student_id = pgrst_uuid(student_id, 'student_id')
    except PostgrestFilterError as e:
        raise GuardianAccessError(str(e)) from e

    if student_id == caller_id:
        return caller_id

    rel = guardian_relationship(caller_id, student_id)
    if rel is None:
        logger.warning(
            f"Denied delegated read: {caller_id[:8]} is not a guardian of {student_id[:8]}"
        )
        raise GuardianAccessError("You do not have access to this student's data")

    if discloses:
        _log_delegated_read(caller_id, student_id, discloses, rel['via'])

    return student_id


def requested_student_id() -> Optional[str]:
    """The `student_id` this request names, wherever it put it.

    Query string first, so a DELETE (which has no body) and a GET agree with a
    POST; then the JSON body; then form fields, which is how the completion
    route receives its multipart upload. The deprecated alias is read last and
    logged, so the app that still sends it shows up in the logs before the
    alias is removed.
    """
    value = request.args.get(STUDENT_ID_PARAM)
    if value:
        return value

    body = request.get_json(silent=True)
    if isinstance(body, dict):
        value = body.get(STUDENT_ID_PARAM)
        if value:
            return value

    value = request.form.get(STUDENT_ID_PARAM)
    if value:
        return value

    for source in (request.args, body if isinstance(body, dict) else {}, request.form):
        value = source.get(STUDENT_ID_ALIAS)
        if value:
            logger.info(f"{STUDENT_ID_ALIAS} is deprecated; send {STUDENT_ID_PARAM} "
                        f"({request.method} {request.path})")
            return value

    return None


def resolve_student_scope_from_request(caller_id: str,
                                       *, discloses: Optional[str] = None) -> StudentScope:
    """`resolve_student_scope` for the request in flight, with the caller kept.

    The write routes need both halves: the student, to scope every query, and
    the caller, to stamp who did it. Raises GuardianAccessError exactly as the
    id-taking form does.
    """
    student_id = requested_student_id()
    if not student_id:
        return StudentScope(caller_id=caller_id, student_id=caller_id, via='self')

    try:
        student_id = pgrst_uuid(student_id, 'student_id')
    except PostgrestFilterError as e:
        raise GuardianAccessError(str(e)) from e

    if student_id == caller_id:
        return StudentScope(caller_id=caller_id, student_id=caller_id, via='self')

    rel = guardian_relationship(caller_id, student_id)
    if rel is None:
        logger.warning(
            f"Denied delegated request: {caller_id[:8]} is not a guardian of {student_id[:8]}"
        )
        raise GuardianAccessError("You do not have access to this student's data")

    if discloses:
        _log_delegated_read(caller_id, student_id, discloses, rel['via'])

    return StudentScope(caller_id=caller_id, student_id=student_id, via=rel['via'])
