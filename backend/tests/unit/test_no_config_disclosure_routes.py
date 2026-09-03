"""Guard: no unauthenticated route may hand out server configuration.

Two of these have shipped and been deleted. They are easy to reintroduce
because each looked like a harmless diagnostic:

  - /test-config (C5)          leaked the Supabase URL prefix and key-existence
                               flags, and opened an unauthenticated Supabase
                               connection on every hit (DoS amplifier).
  - /api/auth/cookie-debug     leaked FLASK_ENV, the cookie secure/samesite/
    (SEC-02, 2026-08 audit)    domain settings, FRONTEND_URL and the backend
                               host, to anyone, with no auth at all.

`/api/auth/token-health` is the supported diagnostic: it answers "is my auth
reaching the server, over which transport" and returns no configuration.

Adding a debug endpoint? It either requires superadmin or returns nothing
about the server. Otherwise add it to this list on the way out.
"""

import pytest

RETIRED_DISCLOSURE_ROUTES = [
    '/test-config',
    '/api/auth/cookie-debug',
]


@pytest.mark.parametrize('path', RETIRED_DISCLOSURE_ROUTES)
def test_retired_disclosure_route_does_not_exist(client, path):
    assert client.get(path).status_code == 404


def test_token_health_is_still_the_supported_diagnostic(client):
    """Sanity: the replacement diagnostic survived, and discloses no config."""
    response = client.get('/api/auth/token-health')
    assert response.status_code == 200

    body = response.get_json()
    assert body['authenticated'] is False
    # Anonymous callers learn nothing about how the server is configured.
    leaks = {'frontend_url', 'backend_url', 'environment', 'cookie_domain',
             'cookie_samesite', 'cookie_secure', 'cross_origin_mode'}
    assert not leaks & set(body)


@pytest.mark.requires_db
def test_health_route_still_exists(client):
    """Sanity: removing the debug routes must not have broken /api/health."""
    response = client.get('/api/health')
    assert response.status_code == 200
