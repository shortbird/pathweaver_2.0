"""Tests for GET /api/admin/users/<id>/connections.

This endpoint exists to replace a client-side loop in the admin user-details
modal that fetched every advisor and then every advisor's whole roster, just to
learn whether one user appeared in any of them — 1 + N requests per modal open,
with six of the seven calls wrapped in silent `catch {}`, so any failure
rendered as "No connections" and looked exactly like a user who had none.

So the two things worth pinning down are: the query count does not grow with
the number of advisors, and a database failure is a 500 rather than an empty
list.

Calls the undecorated view (functools.wraps -> __wrapped__) in a request
context with the admin client mocked.
"""

from unittest.mock import Mock, patch

import pytest
from flask import Flask

ADMIN_ID = 'admin-1'
# A real UUID, because this id is the one that reaches a PostgREST filter
# string: the view ORs it across advisor_student_assignments,
# parent_student_links and observer_student_links, whose *_id columns are all
# `uuid` in Postgres. utils.validation.sanitizers.pgrst_uuid proves the value is
# a UUID before interpolating it, so a comma in it can never end the clause and
# start another one. The other ids below stay readable shorthand -- they are row
# data and `in_()` arguments, and never reach a filter string.
USER_ID = '33333333-3333-4333-8333-333333333333'


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    return app


def _mock_supabase(assignments=(), parent_links=(), observer_links=(), users=()):
    """One mock per table, each answering the single chain the view uses."""
    tables = {}

    for name, rows in (
        ('advisor_student_assignments', assignments),
        ('parent_student_links', parent_links),
        ('observer_student_links', observer_links),
    ):
        table = Mock()
        chain = table.select.return_value.or_.return_value
        # advisor_student_assignments adds .eq('is_active', True); the other two
        # execute straight off .or_(). Wire both so one helper serves all three.
        chain.execute.return_value = Mock(data=list(rows))
        chain.eq.return_value.execute.return_value = Mock(data=list(rows))
        tables[name] = table

    users_table = Mock()
    users_table.select.return_value.in_.return_value.execute.return_value = Mock(data=list(users))
    tables['users'] = users_table

    supabase = Mock()
    supabase.table.side_effect = lambda name: tables[name]
    return supabase, tables


def _call(app, supabase):
    from routes.admin.user_management import get_user_connections

    with app.test_request_context(), \
         patch('routes.admin.user_management.get_supabase_admin_client', return_value=supabase):
        response, status = get_user_connections.__wrapped__(ADMIN_ID, USER_ID)
    return response.get_json(), status


def test_returns_links_in_both_directions(app):
    supabase, _ = _mock_supabase(
        assignments=[
            # This user teaches student-9...
            {'id': 'a1', 'advisor_id': USER_ID, 'student_id': 'student-9', 'assigned_at': '2026-01-01'},
            # ...and is taught by advisor-3.
            {'id': 'a2', 'advisor_id': 'advisor-3', 'student_id': USER_ID, 'assigned_at': '2026-01-02'},
        ],
        parent_links=[
            {'id': 'p1', 'parent_user_id': USER_ID, 'student_user_id': 'kid-1', 'created_at': '2026-01-03'},
            {'id': 'p2', 'parent_user_id': 'mom-1', 'student_user_id': USER_ID, 'created_at': '2026-01-04'},
        ],
        observer_links=[
            {'id': 'o1', 'observer_id': USER_ID, 'student_id': 'watched-1', 'created_at': '2026-01-05'},
            {'id': 'o2', 'observer_id': 'watcher-1', 'student_id': USER_ID, 'created_at': '2026-01-06'},
        ],
        users=[
            {'id': 'student-9', 'first_name': 'Sam', 'last_name': 'Lee', 'email': 'sam@example.com'},
            {'id': 'advisor-3', 'first_name': 'Ada', 'last_name': 'Ng', 'email': 'ada@example.com'},
            {'id': 'kid-1', 'first_name': 'Kid', 'last_name': 'One', 'email': 'kid@example.com'},
            {'id': 'mom-1', 'first_name': 'Mom', 'last_name': 'One', 'email': 'mom@example.com'},
            {'id': 'watched-1', 'display_name': 'Watched', 'email': 'w@example.com'},
            {'id': 'watcher-1', 'display_name': 'Watcher', 'email': 'o@example.com'},
        ],
    )

    body, status = _call(app, supabase)

    assert status == 200
    by_direction = {c['direction']: c for c in body['data']['connections']}
    assert set(by_direction) == {'student', 'advisor', 'child', 'parent', 'observing', 'observed_by'}
    assert by_direction['student']['person']['name'] == 'Sam Lee'
    assert by_direction['advisor']['person']['name'] == 'Ada Ng'
    # Advisor rows carry both ids so the client can call the existing
    # DELETE /advisors/<advisor_id>/students/<student_id>.
    assert by_direction['advisor']['advisor_id'] == 'advisor-3'
    assert by_direction['advisor']['student_id'] == USER_ID
    # Everything else deletes by link id.
    assert by_direction['child']['link_id'] == 'p1'
    assert by_direction['observed_by']['link_id'] == 'o2'
    # display_name is the fallback when there is no first/last name.
    assert by_direction['observing']['person']['name'] == 'Watched'


def test_query_count_does_not_grow_with_advisor_count(app):
    """THE regression: four table reads regardless of how many links exist."""
    assignments = [
        {'id': f'a{i}', 'advisor_id': f'advisor-{i}', 'student_id': USER_ID, 'assigned_at': None}
        for i in range(25)
    ]
    users = [
        {'id': f'advisor-{i}', 'first_name': 'A', 'last_name': str(i), 'email': f'a{i}@example.com'}
        for i in range(25)
    ]
    supabase, _ = _mock_supabase(assignments=assignments, users=users)

    body, status = _call(app, supabase)

    assert status == 200
    assert len(body['data']['connections']) == 25
    # advisor_student_assignments, parent_student_links, observer_student_links,
    # users — and nothing per advisor.
    assert supabase.table.call_count == 4


def test_no_links_is_an_empty_list_not_an_error(app):
    supabase, _ = _mock_supabase()

    body, status = _call(app, supabase)

    assert status == 200
    assert body['data']['connections'] == []
    # No counterparts to resolve, so the users table is never read.
    assert supabase.table.call_count == 3


def test_database_failure_surfaces_as_500(app):
    """The old client-side version swallowed this and rendered "No connections"."""
    supabase, tables = _mock_supabase()
    tables['advisor_student_assignments'].select.side_effect = RuntimeError('boom')

    body, status = _call(app, supabase)

    assert status == 500
    assert body['success'] is False
