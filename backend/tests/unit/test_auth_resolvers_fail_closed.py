"""SEC-08: one request, one answer about who is calling.

session_manager has three identity resolvers, and they disagreed about a
request carrying a bad Authorization header alongside good cookies:

  get_effective_user_id()  -> None       (fails closed, always has)
  get_current_user_id()    -> cookie id  (fell through)
  get_actual_admin_id()    -> cookie id  (delegates to get_current_user_id)

@require_auth uses the first, so such a request was rejected. @require_admin,
@require_real_identity and @require_admin_identity authorize through
authorizing_user_id() -> get_actual_admin_id(), so the SAME request was
accepted there. The divergence ran in the accepting direction.

Its sharpest form is an expired masquerade token. Masquerade tokens live one
hour; the admin's own access_token cookie outlives them by a lot. When the
masquerade JWT died mid-session the admin silently got their own authority back
on every admin route, while the banner still said they were inside the target's
account -- an admin who cannot tell whose permissions are answering is the one
thing masquerade must never be.

De-escalation is the deliberate exception, and it is a named method rather than
a fallthrough: logging out or stepping out of acting-as must work with a dead
token, because refusing to identify the caller there means NOT revoking.
"""

import pytest
from flask import Flask


USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
TARGET = '11111111-2222-3333-4444-555555555555'


@pytest.fixture
def request_ctx():
    """Build a request with any mix of Authorization header and cookies."""
    app = Flask(__name__)

    def _make(bearer=None, cookies=None):
        headers = {'User-Agent': 'pytest'}
        if bearer is not None:
            headers['Authorization'] = f'Bearer {bearer}'
        environ_base = {}
        if cookies:
            environ_base['HTTP_COOKIE'] = '; '.join(
                f'{k}={v}' for k, v in cookies.items())
        return app.test_request_context(
            '/api/admin/users', method='GET',
            headers=headers, environ_base=environ_base)

    return _make


@pytest.fixture
def sm(request_ctx):
    """session_manager, plus freshly minted tokens (minting needs a context)."""
    from utils.session_manager import session_manager
    with request_ctx():
        yield session_manager


def _resolvers(session_manager):
    return {
        'effective': session_manager.get_effective_user_id,
        'current': session_manager.get_current_user_id,
        'actual': session_manager.get_actual_admin_id,
    }


@pytest.mark.unit
class TestABadBearerEndsTheRequest:
    def test_garbage_bearer_with_a_valid_cookie_is_rejected_by_all_three(
            self, sm, request_ctx):
        access = sm.generate_access_token(USER)
        with request_ctx(bearer='not.a.token', cookies={'access_token': access}):
            answers = {name: resolve() for name, resolve in _resolvers(sm).items()}
        assert answers == {'effective': None, 'current': None, 'actual': None}

    def test_an_expired_masquerade_bearer_does_not_restore_the_admin(
            self, sm, request_ctx):
        """The case that matters. The masquerade JWT is dead; the admin's own
        access_token cookie is not. Nothing may hand the admin their own
        authority back while they are still inside somebody else's account."""
        admin_cookie = sm.generate_access_token(USER)
        with request_ctx(bearer='eyJhbGciOiJIUzI1NiJ9.dead.masquerade',
                         cookies={'access_token': admin_cookie}):
            answers = {name: resolve() for name, resolve in _resolvers(sm).items()}
        assert set(answers.values()) == {None}, answers

    def test_the_three_resolvers_agree_on_every_credential_mix(
            self, sm, request_ctx):
        """The property, not the instance: whatever the request carries, either
        all three name someone or none of them do. Two answers to 'who is
        calling' is the bug class, whichever way round it happens."""
        access = sm.generate_access_token(USER)
        mixes = [
            {'bearer': None, 'cookies': None},
            {'bearer': None, 'cookies': {'access_token': access}},
            {'bearer': access, 'cookies': None},
            {'bearer': access, 'cookies': {'access_token': access}},
            {'bearer': 'garbage', 'cookies': None},
            {'bearer': 'garbage', 'cookies': {'access_token': access}},
            {'bearer': 'garbage', 'cookies': {'masquerade_token': 'also-garbage'}},
        ]
        for mix in mixes:
            with request_ctx(**mix):
                answered = {name: resolve() is not None
                            for name, resolve in _resolvers(sm).items()}
            assert len(set(answered.values())) == 1, (mix, answered)


@pytest.mark.unit
class TestGoodCredentialsStillWork:
    def test_a_valid_bearer_authenticates(self, sm, request_ctx):
        access = sm.generate_access_token(USER)
        with request_ctx(bearer=access):
            assert sm.get_current_user_id() == USER
            assert sm.get_effective_user_id() == USER
            assert sm.get_actual_admin_id() == USER

    def test_a_cookie_session_with_no_bearer_is_untouched(self, sm, request_ctx):
        """Most of the traffic. Fail-closed applies to a Bearer that was SENT
        and did not verify, never to its absence."""
        access = sm.generate_access_token(USER)
        with request_ctx(cookies={'access_token': access}):
            assert sm.get_current_user_id() == USER
            assert sm.get_effective_user_id() == USER

    def test_a_live_masquerade_still_names_admin_and_target(self, sm, request_ctx):
        mq = sm.generate_masquerade_token(USER, TARGET)
        with request_ctx(bearer=mq):
            assert sm.get_current_user_id() == USER
            assert sm.get_effective_user_id() == TARGET


@pytest.mark.unit
class TestDeescalationIsTheNamedException:
    def test_logging_out_with_a_dead_bearer_still_names_the_user(
            self, sm, request_ctx):
        """An expired access token is the normal way to arrive at /logout. If
        nothing identifies the caller, last_logout_at is never written and the
        refresh families are never revoked -- the session survives the logout
        that reported success."""
        access = sm.generate_access_token(USER)
        with request_ctx(bearer='expired.and.dead',
                         cookies={'access_token': access}):
            assert sm.get_current_user_id() is None
            assert sm.get_deescalation_user_id() == USER

    def test_stepping_out_of_acting_as_works_after_the_token_dies(
            self, sm, request_ctx):
        """Acting-as tokens last 24h; the parent's own cookie outlives them and
        the parent still needs the way out."""
        parent_cookie = sm.generate_access_token(USER)
        with request_ctx(bearer='dead.acting.as',
                         cookies={'access_token': parent_cookie}):
            assert sm.get_deescalation_user_id() == USER

    def test_it_still_needs_a_credential_that_verifies(self, sm, request_ctx):
        """Permissive about WHICH credential, not about whether there is one."""
        with request_ctx(bearer='garbage', cookies={'access_token': 'garbage'}):
            assert sm.get_deescalation_user_id() is None

    def test_only_deescalating_routes_use_it(self):
        """It grants nothing, but a route that grants must not reach for it."""
        from pathlib import Path
        routes = Path(__file__).resolve().parents[2] / 'routes'
        callers = set()
        for path in sorted(routes.rglob('*.py')):
            if 'get_deescalation_user_id' in path.read_text(encoding='utf-8'):
                callers.add(path.relative_to(routes).as_posix())
        assert callers == {'auth/login/core.py', 'dependents.py'}, (
            'get_deescalation_user_id() accepts any credential the request '
            f'carries; it belongs only on routes that REMOVE access: {callers}')
