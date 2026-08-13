"""Integration tests for parent-managed dependent accounts.

A dependent is a child account a parent creates and controls (`is_dependent`,
`managed_by_parent_id`). The boundary that matters: a parent may act on their
own dependents and no one else's. These run against a real database.

Ported 2026-08-13 -- see backend/tests/integration/README.md for what was wrong
with the originals.
"""

import uuid

import pytest

pytestmark = pytest.mark.requires_db


@pytest.fixture
def make_dependent(db):
    """A child account owned by `parent_id`.

    Mirrors DependentRepository.create_dependent exactly, because the schema
    enforces the shape: `check_dependent_no_email` requires
    is_dependent=false OR email IS NULL, and public.users.id is FK'd to
    auth.users(id). So a dependent is a stub auth account on a placeholder
    address plus a public.users row with a NULL email -- COPPA: the child has
    no login and no contactable address of their own.
    """
    def _make(parent_id, display_name='Test Child', **fields):
        placeholder = f'dependent_{uuid.uuid4().hex}@optio-internal-placeholder.local'
        auth_user = db.auth.admin.create_user({
            'email': placeholder,
            'email_confirm': False,
            'user_metadata': {'is_dependent': True, 'managed_by_parent_id': parent_id},
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


def _create_payload(**overrides):
    """Body for POST /api/dependents/create.

    Note there are two creation endpoints with different contracts: `/create`
    takes display_name (the COPPA dependent profile) while `/add-child` takes
    first_name/last_name/email and branches on age. These target `/create`.
    """
    payload = {
        'display_name': 'Test Child',
        'date_of_birth': '2018-05-04',
    }
    payload.update(overrides)
    return payload


# Creating


@pytest.mark.integration
@pytest.mark.critical
def test_a_parent_can_create_a_dependent(client, db, parent, auth_headers_for):
    response = client.post(
        '/api/dependents/create',
        headers=auth_headers_for(parent['id']),
        json=_create_payload(display_name='Ada'),
    )

    assert response.status_code in (200, 201), response.get_data(as_text=True)

    rows = db.table('users').select('id, display_name, is_dependent, managed_by_parent_id') \
        .eq('managed_by_parent_id', parent['id']).execute().data
    assert len(rows) == 1
    assert rows[0]['display_name'] == 'Ada'
    # Both flags matter: is_dependent drives the UI, managed_by_parent_id is the
    # authorization edge. A row with one and not the other is a security hole.
    assert rows[0]['is_dependent'] is True


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_student_cannot_create_a_dependent(client, db, student, auth_headers_for):
    """Only parents manage children. A student minting dependents would be an
    unbounded account-creation primitive."""
    response = client.post(
        '/api/dependents/create',
        headers=auth_headers_for(student['id']),
        json=_create_payload(),
    )

    assert response.status_code == 403
    assert db.table('users').select('id').eq('managed_by_parent_id', student['id']).execute().data == []


@pytest.mark.integration
@pytest.mark.parametrize('missing', ['display_name', 'date_of_birth'])
def test_creating_a_dependent_requires_name_and_birthdate(client, parent, auth_headers_for, missing):
    payload = _create_payload()
    del payload[missing]

    response = client.post(
        '/api/dependents/create',
        headers=auth_headers_for(parent['id']),
        json=payload,
    )

    assert response.status_code == 400


@pytest.mark.integration
def test_creating_a_dependent_rejects_a_malformed_birthdate(client, parent, auth_headers_for):
    response = client.post(
        '/api/dependents/create',
        headers=auth_headers_for(parent['id']),
        json=_create_payload(date_of_birth='05/04/2018'),
    )

    assert response.status_code == 400


# Listing and reading


@pytest.mark.integration
@pytest.mark.critical
def test_my_dependents_returns_only_this_parents_children(
    client, parent, make_user, make_dependent, auth_headers_for
):
    mine = make_dependent(parent['id'], display_name='Mine')
    other_parent = make_user(role='parent')
    theirs = make_dependent(other_parent['id'], display_name='Theirs')

    response = client.get('/api/dependents/my-dependents', headers=auth_headers_for(parent['id']))

    assert response.status_code == 200
    body = response.get_data(as_text=True)
    assert mine['id'] in body
    assert theirs['id'] not in body, "another parent's child leaked into the list"


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_parent_cannot_read_another_parents_dependent(
    client, parent, make_user, make_dependent, auth_headers_for
):
    other_parent = make_user(role='parent')
    theirs = make_dependent(other_parent['id'])

    response = client.get(
        f'/api/dependents/{theirs["id"]}',
        headers=auth_headers_for(parent['id']),
    )

    assert response.status_code in (403, 404)


@pytest.mark.integration
def test_a_parent_can_read_their_own_dependent(client, parent, make_dependent, auth_headers_for):
    child = make_dependent(parent['id'], display_name='Grace Hopper')

    response = client.get(
        f'/api/dependents/{child["id"]}',
        headers=auth_headers_for(parent['id']),
    )

    assert response.status_code == 200
    assert 'Grace' in response.get_data(as_text=True)


# Updating and deleting


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_parent_cannot_update_another_parents_dependent(
    client, db, parent, make_user, make_dependent, auth_headers_for
):
    other_parent = make_user(role='parent')
    theirs = make_dependent(other_parent['id'], display_name='Untouched')

    response = client.put(
        f'/api/dependents/{theirs["id"]}',
        headers=auth_headers_for(parent['id']),
        json={'display_name': 'Hijacked'},
    )

    assert response.status_code in (403, 404)
    row = db.table('users').select('display_name').eq('id', theirs['id']).execute().data[0]
    assert row['display_name'] == 'Untouched'


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_updating_a_dependent_cannot_change_its_owner(
    client, db, parent, make_user, make_dependent, auth_headers_for
):
    """Re-parenting a child by request body would let anyone adopt any account."""
    attacker = make_user(role='parent')
    child = make_dependent(parent['id'])

    client.put(
        f'/api/dependents/{child["id"]}',
        headers=auth_headers_for(parent['id']),
        json={'managed_by_parent_id': attacker['id'], 'role': 'superadmin'},
    )

    row = db.table('users').select('managed_by_parent_id, role') \
        .eq('id', child['id']).execute().data[0]
    assert row['managed_by_parent_id'] == parent['id']
    assert row['role'] != 'superadmin'


@pytest.mark.integration
@pytest.mark.authorization
def test_a_parent_cannot_delete_another_parents_dependent(
    client, db, parent, make_user, make_dependent, auth_headers_for
):
    other_parent = make_user(role='parent')
    theirs = make_dependent(other_parent['id'])

    response = client.delete(
        f'/api/dependents/{theirs["id"]}',
        headers=auth_headers_for(parent['id']),
    )

    assert response.status_code in (403, 404)
    assert db.table('users').select('id').eq('id', theirs['id']).execute().data


# Promotion to a standalone account


@pytest.mark.integration
@pytest.mark.security
def test_promoting_a_dependent_rejects_a_weak_password(
    client, parent, make_dependent, auth_headers_for
):
    child = make_dependent(parent['id'])

    response = client.post(
        f'/api/dependents/{child["id"]}/promote',
        headers=auth_headers_for(parent['id']),
        json={'email': f'grown_{uuid.uuid4().hex[:8]}@example.com', 'password': 'weak'},
    )

    assert response.status_code == 400


@pytest.mark.integration
def test_promoting_a_dependent_requires_an_email(client, parent, make_dependent, auth_headers_for):
    child = make_dependent(parent['id'])

    response = client.post(
        f'/api/dependents/{child["id"]}/promote',
        headers=auth_headers_for(parent['id']),
        json={'password': 'StrongP@ssw0rd123!'},
    )

    assert response.status_code == 400


@pytest.mark.integration
@pytest.mark.authorization
def test_a_parent_cannot_promote_another_parents_dependent(
    client, parent, make_user, make_dependent, auth_headers_for
):
    other_parent = make_user(role='parent')
    theirs = make_dependent(other_parent['id'])

    response = client.post(
        f'/api/dependents/{theirs["id"]}/promote',
        headers=auth_headers_for(parent['id']),
        json={'email': f'x_{uuid.uuid4().hex[:8]}@example.com', 'password': 'StrongP@ssw0rd123!'},
    )

    assert response.status_code in (403, 404)


# Acting as a dependent


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_parent_cannot_act_as_another_parents_dependent(
    client, parent, make_user, make_dependent, auth_headers_for
):
    """An acting-as token is a full session for the child. Issuing one for
    somebody else's child is account takeover."""
    other_parent = make_user(role='parent')
    theirs = make_dependent(other_parent['id'])

    response = client.post(
        f'/api/dependents/{theirs["id"]}/act-as',
        headers=auth_headers_for(parent['id']),
        json={},
    )

    assert response.status_code in (403, 404)


@pytest.mark.integration
@pytest.mark.authorization
def test_a_student_cannot_act_as_a_dependent(
    client, student, parent, make_dependent, auth_headers_for
):
    child = make_dependent(parent['id'])

    response = client.post(
        f'/api/dependents/{child["id"]}/act-as',
        headers=auth_headers_for(student['id']),
        json={},
    )

    assert response.status_code in (403, 404)


# Anonymous access


@pytest.mark.integration
@pytest.mark.security
@pytest.mark.parametrize('method, path', [
    ('get', '/api/dependents/my-dependents'),
    ('post', '/api/dependents/create'),
])
def test_dependent_endpoints_reject_anonymous_callers(client, method, path):
    response = getattr(client, method)(path, json={})

    assert response.status_code == 401
