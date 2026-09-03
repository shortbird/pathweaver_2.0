"""SEC-07: the legacy verify_token() authenticates access tokens and nothing else.

`utils/auth/token_utils.verify_token()` decoded the JWT itself and accepted
`type in ('access', 'refresh')`. Three read paths fall back to it when there is
no cookie session:

  - routes/public.py, deciding whether to show an UNPUBLISHED course to its
    creator or a superadmin
  - routes/quest/listing.py, twice

so a 30-day refresh token -- the credential deliberately kept out of reach of
script everywhere else -- worked as a login on all three. Hand-rolling the
decode also skipped the session-timeout check and the previous-key fallback
that session_manager applies to every other caller.

It delegates now. These tests pin that only an access token gets through, and
that the delegation is what makes it so.
"""

from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def no_supabase_fallback():
    """verify_token() falls through to Supabase for tokens it does not
    recognise. Keep that off the network and make 'rejected' unambiguous."""
    client = MagicMock()
    client.auth.get_user.side_effect = Exception('not a supabase token')
    with patch('utils.auth.token_utils.get_supabase_client', return_value=client):
        yield client


@pytest.fixture(autouse=True)
def request_context():
    """Minting and verifying a token reads the device fingerprint off the
    request, so every case here needs one."""
    from flask import Flask
    app = Flask(__name__)
    with app.test_request_context('/', headers={'User-Agent': 'pytest'}):
        yield


@pytest.fixture
def session_manager():
    from utils.session_manager import session_manager as sm
    return sm


USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
OTHER = '11111111-2222-3333-4444-555555555555'


@pytest.mark.unit
class TestOnlyAnAccessTokenAuthenticates:
    def test_an_access_token_is_accepted(self, session_manager, no_supabase_fallback):
        from utils.auth.token_utils import verify_token
        token = session_manager.generate_access_token(USER)
        assert verify_token(token) == USER

    def test_a_refresh_token_is_rejected(self, session_manager, no_supabase_fallback):
        """The finding. This token authenticated three routes."""
        from utils.auth.token_utils import verify_token
        token = session_manager.generate_refresh_token(USER)
        assert verify_token(token) is None

    @pytest.mark.parametrize('mint', [
        'generate_masquerade_token',
        'generate_masquerade_refresh_token',
        'generate_acting_as_token',
        'generate_acting_as_refresh_token',
    ])
    def test_no_impersonation_token_authenticates_as_its_holder(
            self, session_manager, no_supabase_fallback, mint):
        """Every other token this system mints, checked as a class rather than
        one at a time -- adding a seventh token type should not quietly become
        a seventh way past this function."""
        from utils.auth.token_utils import verify_token
        assert verify_token(getattr(session_manager, mint)(USER, OTHER)) is None

    def test_garbage_is_rejected(self, no_supabase_fallback):
        from utils.auth.token_utils import verify_token
        assert verify_token('not.a.jwt') is None

    def test_an_empty_token_never_reaches_supabase(self, no_supabase_fallback):
        from utils.auth.token_utils import verify_token
        assert verify_token('') is None
        assert not no_supabase_fallback.auth.get_user.called


@pytest.mark.unit
class TestItDelegatesRatherThanReimplementing:
    def test_the_session_managers_verdict_is_the_one_that_counts(
            self, no_supabase_fallback):
        """A second hand-rolled decode is how this drifted: no session-timeout
        check, no previous-key fallback during a secret rotation. If
        session_manager rejects a token, so does this."""
        from utils.auth.token_utils import verify_token
        with patch('utils.session_manager.session_manager.verify_access_token',
                   return_value=None) as verdict:
            assert verify_token('some.access.token') is None
        assert verdict.called

    def test_token_utils_does_not_decode_jwts_for_authentication(self):
        """Guard on the shape, not the behaviour: the accept-list bug can only
        come back by decoding here again."""
        import inspect
        from utils.auth import token_utils
        source = inspect.getsource(token_utils.verify_token)
        assert 'jwt.decode' not in source, (
            'verify_token() decodes a JWT itself again -- route it through '
            'session_manager.verify_access_token() instead')
