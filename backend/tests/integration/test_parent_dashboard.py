"""Integration tests for parent access to a child's record.

The single question these answer: can a parent reach a child who is not theirs?

Ported 2026-08-13. This file needed more than a mechanical port -- most of what
it tested no longer exists. `/api/parents/invite` and
`/api/evidence/helper/upload-for-student` have both been removed; parent-driven
observer invites now live at `/api/observers/parent-invite`, and the read-only
child record at `/api/sis/parent/students/<id>/record`. Tests for deleted
endpoints were dropped rather than rewritten against invented URLs, and the
dependent-management assertions that survived are covered properly in
test_dependents.py instead of duplicated here.

See backend/tests/integration/README.md.
"""

import uuid

import pytest

pytestmark = pytest.mark.requires_db


@pytest.fixture
def make_dependent(db):
    """A child account owned by `parent_id`.

    Same shape the app builds (see test_dependents.py): stub auth account on a
    placeholder address, public.users row with a NULL email, because
    `check_dependent_no_email` requires it.
    """
    def _make(parent_id, display_name='Test Child', **fields):
        auth_user = db.auth.admin.create_user({
            'email': f'dependent_{uuid.uuid4().hex}@optio-internal-placeholder.local',
            'email_confirm': False,
        })
        row = {
            'id': auth_user.user.id,
            'display_name': display_name,
            'first_name': display_name.split()[0],
            'last_name': ' '.join(display_name.split()[1:]) or 'Child',
            'email': None,
            'role': 'student',
            'is_dependent': True,
            'managed_by_parent_id': parent_id,
        }
        row.update(fields)
        db.table('users').insert(row).execute()
        return row

    return _make


@pytest.fixture
def link_parent(db):
    """An approved parent/student link, as accepting an invitation would make."""
    def _link(parent_id, student_id, status='approved'):
        # Columns are parent_user_id / student_user_id. Three route modules had
        # this as parent_id / student_id, which does not exist -- fixed
        # 2026-08-13 after this suite surfaced the 42703.
        row = {
            'parent_user_id': parent_id,
            'student_user_id': student_id,
            'status': status,
        }
        db.table('parent_student_links').insert(row).execute()
        return row

    return _link


# Parent-initiated observer invitations


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_parent_cannot_invite_an_observer_for_an_unrelated_child(
    client, parent, make_user, auth_headers_for
):
    """Inviting an observer grants a third party ongoing sight of a child's
    work. Doing it for someone else's child is the worst case in this system."""
    stranger = make_user(role='student')

    response = client.post(
        '/api/observers/parent-invite',
        headers=auth_headers_for(parent['id']),
        json={
            'student_id': stranger['id'],
            'observer_email': 'someone@example.com',
            'observer_name': 'Someone',
        },
    )

    assert response.status_code == 403


@pytest.mark.integration
def test_parent_invite_requires_a_student_id(client, parent, auth_headers_for):
    response = client.post(
        '/api/observers/parent-invite',
        headers=auth_headers_for(parent['id']),
        json={'observer_email': 'someone@example.com'},
    )

    assert response.status_code == 400


@pytest.mark.integration
@pytest.mark.authorization
def test_a_parent_sees_only_their_own_childs_pending_invitations(
    client, parent, make_user, auth_headers_for
):
    stranger = make_user(role='student')

    response = client.get(
        f'/api/observers/parent-invitations/{stranger["id"]}',
        headers=auth_headers_for(parent['id']),
    )

    assert response.status_code == 403


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_parent_cannot_list_observers_on_an_unrelated_child(
    client, parent, make_user, auth_headers_for
):
    stranger = make_user(role='student')

    response = client.get(
        f'/api/observers/student/{stranger["id"]}/observers',
        headers=auth_headers_for(parent['id']),
    )

    assert response.status_code == 403


@pytest.mark.integration
def test_a_parent_can_list_observers_on_their_own_dependent(
    client, parent, make_dependent, auth_headers_for
):
    child = make_dependent(parent['id'])

    response = client.get(
        f'/api/observers/student/{child["id"]}/observers',
        headers=auth_headers_for(parent['id']),
    )

    assert response.status_code == 200


# The read-only student record


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_parent_cannot_read_an_unrelated_childs_record(
    client, parent, make_user, auth_headers_for
):
    stranger = make_user(role='student')

    response = client.get(
        f'/api/sis/parent/students/{stranger["id"]}/record',
        headers=auth_headers_for(parent['id']),
    )

    assert response.status_code == 403


@pytest.mark.integration
@pytest.mark.authorization
def test_a_student_cannot_read_another_students_record_through_the_parent_route(
    client, make_user, auth_headers_for
):
    subject = make_user(role='student')
    snooper = make_user(role='student')

    response = client.get(
        f'/api/sis/parent/students/{subject["id"]}/record',
        headers=auth_headers_for(snooper['id']),
    )

    assert response.status_code == 403


@pytest.mark.integration
@pytest.mark.authorization
def test_a_link_to_one_child_does_not_open_another(
    client, parent, make_user, make_dependent, link_parent, auth_headers_for
):
    """Holding one approved link must not become a skeleton key."""
    own_child = make_dependent(parent['id'])
    link_parent(parent['id'], own_child['id'])
    stranger = make_user(role='student')

    response = client.get(
        f'/api/sis/parent/students/{stranger["id"]}/record',
        headers=auth_headers_for(parent['id']),
    )

    assert response.status_code == 403


# Anonymous access


@pytest.mark.integration
@pytest.mark.security
@pytest.mark.parametrize('method, path', [
    ('post', '/api/observers/parent-invite'),
    ('get', '/api/observers/family-observers'),
])
def test_parent_endpoints_reject_anonymous_callers(client, method, path):
    response = getattr(client, method)(path, json={})

    assert response.status_code == 401
