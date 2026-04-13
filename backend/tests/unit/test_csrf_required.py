"""C4 regression: CSRF must be a hard requirement in production.

These tests assert two invariants:
1. The /csrf-token route returns 500 (not a misleading 200 with csrf_enabled=false)
   when the CSRF module is unavailable in production.
2. The /csrf-token route still returns 200 in development for a smooth local
   workflow when contributors haven't installed Flask-WTF yet.

We don't try to actually break the import of Flask-WTF at runtime — instead
we patch the `CSRF_AVAILABLE` flag on the app module and flip FLASK_ENV.
"""
import importlib

import pytest


@pytest.fixture
def app_module():
    import app as app_module
    return app_module


def test_csrf_token_route_returns_500_in_production_when_unavailable(client, app_module, monkeypatch):
    """Prod + missing CSRF must surface as 500 so monitoring catches it,
    instead of the previous 200 that silently degraded clients."""
    monkeypatch.setenv('FLASK_ENV', 'production')
    monkeypatch.setattr(app_module, 'CSRF_AVAILABLE', False)

    response = client.get('/csrf-token')
    assert response.status_code == 500
    body = response.get_json()
    assert body['csrf_enabled'] is False
    assert 'error' in body


def test_csrf_token_route_returns_200_in_development_when_unavailable(client, app_module, monkeypatch):
    """Dev tolerates a missing CSRF module so contributors can iterate."""
    monkeypatch.setenv('FLASK_ENV', 'development')
    monkeypatch.setattr(app_module, 'CSRF_AVAILABLE', False)

    response = client.get('/csrf-token')
    assert response.status_code == 200
    body = response.get_json()
    assert body['csrf_enabled'] is False
    assert body['module_available'] is False


def test_csrf_token_route_returns_token_when_module_available(client, app_module):
    """Sanity: with Flask-WTF installed (default), we get a real token."""
    if not app_module.CSRF_AVAILABLE:
        pytest.skip("Flask-WTF not installed in this environment")
    response = client.get('/csrf-token')
    assert response.status_code == 200
    body = response.get_json()
    assert body['csrf_enabled'] is True
    assert isinstance(body['csrf_token'], str) and len(body['csrf_token']) > 10
