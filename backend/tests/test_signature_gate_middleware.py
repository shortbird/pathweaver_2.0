"""
The hold, enforced on the API rather than only in the router.

A gate that lives in the web app's router is a suggestion: the API is reachable
from a stale tab, from the mobile app, and from a terminal. So the rule is
enforced in middleware, and this is where the allowlist gets its scrutiny.

The allowlist is the dangerous half. Too small and the family is stranded on a
screen they cannot complete — locked out with no way to sign and no way to
leave. Too large and the hold does not hold. Both directions are tested here,
because both have been the failure in gates like this one.
"""

from unittest.mock import patch

import pytest
from flask import Flask, jsonify

from middleware.signature_gate import SignatureGate


HELD = 'parent-1'


@pytest.fixture
def client():
    app = Flask(__name__)
    SignatureGate().init_app(app)

    # A few real-shaped routes to aim at.
    for rule in ('/api/quests', '/api/sis/parent/context',
                 '/api/sis/parent/required-documents',
                 '/api/sis/parent/onboarding',
                 '/api/sis/parent/onboarding/<aid>/items/<key>',
                 '/api/sis/parent/my-documents/<doc_id>/url',
                 '/api/auth/me', '/api/auth/logout', '/api/auth/csrf-token',
                 '/api/admin/masquerade/exit', '/api/health'):
        app.add_url_rule(rule, rule, lambda **kw: jsonify({'ok': True}),
                         methods=['GET', 'POST', 'PATCH', 'OPTIONS'])
    return app.test_client()


def _as_held(blocked=True, user_id=HELD):
    """Patch the two things the middleware asks: who is calling, and are they held."""
    return (
        patch('middleware.signature_gate.session_manager.get_effective_user_id',
              return_value=user_id),
        patch('middleware.signature_gate.signature_hold.is_blocked',
              return_value=blocked),
    )


def _get(client, path, blocked=True, user_id=HELD, method='get'):
    who, held = _as_held(blocked, user_id)
    with who, held:
        return getattr(client, method)(path)


@pytest.mark.unit
class TestTheHoldHolds:

    def test_a_held_family_is_refused_the_rest_of_the_platform(self, client):
        r = _get(client, '/api/quests')
        assert r.status_code == 403
        # A machine-readable code, not a bare 403: the client has to be able to
        # tell "sign this" from an ordinary permission error, or the family is
        # shown "something went wrong" and has no idea what to do.
        assert r.get_json()['code'] == 'signature_required'

    def test_the_message_says_what_to_do(self, client):
        assert 'sign' in _get(client, '/api/quests').get_json()['error'].lower()

    def test_writes_are_refused_too(self, client):
        assert _get(client, '/api/quests', method='post').status_code == 403


@pytest.mark.unit
class TestTheWayOut:
    """Everything a held family needs to (a) stay logged in, (b) see what must
    be signed, (c) read it, and (d) sign it. If any of these 403s, the hold is
    a dead end."""

    @pytest.mark.parametrize('path', [
        '/api/sis/parent/required-documents',   # what must be signed
        '/api/sis/parent/onboarding',           # the checklist behind it
        '/api/sis/parent/onboarding/a-1/items/sign',  # signing itself
        '/api/sis/parent/my-documents/doc-1/url',     # reading the document
        '/api/sis/parent/context',              # the org the calls above need
        '/api/auth/me',
        '/api/auth/csrf-token',
        '/api/auth/logout',                     # never trap someone in a session
        '/api/health',
    ])
    def test_stays_reachable(self, client, path):
        assert _get(client, path).status_code == 200

    def test_signing_is_reachable_as_a_write(self, client):
        r = _get(client, '/api/sis/parent/onboarding/a-1/items/sign', method='patch')
        assert r.status_code == 200

    def test_an_admin_can_still_leave_a_masquerade_into_a_held_family(self, client):
        """The hold applies inside a masquerade on purpose — it is what the
        parent sees. But the EXIT belongs to the admin, and gating it would
        strand them in an account they can neither use nor leave."""
        r = _get(client, '/api/admin/masquerade/exit', method='post')
        assert r.status_code == 200


@pytest.mark.unit
class TestEverybodyElse:

    def test_a_family_with_nothing_outstanding_is_untouched(self, client):
        assert _get(client, '/api/quests', blocked=False).status_code == 200

    def test_an_anonymous_request_is_left_to_the_routes_own_decorator(self, client):
        assert _get(client, '/api/quests', user_id=None).status_code == 200

    def test_a_cors_preflight_is_never_gated(self, client):
        assert _get(client, '/api/quests', method='options').status_code == 200

    def test_a_broken_gate_does_not_take_the_platform_down(self, client):
        """Fail open, in step with the service. No bug in a feature that holds
        one family over one document should be able to 403 everybody."""
        with patch('middleware.signature_gate.session_manager.get_effective_user_id',
                   return_value=HELD), \
             patch('middleware.signature_gate.signature_hold.is_blocked',
                   side_effect=RuntimeError('gate exploded')):
            assert client.get('/api/quests').status_code == 200
