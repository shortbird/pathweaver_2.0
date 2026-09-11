"""Integration tests for org announcements.

Announcements fan out to every member of an organization, so the boundary that
matters is the organization one: a member of org A must never receive or create
an announcement in org B.

Ported 2026-08-13 -- see backend/tests/integration/README.md.

REPOINTED 2026-09-11, and the reason is worth keeping. "One announcement
composer, not three" (fd5f13e1) deleted `POST /api/announcements` and
`services/announcement_service.create_*` outright; posting now goes through
`POST /api/sis/community/announcements` and lands in `sis_announcements`. That
commit updated the unit tests that covered the old route and did not update this
file, because everything here is `requires_db` and never runs on a developer's
machine -- so six tests sat asserting against a route that answers 405, and the
first thing to notice was the release gate.

The assertions are the same questions asked of the endpoint that now answers
them. Two things genuinely changed shape, and are NOT papered over:

  * Reading stayed where it was. `GET /api/announcements` survives with
    `@require_role(*STAFF_ROLES, 'student', 'parent')`, so the member-facing
    reads below still point at it. Only the write moved.
  * A body is no longer required. `sis_community_service.create_announcement`
    validates the title and defaults the body to empty, so the old
    parametrize over ['title', 'message'] would have been asserting a rule the
    product does not have. It tests the title alone, and this paragraph is why
    the second case is gone rather than quietly deleted.
"""

import pytest

pytestmark = pytest.mark.requires_db

# Where each half of the feature lives since fd5f13e1. Named rather than
# inlined, because the whole failure this file just had was a URL drifting
# away from its test.
POST_URL = '/api/sis/community/announcements'
READ_URL = '/api/announcements'


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
    payload = {'title': 'Snow day', 'body': 'Campus is closed tomorrow.'}
    payload.update(overrides)
    return client.post(POST_URL, headers=headers, json=payload)


# Creating


@pytest.mark.integration
@pytest.mark.critical
def test_an_org_admin_can_post_an_announcement(client, db, org, org_admin, auth_headers_for):
    response = _announce(client, auth_headers_for(org_admin['id']))

    assert response.status_code in (200, 201), response.get_data(as_text=True)

    rows = db.table('sis_announcements').select(
        'title, organization_id, created_by').execute().data
    assert len(rows) == 1
    assert rows[0]['title'] == 'Snow day'
    # Stamped with the author's org, not one supplied by the caller.
    assert rows[0]['organization_id'] == org['id']
    assert rows[0]['created_by'] == org_admin['id']


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_student_cannot_post_an_announcement(client, db, org_student, auth_headers_for):
    """Announcements notify the whole org. A student broadcasting to every
    family is a megaphone, not a feature."""
    response = _announce(client, auth_headers_for(org_student['id']))

    assert response.status_code == 403
    assert db.table('sis_announcements').select('id').execute().data == []


@pytest.mark.integration
def test_an_announcement_requires_a_title(client, db, org_admin, auth_headers_for):
    """A body is optional by design -- see the module docstring. The title is
    the only field the service refuses to default."""
    response = client.post(
        POST_URL,
        headers=auth_headers_for(org_admin['id']),
        json={'body': 'Campus is closed tomorrow.'},
    )

    assert response.status_code == 400
    assert db.table('sis_announcements').select('id').execute().data == []


@pytest.mark.integration
@pytest.mark.security
def test_the_author_cannot_post_into_another_organization(
    client, db, org_admin, make_org, auth_headers_for
):
    """organization_id comes from the authenticated author, never the body."""
    other_org = make_org(name='Somewhere Else')

    _announce(client, auth_headers_for(org_admin['id']), organization_id=other_org['id'])

    rows = db.table('sis_announcements').select('organization_id').execute().data
    assert all(r['organization_id'] != other_org['id'] for r in rows), \
        'caller-supplied organization_id was trusted'


# Reading


@pytest.mark.integration
@pytest.mark.critical
def test_a_member_sees_their_own_orgs_announcements(client, org_admin, org_student, auth_headers_for):
    _announce(client, auth_headers_for(org_admin['id']), title='Field trip')

    response = client.get(READ_URL, headers=auth_headers_for(org_student['id']))

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

    response = client.get(READ_URL, headers=auth_headers_for(outsider['id']))

    assert response.status_code == 200
    assert 'Internal only' not in response.get_data(as_text=True)


# Anonymous access


@pytest.mark.integration
@pytest.mark.security
@pytest.mark.parametrize('method, url', [('get', READ_URL), ('post', POST_URL)])
def test_announcement_endpoints_reject_anonymous_callers(client, method, url):
    """Both halves are gated, which is the point of asserting it on each one
    separately now that they live in different blueprints."""
    response = getattr(client, method)(url, json={})

    assert response.status_code == 401
