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

from functools import wraps
from typing import Callable, Dict, Optional, Sequence

from flask import request

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
    """Caller is staff of the SAME organization as the target.

    Delegates to utils.auth.org_scope, which is the module written for exactly
    this cross-tenant question and which already fails closed on a caller with
    no org, a target with no org, and a failed lookup.
    """
    from database import get_supabase_admin_client
    from utils.auth.org_scope import caller_can_access_user
    # admin client justified: auth utility -- answers a cross-user
    # authorization question and must read rows the caller cannot see under
    # RLS. Returns a boolean; no caller data is exposed.
    return caller_can_access_user(get_supabase_admin_client(), caller_id, target_id)


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


def _log_disclosure(caller_id: str, student_id: str, data_type: str,
                    matched: Optional[str]) -> None:
    """Record a FERPA disclosure. Never raises, never blocks the read.

    A compliance log that can take the feature down with it gets removed the
    first time it misfires, and then there is no log at all.
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
    allow = tuple(allow)
    if not allow:
        raise ValueError(
            f"require_relationship_to('{param}') allows nothing -- a gate that "
            "can never pass is a broken route, not a strict one.")
    unknown = [a for a in allow if a not in RELATIONSHIPS]
    if unknown:
        raise ValueError(
            f"require_relationship_to('{param}') names unknown relationship(s) "
            f"{unknown}. Known: {sorted(RELATIONSHIPS)}. Add the predicate to "
            "RELATIONSHIPS rather than inventing a name here -- an unrecognized "
            "name would read as a check while enforcing nothing.")

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

            # NOTHING but the predicate goes inside this try. The first
            # version called the view from in here, on the allow branch, so the
            # handler below caught whatever the VIEW raised -- a bug, a
            # deliberate NotFoundError, a ValidationError -- logged it as
            # "check failed" and answered 403 "Not authorized to access this
            # student". The caller was told they lacked permission they had,
            # middleware/error_handler never saw the exception, and Sentry
            # never got it. It was invisible from the outside twice over: the
            # staff branch below returns outside any try, so a superadmin
            # reproducing the report saw the real error.
            allowed = False
            matched = None
            for name in allow:
                try:
                    if RELATIONSHIPS[name](caller_id, target_id):
                        allowed = True
                        matched = name
                        break
                except Exception:
                    # A predicate that blows up is a predicate that did not say
                    # yes. Keep evaluating the rest; never let an exception
                    # become an allow.
                    logger.exception('relationship gate: %r check failed on %s',
                                     name, request.path)

            # Staff last, not first. It is an OR, so the order cannot change
            # the answer -- only the cost. Checking it first spent a users
            # lookup on every request from the parent or teacher who makes up
            # essentially all of this traffic, to answer a question that is
            # False for all of them. Now only a caller who has already failed
            # every declared relationship pays for it.
            if not allowed:
                if not _is_platform_staff(caller_id):
                    raise AuthorizationError('Not authorized to access this student')
                matched = None  # got in as staff, not by a declared relationship

            if discloses:
                _log_disclosure(caller_id, target_id, discloses, matched)

            return f(*args, **kwargs)

        setattr(decorated_function, ENFORCED_ATTR, (param, allow))
        return decorated_function

    return decorator
