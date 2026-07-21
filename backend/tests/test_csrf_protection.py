"""
Regression tests for CSRF enforcement on cookie-authenticated requests.

Background (2026-07-21): the security audit added a before_request hook that
enforces CSRF on cookie-authenticated mutating requests. Its per-view
exemption check was broken in two independent ways:

  1. init_csrf() runs BEFORE blueprints are registered in app.py, so resolving
     app.view_functions at init time exempted nothing.
  2. Flask-WTF's csrf.exempt() records the view's dotted path in
     csrf._exempt_views — it does NOT set an attribute on the view — and
     csrf.protect() (called manually by the hook) never consults that registry,
     so getattr(view, '_csrf_exempt', False) was always False.

Net effect: every endpoint in the exemption list was still CSRF-enforced for
any browser carrying auth cookies. The iCreate registration funnel logs
parents into the platform mid-funnel (and existing parents arrive signed in),
so a parent returning from Stripe checkout hit "CSRF token missing or invalid"
on the payment-verification call.

The fix resolves exemptions by ENDPOINT NAME at request time
(CSRF_EXEMPT_ENDPOINTS) and additionally honors @csrf.exempt decorators via
Flask-WTF's registry. These tests build the app in the same order app.py does
(init_csrf first, blueprints after) to prove order-independence.
"""

import os
from unittest.mock import patch

import pytest
from flask import Flask, jsonify

os.environ.setdefault('FLASK_ENV', 'testing')
os.environ.setdefault('FLASK_SECRET_KEY', 'csrf-test-secret-key-0123456789-abcdefgh')


@pytest.fixture
def app():
    from middleware.csrf_protection import init_csrf, csrf
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = os.environ['FLASK_SECRET_KEY']

    # Same order as app.py: CSRF middleware FIRST, blueprints AFTER.
    init_csrf(app)

    from routes import icreate_registration
    app.register_blueprint(icreate_registration.bp)

    @app.route('/api/protected-example', methods=['POST'])
    def protected_example():
        return jsonify({'ok': True})

    @app.route('/api/decorator-exempt-example', methods=['POST'])
    @csrf.exempt
    def decorator_exempt_example():
        return jsonify({'ok': True})

    return app


@pytest.fixture
def client(app):
    return app.test_client()


AUTH_COOKIE = {'access_token': 'some-session-token'}


def _set_cookies(client, cookies):
    for k, v in cookies.items():
        client.set_cookie(k, v)


def test_cookie_auth_post_without_token_is_rejected(client):
    """A cookie-authenticated mutating request without a CSRF token gets the
    structured 400 the frontend auto-recovery keys off of."""
    _set_cookies(client, AUTH_COOKIE)
    res = client.post('/api/protected-example', json={})
    assert res.status_code == 400
    assert res.get_json()['csrf_required'] is True


def test_post_without_cookies_passes(client):
    """Pre-session requests carry no ambient authority — no CSRF check."""
    res = client.post('/api/protected-example', json={})
    assert res.status_code == 200


def test_bearer_auth_post_passes(client):
    """Bearer-authenticated requests are immune to CSRF — no check."""
    res = client.post('/api/protected-example', json={},
                      headers={'Authorization': 'Bearer abc'})
    assert res.status_code == 200


def test_decorator_exempt_view_passes_with_cookies(client):
    """@csrf.exempt decorators (e.g. OAuth callbacks) must be honored even
    though Flask-WTF only records them in csrf._exempt_views."""
    _set_cookies(client, AUTH_COOKIE)
    res = client.post('/api/decorator-exempt-example', json={})
    assert res.status_code == 200


def test_icreate_confirm_payment_exempt_with_auth_cookies(client):
    """THE regression: a signed-in parent returning from Stripe checkout must
    not be CSRF-blocked on payment verification. The route's own authz (the
    per-registration access_token) still runs — 403 here proves the request
    got PAST the CSRF gate and into the view."""
    _set_cookies(client, AUTH_COOKIE)
    with patch('routes.icreate_registration._load_registration', return_value=None):
        res = client.post('/api/icreate/registrations/some-reg-id/confirm-payment',
                          json={'access_token': 'wrong'})
    assert res.status_code == 403
    assert 'csrf_required' not in (res.get_json() or {})


def test_all_icreate_funnel_endpoints_are_exempt(app):
    """Every mutating iCreate funnel endpoint must be in the exemption list —
    the wizard runs with platform auth cookies present (it logs new parents in
    mid-funnel; existing parents arrive signed in)."""
    from middleware.csrf_protection import CSRF_EXEMPT_ENDPOINTS
    funnel_endpoints = {
        rule.endpoint
        for rule in app.url_map.iter_rules()
        if rule.endpoint.startswith('icreate_registration.')
        and 'POST' in (rule.methods or set())
    }
    missing = funnel_endpoints - CSRF_EXEMPT_ENDPOINTS
    assert not missing, f'iCreate funnel endpoints not CSRF-exempt: {sorted(missing)}'


def test_exemption_is_endpoint_name_based_not_view_resolution(app):
    """Guard against the init-order regression: exemption must not depend on
    view functions existing at init_csrf() time."""
    from middleware.csrf_protection import _is_csrf_exempt
    # Endpoint of a blueprint registered AFTER init_csrf ran.
    assert _is_csrf_exempt(app, 'icreate_registration.confirm_payment')
    # Unknown endpoints are not exempt.
    assert not _is_csrf_exempt(app, 'icreate_registration.nope')
    assert not _is_csrf_exempt(app, None)
