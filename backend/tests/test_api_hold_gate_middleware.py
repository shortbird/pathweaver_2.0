"""
The holds, enforced on the API rather than only in the router.

A gate that lives in the web app's router is a suggestion: the API is reachable
from a stale tab, from the mobile app, and from a terminal. So the rule is
enforced in middleware, and this is where the allow-list gets its scrutiny.

The allow-list is the dangerous half. Too small and a person is stranded on a
screen whose own calls 403 -- locked out with no way to sign or verify and no
way to leave. Too large and the hold does not hold. Both directions are tested
here, for both holds, because both have been the failure in gates like this
one. Until M3 (docs/sis/CONSOLIDATION_PLAN.md) this was two middlewares and two
copies of this file; every case from both is kept below, plus the one only a
single gate can have: a person under both holds can reach both flows.
"""

from unittest.mock import patch

import pytest
from flask import Flask, jsonify

from middleware.api_hold_gate import ALLOWED_PREFIXES, ApiHoldGate, HOLDS


HELD = 'parent-1'

SIGNING_FLOW = [
    '/api/sis/parent/required-documents',   # what must be signed
    '/api/sis/parent/onboarding',           # the checklist behind it
    '/api/sis/parent/onboarding/a-1/items/sign',  # signing itself
    '/api/sis/parent/my-documents/doc-1/url',     # reading the document
    '/api/sis/parent/context',              # the org the calls above need
]
VERIFYING_FLOW = [
    '/api/phone-verification/status',       # the screen's own read (and prefill)
    '/api/phone-verification/send-code',
    '/api/phone-verification/verify',
]
STAYING_LOGGED_IN = [
    '/api/auth/me',
    '/api/auth/csrf-token',
    '/api/auth/logout',                     # never trap someone in a session
    '/api/health',
]


@pytest.fixture
def client():
    app = Flask(__name__)
    ApiHoldGate().init_app(app)

    # A few real-shaped routes to aim at.
    for rule in ('/api/quests', '/api/sis/people', '/api/sis/parent/context',
                 '/api/sis/parent/required-documents',
                 '/api/sis/parent/onboarding',
                 '/api/sis/parent/onboarding/<aid>/items/<key>',
                 '/api/sis/parent/my-documents/<doc_id>/url',
                 '/api/phone-verification/status',
                 '/api/phone-verification/send-code',
                 '/api/phone-verification/verify',
                 '/api/auth/me', '/api/auth/logout', '/api/auth/csrf-token',
                 '/api/admin/masquerade/exit', '/api/health'):
        app.add_url_rule(rule, rule, lambda **kw: jsonify({'ok': True}),
                         methods=['GET', 'POST', 'PATCH', 'OPTIONS'])
    return app.test_client()


def _as(signature=False, phone=False, user_id=HELD):
    """Patch the things the middleware asks: who is calling, and which holds apply."""
    return (
        patch('middleware.api_hold_gate.session_manager.get_effective_user_id',
              return_value=user_id),
        patch('middleware.api_hold_gate.signature_hold.is_blocked', return_value=signature),
        patch('middleware.api_hold_gate.phone_verification_hold.is_blocked', return_value=phone),
    )


def _get(client, path, method='get', **holds):
    who, sig, phone = _as(**holds)
    with who, sig, phone:
        return getattr(client, method)(path)


@pytest.mark.unit
class TestTheHoldHolds:

    def test_a_held_family_is_refused_the_rest_of_the_platform(self, client):
        r = _get(client, '/api/quests', signature=True)
        assert r.status_code == 403
        # A machine-readable code, not a bare 403: the client has to be able to
        # tell "sign this" from an ordinary permission error, or the family is
        # shown "something went wrong" and has no idea what to do.
        assert r.get_json()['code'] == 'signature_required'

    def test_an_unverified_adult_is_refused_the_rest_of_the_platform(self, client):
        r = _get(client, '/api/sis/people', phone=True)
        assert r.status_code == 403
        assert r.get_json()['code'] == 'phone_verification_required'

    def test_the_message_says_what_to_do(self, client):
        assert 'sign' in _get(client, '/api/quests', signature=True).get_json()['error'].lower()
        assert 'phone' in _get(client, '/api/quests', phone=True).get_json()['error'].lower()

    def test_writes_are_refused_too(self, client):
        assert _get(client, '/api/quests', method='post', signature=True).status_code == 403
        assert _get(client, '/api/quests', method='post', phone=True).status_code == 403

    def test_under_both_holds_the_signature_is_asked_for_first(self, client):
        """The order the two middlewares were registered in, kept."""
        r = _get(client, '/api/quests', signature=True, phone=True)
        assert r.get_json()['code'] == 'signature_required'


@pytest.mark.unit
class TestTheWayOut:
    """Everything a held person needs to (a) stay logged in and (b) clear the
    hold. If any of these 403s, the hold is a dead end."""

    @pytest.mark.parametrize('path', SIGNING_FLOW + STAYING_LOGGED_IN)
    def test_a_held_family_can_reach_the_signing_flow(self, client, path):
        assert _get(client, path, signature=True).status_code == 200

    @pytest.mark.parametrize('path', VERIFYING_FLOW + STAYING_LOGGED_IN)
    def test_an_unverified_adult_can_reach_the_verification_flow(self, client, path):
        assert _get(client, path, phone=True).status_code == 200

    @pytest.mark.parametrize('path', SIGNING_FLOW + VERIFYING_FLOW)
    def test_a_person_under_both_holds_can_reach_both_flows(self, client, path):
        """The case two gates could not have. With two allow-lists, the
        signature gate refused the verification endpoints and the phone gate
        refused the signing endpoints, so a parent under both holds had no way
        to clear either."""
        assert _get(client, path, signature=True, phone=True).status_code == 200

    def test_signing_is_reachable_as_a_write(self, client):
        r = _get(client, '/api/sis/parent/onboarding/a-1/items/sign', method='patch', signature=True)
        assert r.status_code == 200

    def test_verifying_is_reachable_as_a_write(self, client):
        assert _get(client, '/api/phone-verification/verify', method='post', phone=True).status_code == 200

    def test_an_admin_can_still_leave_a_masquerade_into_a_held_account(self, client):
        """The exit stays on the allow-list even though a masquerade is exempt
        below: if that exemption ever regresses, the admin must still be able
        to get out of an account they can neither use nor leave."""
        assert _get(client, '/api/admin/masquerade/exit', method='post', signature=True).status_code == 200
        assert _get(client, '/api/admin/masquerade/exit', method='post', phone=True).status_code == 200

    def test_the_allow_list_is_the_union_of_every_hold_and_nothing_else(self):
        """Pinned. An entry added here without a hold that needs it widens
        every hold at once; an entry removed strands whichever hold used it."""
        assert ALLOWED_PREFIXES == (
            '/api/auth/',
            '/api/admin/masquerade/exit',
            '/api/sis/parent/required-documents',
            '/api/sis/parent/onboarding',
            '/api/sis/parent/my-documents/',
            '/api/sis/parent/context',
            '/api/phone-verification/',
        )
        assert [h.code for h in HOLDS] == ['signature_required', 'phone_verification_required']


@pytest.mark.unit
class TestMasqueradeIsExempt:
    """An admin must not sign a family's paperwork for them, and cannot type a
    code texted to somebody else's phone, so neither hold can be satisfied
    from inside a masquerade. The web router has exempted masquerade since
    2026-08-22; the API caught up 2026-09-16 -- once per gate, which is the
    cost this module exists to stop paying."""

    @pytest.mark.parametrize('holds', [{'signature': True}, {'phone': True},
                                       {'signature': True, 'phone': True}])
    def test_a_masquerade_into_a_held_account_is_let_through(self, client, holds):
        who, sig, phone = _as(**holds)
        with who, sig, phone, patch(
                'middleware.api_hold_gate.session_manager.is_masquerading',
                return_value=True):
            assert client.get('/api/quests').status_code == 200

    def test_the_person_themself_is_still_held(self, client):
        who, sig, phone = _as(signature=True)
        with who, sig, phone, patch(
                'middleware.api_hold_gate.session_manager.is_masquerading',
                return_value=False):
            assert client.get('/api/quests').status_code == 403

    def test_a_clear_person_never_pays_for_the_masquerade_check(self, client):
        who, sig, phone = _as()
        with who, sig, phone, patch(
                'middleware.api_hold_gate.session_manager.is_masquerading') as m:
            assert client.get('/api/quests').status_code == 200
            m.assert_not_called()


@pytest.mark.unit
class TestEverybodyElse:

    def test_a_person_with_nothing_outstanding_is_untouched(self, client):
        assert _get(client, '/api/quests').status_code == 200

    def test_an_anonymous_request_is_left_to_the_routes_own_decorator(self, client):
        assert _get(client, '/api/quests', user_id=None, signature=True).status_code == 200

    def test_a_cors_preflight_is_never_gated(self, client):
        assert _get(client, '/api/quests', method='options', signature=True).status_code == 200

    @pytest.mark.parametrize('target', ['signature_hold', 'phone_verification_hold'])
    def test_a_broken_hold_check_does_not_take_the_platform_down(self, client, target):
        """Fail open, in step with the service. No bug in a feature that holds
        one person over one thing should be able to 403 everybody -- and one
        hold's crash must not stop the other from being asked."""
        with patch('middleware.api_hold_gate.session_manager.get_effective_user_id',
                   return_value=HELD), \
             patch(f'middleware.api_hold_gate.{target}.is_blocked',
                   side_effect=RuntimeError('gate exploded')):
            assert client.get('/api/quests').status_code == 200

    def test_one_holds_crash_still_lets_the_other_hold(self, client):
        with patch('middleware.api_hold_gate.session_manager.get_effective_user_id',
                   return_value=HELD), \
             patch('middleware.api_hold_gate.signature_hold.is_blocked',
                   side_effect=RuntimeError('gate exploded')), \
             patch('middleware.api_hold_gate.phone_verification_hold.is_blocked',
                   return_value=True):
            r = client.get('/api/quests')
        assert r.status_code == 403
        assert r.get_json()['code'] == 'phone_verification_required'
