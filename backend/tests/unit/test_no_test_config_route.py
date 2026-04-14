"""C5 regression: /test-config must not exist.

The old /test-config route was unauthenticated, leaked configuration metadata
(Supabase URL prefix, key existence flags), and triggered an unauthenticated
Supabase connection on every hit (DoS amplifier). It is deleted; this test
ensures it is not silently re-introduced.
"""


def test_test_config_route_does_not_exist(client):
    response = client.get('/test-config')
    assert response.status_code == 404


def test_health_route_still_exists(client):
    """Sanity: removing /test-config must not have broken /api/health."""
    response = client.get('/api/health')
    assert response.status_code == 200
