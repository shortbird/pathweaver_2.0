"""Integration tests for org announcements.

Announcements fan out to every member of an organization, so the boundary that
matters is the organization one: a member of org A must never receive or create
an announcement in org B.

Ported 2026-08-13 -- see backend/tests/integration/README.md.
"""

import pytest

pytestmark = pytest.mark.requires_db


@pytest.fixture
def org(make_org):
    return make_org(name='Test Academy')


@pytest.fixture
def org_admin(make_user, org):
    """An org admin. Org users carry role='org_managed' with the real role in
    org_role -- see the role table in CLAUDE.md."""
    return make_user(role='org_managed', org_role='org_admin', organization_id=org['id'])


@pytest.fixture
def org_student(make_user, org):
    return make_user(role='org_managed', org_role='student', organization_id=org['id'])


def _announce(client, headers, **overrides):
    payload = {'title': 'Snow day', 'message': 'Campus is closed tomorrow.'}
    payload.update(overrides)
    return client.post('/api/announcements', headers=headers, json=payload)


# Creating


@pytest.mark.integration
@pytest.mark.critical
def test_an_org_admin_can_post_an_announcement(client, db, org, org_admin, auth_headers_for):
    response = _announce(client, auth_headers_for(org_admin['id']))

    assert response.status_code in (200, 201), response.get_data(as_text=True)

    rows = db.table('announcements').select('title, organization_id, author_id').execute().data
    assert len(rows) == 1
    assert rows[0]['title'] == 'Snow day'
    # Stamped with the author's org, not one supplied by the caller.
    assert rows[0]['organization_id'] == org['id']
    assert rows[0]['author_id'] == org_admin['id']


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_student_cannot_post_an_announcement(client, db, org_student, auth_headers_for):
    """Announcements notify the whole org. A student broadcasting to every
    family is a megaphone, not a feature."""
    response = _announce(client, auth_headers_for(org_student['id']))

    assert response.status_code == 403
    assert db.table('announcements').select('id').execute().data == []


@pytest.mark.integration
@pytest.mark.parametrize('missing', ['title', 'message'])
def test_an_announcement_requires_a_title_and_a_message(
    client, db, org_admin, auth_headers_for, missing
):
    payload = {'title': 'Snow day', 'message': 'Campus is closed tomorrow.'}
    del payload[missing]

    response = client.post(
        '/api/announcements',
        headers=auth_headers_for(org_admin['id']),
        json=payload,
    )

    assert response.status_code == 400
    assert db.table('announcements').select('id').execute().data == []


@pytest.mark.integration
@pytest.mark.security
def test_the_author_cannot_post_into_another_organization(
    client, db, org_admin, make_org, auth_headers_for
):
    """organization_id comes from the authenticated author, never the body."""
    other_org = make_org(name='Somewhere Else')

    _announce(client, auth_headers_for(org_admin['id']), organization_id=other_org['id'])

    rows = db.table('announcements').select('organization_id').execute().data
    assert all(r['organization_id'] != other_org['id'] for r in rows), \
        'caller-supplied organization_id was trusted'


# Reading


@pytest.mark.integration
@pytest.mark.critical
def test_a_member_sees_their_own_orgs_announcements(client, org_admin, org_student, auth_headers_for):
    _announce(client, auth_headers_for(org_admin['id']), title='Field trip')

    response = client.get('/api/announcements', headers=auth_headers_for(org_student['id']))

    assert response.status_code == 200
    assert 'Field trip' in response.get_data(as_text=True)


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_announcements_do_not_leak_across_organizations(
    client, org_admin, make_org, make_user, auth_headers_for
):
    _announce(client, auth_headers_for(org_admin['id']), title='Internal only')

    other_org = make_org(name='Rival Academy')
    outsider = make_user(role='org_managed', org_role='student', organization_id=other_org['id'])

    response = client.get('/api/announcements', headers=auth_headers_for(outsider['id']))

    assert response.status_code == 200
    assert 'Internal only' not in response.get_data(as_text=True)


# Anonymous access


@pytest.mark.integration
@pytest.mark.security
@pytest.mark.parametrize('method', ['get', 'post'])
def test_announcement_endpoints_reject_anonymous_callers(client, method):
    response = getattr(client, method)('/api/announcements', json={})

    assert response.status_code == 401
