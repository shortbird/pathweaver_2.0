"""Behavior of the @require_relationship_to gate (SEC-10 step a).

The guard test next door proves every id-bearing route DECLARES a policy. This
one proves the declaration is actually enforced, and -- the part that matters --
that every way it can go wrong ends in a denial rather than an allow.
"""

import pytest
from flask import Flask

from middleware.error_handler import AuthenticationError, AuthorizationError
from utils.auth.relationships import (
    ENFORCED_ATTR,
    RELATIONSHIPS,
    require_relationship_to,
)

CALLER = '11111111-1111-1111-1111-111111111111'
STUDENT = '22222222-2222-2222-2222-222222222222'


@pytest.fixture
def app():
    return Flask(__name__)


def _view(allow, param='student_id'):
    calls = []

    @require_relationship_to(param, allow=allow)
    def view(**kwargs):
        calls.append(kwargs)
        return 'ok'

    return view, calls


@pytest.fixture(autouse=True)
def _no_staff_shortcut(monkeypatch):
    """Default every test to a non-staff caller; the staff test opts back in."""
    monkeypatch.setattr('utils.auth.relationships._is_platform_staff',
                        lambda _caller: False)


@pytest.fixture(autouse=True)
def _caller(monkeypatch):
    monkeypatch.setattr('utils.auth.relationships.authorizing_user_id',
                        lambda: CALLER)


# --- declaration-time errors (import time, not request time) ----------------

def test_unknown_relationship_name_raises_at_decoration():
    """SEC-01's lesson: a name that does not exist reads as a working check."""
    with pytest.raises(ValueError, match='unknown relationship'):
        require_relationship_to('student_id', allow=('guardian',))


def test_empty_allow_raises_at_decoration():
    with pytest.raises(ValueError, match='allows nothing'):
        require_relationship_to('student_id', allow=())


def test_missing_param_name_raises_at_decoration():
    with pytest.raises(ValueError):
        require_relationship_to('', allow=('self',))


def test_decorator_marks_the_view_for_the_guard_test():
    view, _ = _view(('self',))
    assert getattr(view, ENFORCED_ATTR) == ('student_id', ('self',))


# --- the allow path ----------------------------------------------------------

def test_matching_relationship_calls_the_view(app, monkeypatch):
    monkeypatch.setitem(RELATIONSHIPS, 'parent', lambda c, t: True)
    view, calls = _view(('parent',))
    with app.test_request_context('/'):
        assert view(student_id=STUDENT) == 'ok'
    assert calls == [{'student_id': STUDENT}]


def test_self_relationship_is_identity(app):
    view, _ = _view(('self',))
    with app.test_request_context('/'):
        assert view(student_id=CALLER) == 'ok'
        with pytest.raises(AuthorizationError):
            view(student_id=STUDENT)


def test_any_one_of_several_relationships_suffices(app, monkeypatch):
    monkeypatch.setitem(RELATIONSHIPS, 'parent', lambda c, t: False)
    monkeypatch.setitem(RELATIONSHIPS, 'observer', lambda c, t: True)
    view, _ = _view(('parent', 'observer'))
    with app.test_request_context('/'):
        assert view(student_id=STUDENT) == 'ok'


def test_platform_staff_bypasses_every_predicate(app, monkeypatch):
    monkeypatch.setattr('utils.auth.relationships._is_platform_staff',
                        lambda _caller: True)
    monkeypatch.setitem(RELATIONSHIPS, 'parent', lambda c, t: False)
    view, _ = _view(('parent',))
    with app.test_request_context('/'):
        assert view(student_id=STUDENT) == 'ok'


# --- the deny paths: everything below must fail CLOSED -----------------------

def test_no_matching_relationship_denies(app, monkeypatch):
    monkeypatch.setitem(RELATIONSHIPS, 'parent', lambda c, t: False)
    view, calls = _view(('parent',))
    with app.test_request_context('/'):
        with pytest.raises(AuthorizationError):
            view(student_id=STUDENT)
    assert calls == [], 'the view must not run after a denial'


def test_unauthenticated_caller_denies(app, monkeypatch):
    monkeypatch.setattr('utils.auth.relationships.authorizing_user_id',
                        lambda: None)
    view, _ = _view(('self',))
    with app.test_request_context('/'):
        with pytest.raises(AuthenticationError):
            view(student_id=CALLER)


def test_absent_path_param_denies_rather_than_skipping_the_check(app):
    """A route that declares a param it does not receive is a wiring bug. The
    safe reading of "no target" is no access -- never "nothing to check, allow"."""
    view, calls = _view(('self',))
    with app.test_request_context('/'):
        with pytest.raises(AuthorizationError):
            view(other_id=CALLER)
    assert calls == []


def test_empty_string_target_denies(app):
    view, _ = _view(('self',))
    with app.test_request_context('/'):
        with pytest.raises(AuthorizationError):
            view(student_id='')


def test_a_predicate_that_raises_is_not_an_allow(app, monkeypatch):
    """A database blip inside is_parent_of must not become a grant."""
    def boom(c, t):
        raise RuntimeError('postgrest is down')

    monkeypatch.setitem(RELATIONSHIPS, 'parent', boom)
    view, calls = _view(('parent',))
    with app.test_request_context('/'):
        with pytest.raises(AuthorizationError):
            view(student_id=STUDENT)
    assert calls == []


def test_one_predicate_raising_does_not_block_the_others(app, monkeypatch):
    """A broken check denies for itself, not for the whole route."""
    def boom(c, t):
        raise RuntimeError('nope')

    monkeypatch.setitem(RELATIONSHIPS, 'parent', boom)
    monkeypatch.setitem(RELATIONSHIPS, 'observer', lambda c, t: True)
    view, _ = _view(('parent', 'observer'))
    with app.test_request_context('/'):
        assert view(student_id=STUDENT) == 'ok'


def test_staff_lookup_failure_is_not_staff(monkeypatch):
    """A failed staff lookup must answer "not staff", never "assume staff".

    Checked on the real _is_platform_staff (the autouse fixture stubs it out for
    every other test here), because this is the one branch where a swallowed
    exception could otherwise turn into a universal bypass.
    """
    from utils.auth import relationships

    def broken_client():
        raise RuntimeError('no database')

    monkeypatch.setattr('database.get_supabase_admin_client', broken_client)
    assert relationships._is_platform_staff(CALLER) is False


# --- the gate must not eat what the VIEW raises ------------------------------

def _raising_view(allow, exc):
    @require_relationship_to('student_id', allow=allow)
    def view(**kwargs):
        raise exc

    return view


def test_an_exception_from_the_view_is_not_reported_as_a_denial(app, monkeypatch):
    """THE regression, found 2026-09-03 while migrating routes/sis.

    The first version called the view from INSIDE the predicate loop's try, on
    the allow branch. So anything the view raised -- an ordinary bug, a
    deliberate NotFoundError, a ValidationError -- was caught by the "a
    predicate that blows up is not an allow" handler, logged as "check failed",
    and answered 403 "Not authorized to access this student".

    Three things went wrong at once, and none of them looked like this bug: the
    caller was told they lacked permission they actually had;
    middleware/error_handler never saw the exception, so the 400 or 404 the
    view meant to return never happened; and Sentry got nothing, so the real
    failure left no trace. By then 59 routes were behind this decorator.
    """
    monkeypatch.setitem(RELATIONSHIPS, 'parent', lambda c, t: True)
    view = _raising_view(('parent',), RuntimeError('the view itself broke'))
    with app.test_request_context('/'):
        with pytest.raises(RuntimeError, match='the view itself broke'):
            view(student_id=STUDENT)


def test_an_authorization_error_from_the_view_is_still_the_view_s(app, monkeypatch):
    """The nastiest shape of it: indistinguishable from the gate's own 403.

    A view that does its own finer-grained check and raises AuthorizationError
    was reported with the GATE's message, so the log said the caller failed a
    relationship they had passed. Same status code, wrong reason, and the trail
    pointed at the wrong module.
    """
    monkeypatch.setitem(RELATIONSHIPS, 'parent', lambda c, t: True)
    view = _raising_view(('parent',), AuthorizationError('the view said no'))
    with app.test_request_context('/'):
        with pytest.raises(AuthorizationError, match='the view said no'):
            view(student_id=STUDENT)


def test_the_staff_path_propagates_too(app, monkeypatch):
    """The staff branch always did -- which is how the bug stayed hidden.

    It returns outside any try, so a superadmin reproducing a user's report saw
    the real error while the user saw a 403. Pin both paths to the same
    behavior so they cannot drift apart again.
    """
    monkeypatch.setattr('utils.auth.relationships._is_platform_staff',
                        lambda _caller: True)
    view = _raising_view(('parent',), RuntimeError('the view itself broke'))
    with app.test_request_context('/'):
        with pytest.raises(RuntimeError, match='the view itself broke'):
            view(student_id=STUDENT)


def test_a_denial_still_stops_the_view_from_running(app, monkeypatch):
    """The other half: moving the call out of the try must not let it through."""
    monkeypatch.setitem(RELATIONSHIPS, 'parent', lambda c, t: False)
    view, calls = _view(('parent',))
    with app.test_request_context('/'):
        with pytest.raises(AuthorizationError):
            view(student_id=STUDENT)
    assert calls == []


def test_options_preflight_short_circuits(app):
    view, calls = _view(('self',))
    with app.test_request_context('/', method='OPTIONS'):
        assert view(student_id=STUDENT) == ('', 200)
    assert calls == []


# --- the predicates are the portfolio_access ones, not new copies ------------

def test_relationships_delegate_to_portfolio_access(monkeypatch):
    """Re-deriving these would recreate the divergence portfolio_access ended."""
    seen = []
    for name, attr in (('parent', 'is_parent_of'), ('advisor', 'is_advisor_of'),
                       ('observer', 'is_observer_of'), ('teacher', 'teaches_student'),
                       ('peer', 'is_peer_of')):
        monkeypatch.setattr(f'utils.portfolio_access.{attr}',
                            lambda c, t, _n=name: seen.append(_n) or True)
        assert RELATIONSHIPS[name](CALLER, STUDENT) is True
    assert seen == ['parent', 'advisor', 'observer', 'teacher', 'peer']


# --- FERPA disclosure logging (SEC-15) ---------------------------------------

def _disclosing_view(allow, discloses='portfolio'):
    @require_relationship_to('student_id', allow=allow, discloses=discloses)
    def view(**kwargs):
        return 'ok'

    return view


def test_a_disclosure_is_logged_with_the_relationship_that_allowed_it(app, monkeypatch):
    """The purpose is the point.

    "Someone with access looked" is not an answer a school can give a family.
    A parent reading their own child and an org admin reading the same record
    are different events in a disclosure report, and the gate is the only place
    that knows which one just happened.
    """
    calls = []
    monkeypatch.setattr('utils.access_logger.AccessLogger.log_student_data_access',
                        lambda **kw: calls.append(kw) or True)
    monkeypatch.setitem(RELATIONSHIPS, 'parent', lambda c, t: True)

    view = _disclosing_view(('parent',))
    with app.test_request_context('/api/parent/children/x'):
        assert view(student_id=STUDENT) == 'ok'

    assert len(calls) == 1
    assert calls[0]['student_id'] == STUDENT
    assert calls[0]['accessor_id'] == CALLER
    assert calls[0]['data_type'] == 'portfolio'
    assert calls[0]['purpose'] == 'parent_request'


def test_the_same_route_logs_a_different_purpose_for_a_different_relationship(
        app, monkeypatch):
    calls = []
    monkeypatch.setattr('utils.access_logger.AccessLogger.log_student_data_access',
                        lambda **kw: calls.append(kw) or True)
    monkeypatch.setitem(RELATIONSHIPS, 'parent', lambda c, t: False)
    monkeypatch.setitem(RELATIONSHIPS, 'org_staff', lambda c, t: True)

    view = _disclosing_view(('parent', 'org_staff'))
    with app.test_request_context('/api/sis/students/x'):
        view(student_id=STUDENT)

    assert calls[0]['purpose'] == 'legitimate_educational_interest'


def test_reading_your_own_record_is_not_a_disclosure(app, monkeypatch):
    """`self` is the one relationship that discloses nothing.

    Logging it would bury the disclosures that matter under every student who
    opened their own portfolio.
    """
    calls = []
    monkeypatch.setattr('utils.access_logger.AccessLogger.log_student_data_access',
                        lambda **kw: calls.append(kw) or True)

    view = _disclosing_view(('self',))
    with app.test_request_context('/'):
        assert view(student_id=CALLER) == 'ok'

    assert calls == []


def test_platform_staff_access_is_logged_as_admin_review(app, monkeypatch):
    """The staff bypass is a disclosure too, and the least self-evident one."""
    calls = []
    monkeypatch.setattr('utils.access_logger.AccessLogger.log_student_data_access',
                        lambda **kw: calls.append(kw) or True)
    monkeypatch.setitem(RELATIONSHIPS, 'parent', lambda c, t: False)
    monkeypatch.setattr('utils.auth.relationships._is_platform_staff',
                        lambda _caller: True)

    view = _disclosing_view(('parent',))
    with app.test_request_context('/'):
        view(student_id=STUDENT)

    assert calls[0]['purpose'] == 'admin_review'


def test_a_route_that_does_not_declare_discloses_logs_nothing(app, monkeypatch):
    """Opt-in, deliberately. A write route is not a disclosure of a record, and
    logging all 113 declared routes would drown the log in non-events."""
    calls = []
    monkeypatch.setattr('utils.access_logger.AccessLogger.log_student_data_access',
                        lambda **kw: calls.append(kw) or True)
    monkeypatch.setitem(RELATIONSHIPS, 'parent', lambda c, t: True)

    view, _ = _view(('parent',))
    with app.test_request_context('/'):
        view(student_id=STUDENT)

    assert calls == []


def test_a_broken_disclosure_log_does_not_break_the_read(app, monkeypatch):
    """A compliance log that can take the feature down with it gets deleted the
    first time it misfires, and then there is no log at all."""
    monkeypatch.setattr('utils.access_logger.AccessLogger.log_student_data_access',
                        lambda **kw: (_ for _ in ()).throw(RuntimeError('log down')))
    monkeypatch.setitem(RELATIONSHIPS, 'parent', lambda c, t: True)

    view = _disclosing_view(('parent',))
    with app.test_request_context('/'):
        assert view(student_id=STUDENT) == 'ok'


def test_a_denied_caller_is_not_logged_as_a_disclosure(app, monkeypatch):
    """Nothing was disclosed, so nothing is a disclosure. An access log that
    records attempts as accesses cannot be used to answer "who saw this"."""
    calls = []
    monkeypatch.setattr('utils.access_logger.AccessLogger.log_student_data_access',
                        lambda **kw: calls.append(kw) or True)
    monkeypatch.setitem(RELATIONSHIPS, 'parent', lambda c, t: False)

    view = _disclosing_view(('parent',))
    with app.test_request_context('/'):
        with pytest.raises(AuthorizationError):
            view(student_id=STUDENT)

    assert calls == []
