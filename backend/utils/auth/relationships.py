"""Structural enforcement for routes that name a person in the URL.

A route like ``/api/advisor/students/<student_id>/checkins`` carries an
authorization question in its path: *what is this caller to that student?*
Today every such route answers it by hand -- 187 of them, in 56 modules, at
three different layers (inline in the view, one hop into a service, or inside
a bespoke ``_authorize`` helper). The 2026-08-31 audit sampled a dozen and
found every one correct. That is not the problem. The problem is that nothing
fails when the 188th forgets, and the failure is silent: the route works
perfectly for the caller who owns the record, and leaks for the one who does
not.

This module supplies the missing declaration. ``@require_relationship_to``
states the policy where a reviewer reads it -- next to the URL that carries
the id -- and ``tests/unit/test_id_routes_declare_relationship.py`` fails the
build for any id-bearing route that neither declares one nor is allowlisted
with a written reason.

The relationship predicates are NOT new. They are the ones
``utils/portfolio_access`` already uses to answer "may this caller see this
student's work", which is the same question in a different coat. The one
exception is ``household_guardian``, added there on 2026-09-03 because no
predicate covered the way the SIS registration funnel links a family --
``household_members`` rows rather than ``parent_student_links`` or
``managed_by_parent_id`` -- and for a microschool that is nearly every family. Re-deriving
them here would re-create the divergence that module was written to end (four
copies of the parent check that disagreed with each other).

Policy notes:
  * ``allow`` is required. There is no default set of relationships, because a
    default would be a policy nobody chose and everybody inherited.
  * Optio platform staff (superadmin by role, designated staff by email) pass
    every check, matching ``can_view_portfolio`` and ``require_advisor_for_student``.
  * Everything fails closed. A missing id, an unparseable id, a failed lookup
    and an unknown caller are all 403, never "allow and log".
  * It authorizes the MASQUERADE TARGET, like the rest of the decorators: an
    admin viewing as a student is that student for the duration.
"""

import json
from functools import wraps
from typing import Callable, Dict, Optional, Sequence

from flask import g, request

# The auth error types are re-exported through the sibling decorator module
# rather than imported from middleware.error_handler directly. utils -> middleware
# is a layering violation (tests/unit/test_import_layers.py); decorators.py
# already carries that edge as accepted debt, and routing this module's import
# through it keeps the coupling in ONE utils/auth file instead of two, so the
# eventual fix -- moving the auth exceptions out of middleware -- is a
# single-site change rather than a growing set.
from utils.auth.decorators import (
    AuthenticationError,
    AuthorizationError,
    authorizing_user_id,
)
from utils.logger import get_logger

logger = get_logger(__name__)


def _self(caller_id: str, target_id: str) -> bool:
    return caller_id == target_id


def _parent(caller_id: str, target_id: str) -> bool:
    from utils.portfolio_access import is_parent_of
    return is_parent_of(caller_id, target_id)


def _household_guardian(caller_id: str, target_id: str) -> bool:
    from utils.portfolio_access import is_household_guardian
    return is_household_guardian(caller_id, target_id)


def _advisor(caller_id: str, target_id: str) -> bool:
    from utils.portfolio_access import is_advisor_of
    return is_advisor_of(caller_id, target_id)


def _observer(caller_id: str, target_id: str) -> bool:
    from utils.portfolio_access import is_observer_of
    return is_observer_of(caller_id, target_id)


def _teacher(caller_id: str, target_id: str) -> bool:
    from utils.portfolio_access import teaches_student
    return teaches_student(caller_id, target_id)


def _peer(caller_id: str, target_id: str) -> bool:
    from utils.portfolio_access import is_peer_of
    return is_peer_of(caller_id, target_id)


def _org_staff(caller_id: str, target_id: str) -> bool:
    """Caller is STAFF of the SAME organization as the target.

    Staff is utils.sis_roles.STAFF_ROLES -- everyone who works at the school,
    teachers included -- and it is the whole of the word. Until 2026-09-14 this
    delegated to org_scope.caller_can_access_user, which asks only whether the
    two share an organization: an org STUDENT matched it against every
    classmate. Nothing leaked, because every one of the 102 routes naming this
    relationship also gates the role itself (the 2026-08-31 audit), but a
    predicate whose name promises more than it checks is the SEC-01 shape --
    it reads as a check while enforcing less -- and the first route to trust
    the name alone would have handed a student's record to another student.
    The comment thread on a student's work was about to be that route.

    The org half still goes through org_scope.caller_can_access_user, which
    is the same-organization primitive every direct caller uses AFTER its own
    role check; this predicate now does the role check those callers do, so
    the name and the check finally agree. Fails closed on a caller with no
    staff role, no org, a target in another (or no) org, and a failed lookup.
    """
    from database import get_supabase_admin_client
    from utils.auth.org_scope import caller_can_access_user, caller_roles_and_org
    from utils.sis_roles import STAFF_ROLES
    # admin client justified: auth utility -- answers a cross-user
    # authorization question and must read rows the caller cannot see under
    # RLS. Returns a boolean; no caller data is exposed.
    admin = get_supabase_admin_client()
    roles, _org, _is_super = caller_roles_and_org(admin, caller_id)
    if not roles & set(STAFF_ROLES):
        return False
    return caller_can_access_user(admin, caller_id, target_id)


#: The relationships a route may name. Keep this closed: an unknown name in
#: ``allow`` raises at import time rather than silently granting nothing (the
#: SEC-01 lesson -- a role name that does not exist reads as a working check).
RELATIONSHIPS: Dict[str, Callable[[str, str], bool]] = {
    'self': _self,
    'parent': _parent,
    'household_guardian': _household_guardian,
    'advisor': _advisor,
    'observer': _observer,
    'teacher': _teacher,
    'peer': _peer,
    'org_staff': _org_staff,
}

#: FERPA purpose for a disclosure made under each relationship. The reason a
#: record was shown is part of the disclosure, not decoration: a parent reading
#: their own child and an org admin reading the same record are different
#: events in a compliance report, and "someone with access looked" is not an
#: answer a school can give a family.
DISCLOSURE_PURPOSE = {
    'parent': 'parent_request',
    'household_guardian': 'parent_request',
    'observer': 'observer_view',
    'advisor': 'legitimate_educational_interest',
    'teacher': 'legitimate_educational_interest',
    'org_staff': 'legitimate_educational_interest',
    'peer': 'peer_connection',
}

#: Purpose recorded when the platform-staff branch is what let the caller in.
STAFF_DISCLOSURE_PURPOSE = 'admin_review'

#: Marker attribute the guard test looks for. Set on the wrapper; functools.wraps
#: propagates it outward through any decorator stacked above.
ENFORCED_ATTR = '_relationship_enforced'


def _is_platform_staff(caller_id: str) -> bool:
    from database import get_supabase_admin_client
    from utils.platform_staff import is_optio_platform_user
    try:
        # admin client justified: auth utility -- resolves the caller's own
        # role/email to decide staff status.
        rows = (get_supabase_admin_client().table('users')
                .select('id, email, role, org_role, org_roles, organization_id')
                .eq('id', caller_id).limit(1).execute()).data or []
    except Exception:
        logger.warning('relationship gate: staff lookup failed; denying')
        return False
    return bool(rows) and is_optio_platform_user(rows[0])


def log_disclosure(caller_id: str, student_id: str, data_type: str,
                   matched: Optional[str]) -> None:
    """Record a FERPA disclosure. Never raises, never blocks the read.

    A compliance log that can take the feature down with it gets removed the
    first time it misfires, and then there is no log at all.

    Public because it has two callers now: the URL gate below, and
    utils.guardian_scope for reads that name the student in a `student_id`
    parameter instead. Same event, same log, whichever way the id arrived.
    """
    if matched == 'self':
        return  # reading your own record is not a disclosure
    try:
        from utils.access_logger import AccessLogger
        AccessLogger.log_student_data_access(
            student_id=student_id,
            accessor_id=caller_id,
            data_type=data_type,
            purpose=(DISCLOSURE_PURPOSE.get(matched) if matched
                     else STAFF_DISCLOSURE_PURPOSE),
            endpoint=request.path,
        )
    except Exception:
        logger.exception('relationship gate: disclosure log failed on %s',
                         request.path)


#: What relationship_between returns when no declared relationship held but
#: the caller is Optio platform staff. Not a relationship name: it cannot be
#: declared in ``allow`` and is never logged as one.
STAFF = 'staff'


def validate_allow(allow: Sequence[str], where: str) -> tuple:
    """The ``allow`` policy of a gate, checked the way the decorator checks
    it: non-empty, and every name known. Raise at import time, from the module
    that declares the policy, so a typo is a failed import and not a check
    that enforces nothing."""
    allow = tuple(allow)
    if not allow:
        raise ValueError(
            f"{where} allows nothing -- a gate that can never pass is a broken "
            "route, not a strict one.")
    unknown = [a for a in allow if a not in RELATIONSHIPS]
    if unknown:
        raise ValueError(
            f"{where} names unknown relationship(s) {unknown}. Known: "
            f"{sorted(RELATIONSHIPS)}. Add the predicate to RELATIONSHIPS rather "
            "than inventing a name here -- an unrecognized name would read as a "
            "check while enforcing nothing.")
    return allow


def _request_path() -> str:
    """The request path for a log line, or '-' when there is no request --
    relationship_between is also called from tests and jobs, and Flask's
    request proxy raises outside a context rather than answering getattr."""
    try:
        return request.path
    except RuntimeError:
        return '-'


def relationship_between(caller_id: str, target_id: str,
                         allow: Sequence[str]) -> Optional[str]:
    """The first relationship in ``allow`` that holds from caller to target;
    STAFF when none does but the caller is Optio platform staff; None when
    the caller has no business with this person.

    This is the decorator's decision, as a function, for the routes the
    decorator cannot reach: the ones where the person is named in the request
    BODY, or found on a row the URL points at (a comment names its student in
    JSON; a comment thread hangs off a completion whose owner the route has to
    look up). Those routes used to answer the question by hand, in their own
    words, and the comment gates answered it wrong three times in three weeks
    -- once per audience -- while 182 URL-addressed routes stayed right by
    declaring a policy in one vocabulary. Same vocabulary, same order, same
    failure behaviour: a predicate that raises did not say yes, an unknown
    name is a ValueError, and staff is checked last because it is a lookup
    that is False for nearly everyone.
    """
    allow = validate_allow(allow, 'relationship_between')
    if not caller_id or not target_id:
        return None
    for name in allow:
        try:
            if RELATIONSHIPS[name](caller_id, target_id):
                return name
        except Exception:
            # A predicate that blows up is a predicate that did not say yes.
            # Keep evaluating the rest; never let an exception become an allow.
            logger.exception('relationship gate: %r check failed for %s',
                             name, _request_path())
    if _is_platform_staff(caller_id):
        return STAFF
    return None


def require_relationship_to(param: str, allow: Sequence[str],
                           discloses: Optional[str] = None):
    """Require the caller to stand in one of ``allow`` relationships to ``param``.

    ``param`` names a path parameter holding a user id, e.g.::

        @bp.route('/students/<student_id>/checkins')
        @require_auth
        @require_relationship_to('student_id', allow=('self', 'parent', 'advisor'))
        def checkins(user_id, student_id):
            ...

    Stack it BELOW the authentication decorator. It re-resolves the caller
    itself rather than trusting a positional argument, because the decorators
    above it disagree about what they pass (``require_org_admin`` passes three
    values, the rest pass one).

    ``discloses`` names the kind of education record the route hands over
    ('portfolio', 'grades', 'attendance', ...) and turns the gate into the
    FERPA disclosure log for that route::

        @require_relationship_to('student_id', allow=('parent', 'advisor'),
                                 discloses='progress')

    SEC-15 asked for a helper rather than thirty hand-written inserts, and the
    gate is the only place that already knows all four things a disclosure
    record needs: who asked, whose record it was, which route, and -- the part
    a hand-written insert usually gets wrong -- WHICH RELATIONSHIP let them in.
    That last one is the difference between "a parent read their child's file"
    and "an org admin read a student's file", which are different events in a
    compliance report.

    Access by ``self`` is not logged: a student reading their own record is not
    a disclosure. Logging is best-effort and never breaks the request --
    AccessLogger swallows its own failures, and this catches anything it does
    not.
    """
    if not param:
        raise ValueError('require_relationship_to needs a path parameter name')
    allow = validate_allow(allow, f"require_relationship_to('{param}')")

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if request.method == 'OPTIONS':
                return ('', 200)

            caller_id = authorizing_user_id()
            if not caller_id:
                raise AuthenticationError('Authentication required')
            request.user_id = caller_id

            target_id = kwargs.get(param)
            if not target_id:
                # The route declares a parameter it does not receive. That is a
                # wiring bug, and the safe reading of it is "no target, no access".
                logger.error('relationship gate: route %s declares %r but did '
                             'not receive it', request.path, param)
                raise AuthorizationError('Not authorized')

            # The decision lives in relationship_between, and NOTHING of the
            # view runs inside it. The first version called the view from
            # inside the predicate loop's try, on the allow branch, so the
            # handler caught whatever the VIEW raised -- a bug, a deliberate
            # NotFoundError, a ValidationError -- logged it as "check failed"
            # and answered 403 "Not authorized to access this student". The
            # caller was told they lacked permission they had,
            # middleware/error_handler never saw the exception, and Sentry
            # never got it. It was invisible from the outside twice over: the
            # staff branch returned outside any try, so a superadmin
            # reproducing the report saw the real error.
            matched = relationship_between(caller_id, target_id, allow)
            if matched is None:
                raise AuthorizationError('Not authorized to access this student')
            if matched == STAFF:
                matched = None  # got in as staff, not by a declared relationship

            if discloses:
                log_disclosure(caller_id, target_id, discloses, matched)

            return f(*args, **kwargs)

        setattr(decorated_function, ENFORCED_ATTR, (param, allow))
        return decorated_function

    return decorator


#: Marker attribute for the student-scope guard test
#: (tests/unit/test_student_scoped_routes_declare.py). Same convention as
#: ENFORCED_ATTR: set on the wrapper, propagated outward by functools.wraps.
STUDENT_SCOPE_ATTR = '_student_scope_enforced'


def student_scope(discloses: Optional[str] = None):
    """Let a guardian make this request ABOUT their child.

    The URL gate above answers "what is this caller to the person in the
    path". This one answers the same question for the routes that have no
    person in the path -- the student's own dashboard, quest list, journal,
    task completion -- where the subject is the caller unless the request
    names a `student_id` (query string, JSON body, or form field). Stack it
    BELOW the authentication decorator::

        @bp.route('/dashboard')
        @require_auth
        @student_scope('progress')
        def get_dashboard(user_id):
            ...  # user_id is the STUDENT; g.student_scope.caller_id the parent

    It swaps the positional `user_id` the auth decorator passes for the
    resolved student's id, so the body of the route reads and writes the
    student's rows without knowing a parent is behind the request. The caller
    is kept on `g.student_scope` for the routes that stamp who did it
    (completed_by_user_id and friends). Without a `student_id` the request is
    exactly what it was: the caller, about themselves, nothing logged.

    Who may pass is decided by `utils.guardian_scope`, which delegates to
    `relationship_between(allow=('self', 'parent'))` -- the same predicates,
    the same order, the same staff fallback as every declared gate. A refusal
    is the 403 the relationship gate speaks, raised before the view runs.

    `discloses` works as it does on require_relationship_to: name the record
    and a delegated read is logged as a FERPA disclosure; a self read is not.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(user_id, *args, **kwargs):
            if request.method == 'OPTIONS':
                return ('', 200)

            # Deferred: guardian_scope imports database; this module is
            # imported by decorators that database's callers depend on.
            from utils.guardian_scope import (
                GuardianAccessError, resolve_student_scope_from_request,
            )
            try:
                scope = resolve_student_scope_from_request(user_id, discloses=discloses)
            except GuardianAccessError as e:
                raise AuthorizationError(str(e)) from e

            g.student_scope = scope
            response = f(scope.student_id, *args, **kwargs)
            if scope.delegated:
                _mark_delegated(response, scope)
            return response

        setattr(decorated_function, STUDENT_SCOPE_ATTR, discloses or True)
        return decorated_function

    return decorator


def _mark_delegated(response, scope) -> None:
    """Stamp a delegated JSON payload with whose it is.

    The mobile app calls the same URL for its own rows and for a child's, and
    an app that ships before the backend it talks to (a preview OTA against a
    stale dev backend) would get the PARENT's rows back from a backend that
    ignored `student_id`, with nothing in the response to say so. It trusts a
    scoped read only when this marker names the student it asked for.
    Best-effort: a response that is not a JSON object is left alone.
    """
    body = response[0] if isinstance(response, tuple) else response
    try:
        if not getattr(body, 'is_json', False):
            return
        payload = body.get_json(silent=True)
        if not isinstance(payload, dict):
            return
        payload['scope'] = {'student_id': scope.student_id, 'delegated': True}
        body.set_data(json.dumps(payload))
    except Exception:
        logger.exception('student scope: could not mark delegated response on %s',
                         _request_path())


def current_student_scope():
    """The StudentScope `@student_scope` resolved for this request, or None
    when the route is not scoped (or is being called outside a request)."""
    try:
        return getattr(g, 'student_scope', None)
    except RuntimeError:
        return None
