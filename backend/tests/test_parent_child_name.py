"""
A guardian correcting a child's name (PUT /api/parent/children/<id>/name).

Before this route existed, a parent whose family was roster-imported
surname-first had nowhere to fix it: `PUT /api/dependents/<id>` takes
display_name and only covers under-13 dependents, and a linked student's own
account settings were the only editor for their first/last name — which is not
somewhere a guardian can go. Hearthwood Academy, 2026-08-25.

What these tests pin:
  - the route declares @require_relationship_to('student_id', allow=('parent',))
    — observers are view-only and this WRITES to a minor's record — and that
    gate actually refuses a non-guardian before the view runs;
  - it writes first_name, last_name and a display_name derived from them, and
    nothing else — no role, email, or organization can ride along.

The view is called fully undecorated, with an explicit user_id -- which is what
@require_auth would have injected; a real Flask request context supplies the
body. Unwrapping is a loop rather than a single __wrapped__ because SEC-10 added
@require_relationship_to('student_id', allow=('parent',)) to this route, so the
stack is three deep now. That gate resolves the guardian link against the
database for real, which no unit test should need a connection for; it has its
own tests in tests/unit/test_require_relationship_to.py, and
tests/unit/test_id_routes_declare_relationship.py proves this route still
declares it. What is pinned HERE is the inner check and the write payload.
"""

import json
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

import app  # noqa: F401 — import graph ordering
from middleware.error_handler import AuthorizationError
from routes.parent import child_profile
from utils.auth.relationships import ENFORCED_ATTR


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
CHILD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

# The view under test, without @require_auth / @validate_uuid_param /
# @require_relationship_to.
def _undecorated(fn):
    while hasattr(fn, '__wrapped__'):
        fn = fn.__wrapped__
    return fn


view = _undecorated(child_profile.update_child_name)


def _supabase_capturing_update(captured):
    """A supabase double that records the .update() payload it is handed."""
    def update(payload):
        captured['payload'] = payload
        chain = MagicMock()
        chain.eq.return_value.execute.return_value = MagicMock(data=[{
            'id': CHILD,
            'first_name': payload.get('first_name'),
            'last_name': payload.get('last_name'),
            'display_name': payload.get('display_name'),
            'avatar_url': None,
        }])
        return chain

    table = MagicMock()
    table.update.side_effect = update
    supabase = MagicMock()
    supabase.table.return_value = table
    return supabase


def _call(body):
    """Run the undecorated view against `body`. Returns (payload, status, captured)."""
    captured = {}
    supabase = _supabase_capturing_update(captured)
    flask_app = Flask(__name__)
    with flask_app.test_request_context(
        f'/api/parent/children/{CHILD}/name', method='PUT',
        data=json.dumps(body), content_type='application/json',
    ), patch.object(child_profile, 'get_supabase_admin_client', return_value=supabase):
        response, status = view(PARENT, CHILD)
    return response.get_json(), status, captured


def test_derives_display_name_from_first_and_last():
    payload, status, captured = _call({'first_name': ' Nathan ', 'last_name': ' Hanna '})

    assert status == 200
    assert captured['payload'] == {
        'first_name': 'Nathan',
        'last_name': 'Hanna',
        'display_name': 'Nathan Hanna',
    }
    assert payload['student']['display_name'] == 'Nathan Hanna'


def test_swapping_the_two_is_the_whole_point():
    """The reported case: "Hanna Nathan" corrected to "Nathan Hanna"."""
    _, status, captured = _call({'first_name': 'Nathan', 'last_name': 'Hanna'})
    assert status == 200
    assert captured['payload']['first_name'] == 'Nathan'
    assert captured['payload']['last_name'] == 'Hanna'


def test_writes_nothing_but_the_name():
    """Mass-assignment guard: extra keys in the body must not reach the update."""
    _, status, captured = _call({
        'first_name': 'Nathan', 'last_name': 'Hanna',
        'role': 'superadmin', 'email': 'attacker@example.com',
        'organization_id': 'someone-elses-org', 'total_xp': 999999,
        'is_dependent': False, 'managed_by_parent_id': PARENT,
    })

    assert status == 200
    assert set(captured['payload']) == {'first_name', 'last_name', 'display_name'}


@pytest.mark.parametrize('body', [
    {'first_name': 'Nathan'},
    {'last_name': 'Hanna'},
    {'first_name': '  ', 'last_name': 'Hanna'},
    {'first_name': 'Nathan', 'last_name': ''},
    {},
])
def test_both_names_are_required(body):
    payload, status, captured = _call(body)

    assert status == 400
    assert 'payload' not in captured
    assert payload['success'] is False


def test_overlong_names_are_rejected():
    _, status, captured = _call({'first_name': 'N' * 200, 'last_name': 'Hanna'})
    assert status == 400
    assert 'payload' not in captured


def test_the_route_admits_guardians_only():
    """Observers may read a student's work; they may not rewrite their name.

    SEC-10 moved this from an allow_observer=False argument inside the body to a
    declaration on the route, so it is now asserted where it is stated.
    """
    param, allow = getattr(child_profile.update_child_name, ENFORCED_ATTR)
    assert param == 'student_id'
    assert allow == ('parent',), \
        "a write to a minor's record must not admit observers"


def _run_gated(is_parent):
    """Drive the route THROUGH the relationship gate. Returns (result, captured)."""
    captured = {}
    supabase = _supabase_capturing_update(captured)
    flask_app = Flask(__name__)
    # Past @require_auth (which needs a real session); @validate_uuid_param and
    # the relationship gate beneath it both still run.
    gated = child_profile.update_child_name.__wrapped__

    with flask_app.test_request_context(
        f'/api/parent/children/{CHILD}/name', method='PUT',
        data=json.dumps({'first_name': 'Nathan', 'last_name': 'Hanna'}),
        content_type='application/json',
    ), patch.object(child_profile, 'get_supabase_admin_client', return_value=supabase), \
            patch('utils.auth.relationships.authorizing_user_id', return_value=PARENT), \
            patch('utils.auth.relationships._is_platform_staff', return_value=False), \
            patch('utils.portfolio_access.is_parent_of', return_value=is_parent):
        if not is_parent:
            with pytest.raises(AuthorizationError):
                gated(PARENT, student_id=CHILD)
            return None, captured
        return gated(PARENT, student_id=CHILD), captured


def test_denied_when_not_a_guardian():
    """The gate refuses before the view runs, so nothing reaches the update.

    Exercised through the real decorator rather than a patched helper: the
    caller resolves, is not the child's guardian, and is not Optio staff.
    """
    _, captured = _run_gated(is_parent=False)
    assert 'payload' not in captured, "the update must not run when access is refused"


def test_a_guardian_gets_through_the_gate():
    """The mirror of the above -- the gate is not simply refusing everyone."""
    (_response, status), captured = _run_gated(is_parent=True)
    assert status == 200
    assert captured['payload']['display_name'] == 'Nathan Hanna'
