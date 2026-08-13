"""Integration smoke tests for the core API surface.

Thin on purpose: health, the quest list, and the authentication boundary on a
few representative endpoints. Deep behaviour lives in the focused files
(test_auth_flow, test_quest_completion, test_observer, ...).

Ported 2026-08-13. The original was mock-based despite living in
tests/integration and being marked requires_db -- it patched
`mock_supabase`/`mock_verify_token` and then asserted on the mock, so it would
have passed against a database that did not exist. Half its endpoints
(/api/users/dashboard, /api/users/profile, /api/users/completed-quests,
/api/admin/ai-review-queue, POST /api/quests) have since been removed, and
those tests are gone rather than rewritten against invented URLs.
See backend/tests/integration/README.md.
"""

import pytest

pytestmark = pytest.mark.requires_db


@pytest.mark.integration
@pytest.mark.critical
def test_health_reports_the_database_as_reachable(client):
    """/api/health is what the post-deploy smoke check polls, and it pings the
    database -- so against a live stack it must come back healthy, not merely
    respond."""
    response = client.get('/api/health')

    assert response.status_code == 200
    body = response.get_json() or {}
    assert body, 'health returned no JSON body'
    text = response.get_data(as_text=True).lower()
    assert 'unhealthy' not in text and 'error' not in text, text[:300]


@pytest.mark.integration
def test_health_names_the_running_commit(client):
    """release.yml's smoke job waits for /api/health to report the deployed SHA.
    If the field disappears, that job waits 20 minutes and then fails the
    release for the wrong reason."""
    body = client.get('/api/health').get_json() or {}

    assert 'commit' in body, f'health payload lost its commit field: {sorted(body)}'


@pytest.mark.integration
def test_the_quest_list_is_public(client):
    """Browsing quests deliberately needs no account -- it is the shop window.
    Pinned so the intent is explicit: if a future change adds @require_auth
    here, that is a product decision, not an accident.
    """
    response = client.get('/api/quests')

    assert response.status_code == 200


@pytest.mark.integration
def test_an_authenticated_student_can_list_quests(client, student, auth_headers_for):
    response = client.get('/api/quests', headers=auth_headers_for(student['id']))

    assert response.status_code == 200


@pytest.mark.integration
def test_an_active_quest_appears_in_the_list(client, student, make_quest, auth_headers_for):
    # The listing filters is_active AND is_public; a quest missing either is
    # invisible, which is easy to mistake for a broken endpoint.
    quest = make_quest(title='Findable Quest', is_active=True, is_public=True)

    response = client.get('/api/quests', headers=auth_headers_for(student['id']))

    assert response.status_code == 200
    assert quest['id'] in response.get_data(as_text=True)


@pytest.mark.integration
@pytest.mark.security
@pytest.mark.parametrize('method, path', [
    ('get', '/api/auth/me'),
    ('get', '/api/dependents/my-dependents'),
    ('get', '/api/observers/my-students'),
    ('get', '/api/admin/users'),
])
def test_protected_endpoints_reject_anonymous_callers(client, method, path):
    """One sweep across the surfaces, so a route that loses its @require_auth in
    a refactor fails here even if its own file's tests are still green."""
    response = getattr(client, method)(path)

    assert response.status_code == 401, f'{method.upper()} {path} served an anonymous caller'
