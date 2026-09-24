"""
The honey-record watch: a response carrying a trap id to anyone but a
superadmin is reported, and nothing about the response changes.

The dangerous directions are a watch that stays quiet on a real leak and a
watch that breaks or alters a response. Both are pinned here.
"""

from unittest.mock import patch

import pytest
from flask import Flask, Response, jsonify, request

from middleware.canary_watch import CanaryWatch

HONEY = '0b6f3c1e-7d2a-4e59-9c3b-5a8e1f2d4c70'


@pytest.fixture
def app():
    app = Flask(__name__)
    CanaryWatch(ids=(HONEY.encode(),)).init_app(app)

    def as_user():
        request.user_id = request.headers.get('X-Test-User')

    @app.route('/api/leaky')
    def leaky():
        as_user()
        return jsonify({'students': [{'id': HONEY.upper()}, {'id': 'other'}]})

    @app.route('/api/clean')
    def clean():
        as_user()
        return jsonify({'students': [{'id': 'other'}]})

    @app.route('/api/text')
    def text():
        as_user()
        return Response(HONEY, mimetype='text/plain')

    return app


def _get(app, path, user='u-1'):
    with app.test_client() as c:
        return c.get(path, headers={'X-Test-User': user} if user else {})


def test_leak_to_a_non_superadmin_is_reported(app):
    with patch('middleware.canary_watch._caller_role', return_value='org_managed'), \
         patch('sentry_sdk.capture_message') as capture:
        resp = _get(app, '/api/leaky')
    assert resp.status_code == 200
    assert capture.call_count == 1
    assert 'GET /api/leaky' in capture.call_args.args[0]
    assert capture.call_args.kwargs['level'] == 'error'


def test_leak_to_an_anonymous_caller_is_reported(app):
    with patch('middleware.canary_watch._caller_role') as role, \
         patch('sentry_sdk.capture_message') as capture:
        _get(app, '/api/leaky', user=None)
    role.assert_not_called()
    assert capture.call_count == 1


def test_superadmin_is_exempt(app):
    with patch('middleware.canary_watch._caller_role', return_value='superadmin'), \
         patch('sentry_sdk.capture_message') as capture:
        _get(app, '/api/leaky')
    capture.assert_not_called()


def test_unknown_role_counts_as_a_leak(app):
    # A failed role lookup must not hide a leak.
    with patch('middleware.canary_watch._caller_role', return_value=None), \
         patch('sentry_sdk.capture_message') as capture:
        _get(app, '/api/leaky')
    assert capture.call_count == 1


def test_clean_and_non_json_responses_are_ignored(app):
    with patch('middleware.canary_watch._caller_role') as role, \
         patch('sentry_sdk.capture_message') as capture:
        _get(app, '/api/clean')
        _get(app, '/api/text')
    role.assert_not_called()
    capture.assert_not_called()


def test_response_is_unchanged_on_a_hit(app):
    with patch('middleware.canary_watch._caller_role', return_value='student'), \
         patch('sentry_sdk.capture_message'):
        resp = _get(app, '/api/leaky')
    assert resp.get_json()['students'][0]['id'] == HONEY.upper()


def test_a_failing_report_never_breaks_the_response(app):
    with patch('middleware.canary_watch._caller_role', return_value='student'), \
         patch('sentry_sdk.capture_message', side_effect=RuntimeError('down')):
        resp = _get(app, '/api/leaky')
    assert resp.status_code == 200


def test_unset_config_means_off(monkeypatch):
    from app_config import Config
    monkeypatch.setattr(Config, 'CANARY_RECORD_IDS', '', raising=False)
    assert CanaryWatch().ids == ()
    monkeypatch.setattr(Config, 'CANARY_RECORD_IDS', f' {HONEY.upper()} , ,x ')
    assert CanaryWatch().ids == (HONEY.encode(), b'x')
