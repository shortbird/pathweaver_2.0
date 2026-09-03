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
