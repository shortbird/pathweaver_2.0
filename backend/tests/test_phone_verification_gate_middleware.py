"""
The phone-verification hold, enforced on the API rather than only in the router.

Same scrutiny as test_signature_gate_middleware, for the same reason: the
allowlist is the dangerous half. Too small and an adult is stranded on a
verification screen whose own calls 403 — locked out with no way to verify and
no way to leave. Too large and the hold does not hold.
"""

from unittest.mock import patch

import pytest
from flask import Flask, jsonify

from middleware.phone_verification_gate import PhoneVerificationGate


HELD = 'adult-1'


@pytest.fixture
def client():
    app = Flask(__name__)
    PhoneVerificationGate().init_app(app)

    for rule in ('/api/quests', '/api/sis/people',
                 '/api/phone-verification/status',
                 '/api/phone-verification/send-code',
                 '/api/phone-verification/verify',
                 '/api/auth/me', '/api/auth/logout', '/api/auth/csrf-token',
                 '/api/admin/masquerade/exit', '/api/health'):
        app.add_url_rule(rule, rule, lambda **kw: jsonify({'ok': True}),
                         methods=['GET', 'POST', 'OPTIONS'])
    return app.test_client()


def _as_held(blocked=True, user_id=HELD):
    """Patch the two things the middleware asks: who is calling, and are they held."""
    return (
        patch('middleware.phone_verification_gate.session_manager.get_effective_user_id',
              return_value=user_id),
        patch('middleware.phone_verification_gate.phone_verification_hold.is_blocked',
              return_value=blocked),
    )


def _get(client, path, blocked=True, user_id=HELD, method='get'):
    who, held = _as_held(blocked, user_id)
    with who, held:
        return getattr(client, method)(path)


@pytest.mark.unit
class TestTheHoldHolds:

    def test_a_held_adult_is_refused_the_rest_of_the_platform(self, client):
        r = _get(client, '/api/quests')
        assert r.status_code == 403
        # Machine-readable code: the client keys off it to route to the
        # verification screen instead of showing "something went wrong".
        assert r.get_json()['code'] == 'phone_verification_required'

    def test_the_message_says_what_to_do(self, client):
        assert 'phone' in _get(client, '/api/quests').get_json()['error'].lower()

    def test_writes_are_refused_too(self, client):
        assert _get(client, '/api/quests', method='post').status_code == 403

    def test_the_sis_console_is_held_too(self, client):
        """Staff are IN scope for this hold (unlike the signature gate), and
        staff live on /api/sis — a gate that spared it would not hold teachers."""
        assert _get(client, '/api/sis/people').status_code == 403


@pytest.mark.unit
class TestTheWayOut:
    """Everything a held adult needs to (a) stay logged in and (b) verify a
    phone. If any of these 403s, the hold is a dead end."""

    @pytest.mark.parametrize('path', [
        '/api/phone-verification/status',      # what the screen renders from
        '/api/phone-verification/send-code',   # getting the text
        '/api/phone-verification/verify',      # typing it back
        '/api/auth/me',
        '/api/auth/csrf-token',
        '/api/auth/logout',                    # never trap someone in a session
        '/api/health',
    ])
    def test_stays_reachable(self, client, path):
        assert _get(client, path).status_code == 200

    def test_verifying_is_reachable_as_a_write(self, client):
        r = _get(client, '/api/phone-verification/verify', method='post')
        assert r.status_code == 200

    def test_an_admin_can_still_leave_a_masquerade_into_a_held_adult(self, client):
        """The hold applies inside a masquerade on purpose — it is what the
        adult sees. But the EXIT belongs to the admin (same entry, same reason
        as the signature gate)."""
        r = _get(client, '/api/admin/masquerade/exit', method='post')
        assert r.status_code == 200


@pytest.mark.unit
class TestEverybodyElse:

    def test_a_verified_adult_is_untouched(self, client):
        assert _get(client, '/api/quests', blocked=False).status_code == 200

    def test_an_anonymous_request_is_left_to_the_routes_own_decorator(self, client):
        assert _get(client, '/api/quests', user_id=None).status_code == 200

    def test_a_cors_preflight_is_never_gated(self, client):
        assert _get(client, '/api/quests', method='options').status_code == 200

    def test_a_broken_gate_does_not_take_the_platform_down(self, client):
        """Fail open, in step with the hold itself. No bug in a feature that
        asks one org's adults for a phone number should 403 everybody."""
        with patch('middleware.phone_verification_gate.session_manager.get_effective_user_id',
                   return_value=HELD), \
             patch('middleware.phone_verification_gate.phone_verification_hold.is_blocked',
                   side_effect=RuntimeError('gate exploded')):
            assert client.get('/api/quests').status_code == 200
