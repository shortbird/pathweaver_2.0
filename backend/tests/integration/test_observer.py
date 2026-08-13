"""Integration tests for observer access control.

Observers are the read-only role: a grandparent or mentor a student shares work
with. Every boundary here is a FERPA-adjacent one -- an observer must see
exactly the students linked to them and nothing else -- so these run against a
real database and assert on the link table that actually gates access.

Ported 2026-08-13. The originals could not run (an `execute_sql` RPC that has
never existed, a `test_schema` the app never reads, `session['user_id']` auth
that require_auth ignores) AND they targeted an API that no longer exists:
`/api/observers/invite` was replaced by generate-link / parent-invite /
family-invite. They are rewritten here against the current routes rather than
translated. See backend/tests/integration/README.md.
"""

import uuid

import pytest

pytestmark = pytest.mark.requires_db


@pytest.fixture
def observer(make_user):
    return make_user(role='observer')


@pytest.fixture
def link_observer(db):
    """Link an observer to a student, as accepting an invitation would."""
    def _link(observer_id, student_id, can_comment=True, can_view_evidence=True):
        row = {
            'observer_id': observer_id,
            'student_id': student_id,
            'can_comment': can_comment,
            'can_view_evidence': can_view_evidence,
        }
        db.table('observer_student_links').insert(row).execute()
        return row

    return _link


def _comment(client, headers, student_id, text='Nice work on this.'):
    return client.post('/api/observers/comments', headers=headers, json={
        'student_id': student_id,
        'comment_text': text,
    })


# Posting comments


@pytest.mark.integration
@pytest.mark.critical
def test_linked_observer_with_permission_can_comment(
    client, db, observer, student, link_observer, auth_headers_for
):
    link_observer(observer['id'], student['id'], can_comment=True)

    response = _comment(client, auth_headers_for(observer['id']), student['id'])

    assert response.status_code == 200
    rows = db.table('observer_comments').select('observer_id, student_id, comment_text') \
        .eq('student_id', student['id']).execute().data
    assert len(rows) == 1
    assert rows[0]['observer_id'] == observer['id']


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_unlinked_observer_cannot_comment(client, db, observer, student, auth_headers_for):
    """No link, no access. This is the whole control."""
    response = _comment(client, auth_headers_for(observer['id']), student['id'])

    assert response.status_code == 403
    assert db.table('observer_comments').select('id').execute().data == []


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_link_without_comment_permission_cannot_comment(
    client, db, observer, student, link_observer, auth_headers_for
):
    """can_comment=False means view-only, not merely a hidden button."""
    link_observer(observer['id'], student['id'], can_comment=False)

    response = _comment(client, auth_headers_for(observer['id']), student['id'])

    assert response.status_code == 403
    assert db.table('observer_comments').select('id').execute().data == []


@pytest.mark.integration
@pytest.mark.authorization
def test_a_link_to_one_student_grants_nothing_over_another(
    client, db, observer, make_user, link_observer, auth_headers_for
):
    """The link is per student. Holding one must not leak the next."""
    linked_student = make_user(role='student')
    other_student = make_user(role='student')
    link_observer(observer['id'], linked_student['id'], can_comment=True)

    response = _comment(client, auth_headers_for(observer['id']), other_student['id'])

    assert response.status_code == 403
    assert db.table('observer_comments').select('id') \
        .eq('student_id', other_student['id']).execute().data == []


@pytest.mark.integration
def test_superadmin_can_comment_without_a_link(client, make_user, student, auth_headers_for):
    superadmin = make_user(role='superadmin')

    response = _comment(client, auth_headers_for(superadmin['id']), student['id'])

    assert response.status_code == 200


@pytest.mark.integration
@pytest.mark.parametrize('payload, why', [
    ({'comment_text': 'no student'}, 'missing student_id'),
    ({'student_id': str(uuid.uuid4())}, 'missing comment_text'),
])
def test_comment_requires_student_and_text(
    client, observer, student, link_observer, auth_headers_for, payload, why
):
    link_observer(observer['id'], student['id'])

    response = client.post(
        '/api/observers/comments',
        headers=auth_headers_for(observer['id']),
        json=payload,
    )

    assert response.status_code == 400, why


@pytest.mark.integration
def test_comment_length_is_capped(client, db, observer, student, link_observer, auth_headers_for):
    link_observer(observer['id'], student['id'])

    response = _comment(client, auth_headers_for(observer['id']), student['id'], 'x' * 2001)

    assert response.status_code == 400
    assert db.table('observer_comments').select('id').execute().data == []


@pytest.mark.integration
def test_a_comment_at_the_limit_is_accepted(client, observer, student, link_observer, auth_headers_for):
    """2000 is allowed; 2001 is not. Pin the boundary, not just the rejection."""
    link_observer(observer['id'], student['id'])

    response = _comment(client, auth_headers_for(observer['id']), student['id'], 'x' * 2000)

    assert response.status_code == 200


# Reading comments


@pytest.mark.integration
def test_a_student_can_read_comments_on_their_own_work(
    client, observer, student, link_observer, auth_headers_for
):
    link_observer(observer['id'], student['id'])
    _comment(client, auth_headers_for(observer['id']), student['id'], 'Well argued.')

    response = client.get(
        f'/api/observers/student/{student["id"]}/comments',
        headers=auth_headers_for(student['id']),
    )

    assert response.status_code == 200
    assert 'Well argued.' in response.get_data(as_text=True)


@pytest.mark.integration
def test_a_linked_observer_can_read_the_comment_thread(
    client, observer, student, link_observer, auth_headers_for
):
    link_observer(observer['id'], student['id'])
    _comment(client, auth_headers_for(observer['id']), student['id'])

    response = client.get(
        f'/api/observers/student/{student["id"]}/comments',
        headers=auth_headers_for(observer['id']),
    )

    assert response.status_code == 200


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_an_unlinked_observer_cannot_read_the_comment_thread(
    client, observer, student, auth_headers_for
):
    response = client.get(
        f'/api/observers/student/{student["id"]}/comments',
        headers=auth_headers_for(observer['id']),
    )

    assert response.status_code == 403


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_one_student_cannot_read_another_students_comments(
    client, make_user, auth_headers_for
):
    subject = make_user(role='student')
    snooper = make_user(role='student')

    response = client.get(
        f'/api/observers/student/{subject["id"]}/comments',
        headers=auth_headers_for(snooper['id']),
    )

    assert response.status_code == 403


# Deleting comments


@pytest.mark.integration
@pytest.mark.authorization
def test_an_observer_cannot_delete_another_observers_comment(
    client, db, make_user, student, link_observer, auth_headers_for
):
    author = make_user(role='observer')
    intruder = make_user(role='observer')
    link_observer(author['id'], student['id'])
    link_observer(intruder['id'], student['id'])

    posted = _comment(client, auth_headers_for(author['id']), student['id'])
    assert posted.status_code == 200
    comment_id = db.table('observer_comments').select('id').execute().data[0]['id']

    response = client.delete(
        f'/api/observers/comments/{comment_id}',
        headers=auth_headers_for(intruder['id']),
    )

    assert response.status_code == 403
    # And the comment survives.
    assert db.table('observer_comments').select('id').eq('id', comment_id).execute().data


@pytest.mark.integration
def test_an_observer_can_delete_their_own_comment(
    client, db, observer, student, link_observer, auth_headers_for
):
    link_observer(observer['id'], student['id'])
    _comment(client, auth_headers_for(observer['id']), student['id'])
    comment_id = db.table('observer_comments').select('id').execute().data[0]['id']

    response = client.delete(
        f'/api/observers/comments/{comment_id}',
        headers=auth_headers_for(observer['id']),
    )

    assert response.status_code == 200
    assert db.table('observer_comments').select('id').eq('id', comment_id).execute().data == []


# Anonymous access


@pytest.mark.integration
@pytest.mark.security
@pytest.mark.parametrize('method, path', [
    ('post', '/api/observers/comments'),
    ('get', '/api/observers/my-students'),
    ('get', '/api/observers/pending-invitations'),
    ('post', '/api/observers/generate-link'),
])
def test_observer_endpoints_reject_anonymous_callers(client, method, path):
    response = getattr(client, method)(path, json={})

    assert response.status_code == 401
