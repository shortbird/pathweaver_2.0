"""Who gets session tokens in the response body.

Every login-shaped endpoint used to return `app_access_token` and
`app_refresh_token` unconditionally, and `/api/auth/refresh` returned a fresh
30-day refresh token to anything holding the cookie. On the browsers that can use
httpOnly cookies -- most of the traffic -- that was a durable credential sitting
in the JS heap for no reason, which is the difference between an XSS that reads a
page and an XSS that owns the account for a month.

These tests pin the line: the browsers that genuinely cannot use our cookies keep
the tokens, and nobody else gets them.
"""

import pytest
from flask import Flask


CHROME = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')
SAFARI = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 '
          '(KHTML, like Gecko) Version/17.4 Safari/605.1.15')
IPHONE = ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) '
          'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1')
FIREFOX = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) '
           'Gecko/20100101 Firefox/131.0')
EXPO_ANDROID = 'okhttp/4.12.0'
EXPO_IOS = 'Optio/1.0.0 CFNetwork/1494.0.7 Darwin/23.4.0'


@pytest.fixture
def ctx():
    app = Flask(__name__)

    def _make(ua=CHROME, origin=None, json_body=None, headers=None):
        all_headers = {'User-Agent': ua}
        if origin:
            all_headers['Origin'] = origin
        all_headers.update(headers or {})
        return app.test_request_context(
            '/api/auth/login', method='POST',
            headers=all_headers, json=json_body if json_body is not None else {})

    return _make


def _v1_origin():
    from app_config import Config
    for origin in (Config.ALLOWED_ORIGINS or []):
        if 'v2-frontend' not in origin and '8081' not in origin:
            return origin
    return 'https://www.optioeducation.com'


@pytest.mark.unit
class TestCookieCapableBrowsersGetNothing:
    def test_chrome_on_the_web_app_gets_no_tokens_in_the_body(self, ctx):
        """The whole point. Chrome's cookies work, they are httpOnly, and the
        response already sets them -- so there is nothing for script to read."""
        from routes.auth import token_delivery
        with ctx(ua=CHROME, origin=_v1_origin()):
            assert token_delivery.body_tokens('a', 'r') == {}

    def test_refresh_returns_no_token_to_a_cookie_client(self, ctx):
        """This endpoint authenticates from the refresh COOKIE. Returning the
        new refresh token in readable JSON meant an XSS payload could POST here
        and be handed a 30-day credential for a session it had no password for."""
        from routes.auth import token_delivery
        with ctx(ua=CHROME, origin=_v1_origin()):
            assert token_delivery.refresh_body_tokens('a', 'r') == {}

    def test_starting_a_masquerade_returns_no_token_to_a_cookie_client(self, ctx):
        """The same response sets the httpOnly masquerade_token cookie, and
        get_effective_user_id() reads it. Putting the impersonation JWT in the
        body as well only widened what an XSS on an admin's session could take
        -- and v1 reloads the page immediately afterwards, so it never used the
        copy it was given."""
        from routes.auth import token_delivery
        with ctx(ua=CHROME, origin=_v1_origin()):
            assert token_delivery.masquerade_body_tokens('mq', 'mqr') == {}

    def test_a_client_may_decline_body_tokens(self, ctx):
        """A client-supplied flag is honoured in one direction only: it can take
        a credential out of the response, never put one in."""
        from routes.auth import token_delivery
        with ctx(ua=SAFARI, json_body={'auth_mode': 'cookie'}):
            assert token_delivery.body_tokens('a', 'r') == {}

    def test_a_client_cannot_ask_to_be_given_tokens(self, ctx):
        """The mirror image, and the reason the decision is server-side: an
        attacker who could talk us into header mode with a header would have
        undone the whole change."""
        from routes.auth import token_delivery
        with ctx(ua=CHROME, origin=_v1_origin(),
                 json_body={'auth_mode': 'header'}):
            assert token_delivery.body_tokens('a', 'r') == {}


@pytest.mark.unit
class TestClientsThatCannotUseCookiesStillWork:
    @pytest.mark.parametrize('ua', [SAFARI, IPHONE, FIREFOX])
    def test_cookie_blocking_browsers_keep_both_tokens(self, ctx, ua):
        """Safari/iOS strip our cross-site cookies under ITP and Firefox's ETP
        does the same. The Authorization header is the only auth they have, and
        the refresh token is how they renew it."""
        from routes.auth import token_delivery
        with ctx(ua=ua, origin=_v1_origin()):
            tokens = token_delivery.body_tokens('a', 'r')
        assert tokens == {'app_access_token': 'a', 'app_refresh_token': 'r'}

    @pytest.mark.parametrize('ua', [EXPO_ANDROID, EXPO_IOS, ''])
    def test_the_mobile_app_keeps_both_tokens(self, ctx, ua):
        """frontend-v2 native has no cookie jar at all; the tokens live in
        expo-secure-store and are the entire session (ADR-001)."""
        from routes.auth import token_delivery
        with ctx(ua=ua):
            tokens = token_delivery.body_tokens('a', 'r')
        assert tokens == {'app_access_token': 'a', 'app_refresh_token': 'r'}

    def test_the_v2_web_target_keeps_working(self, ctx):
        """frontend-v2's web build runs in an ordinary browser but keeps its
        access token in memory and refreshes from the cookie; it is told apart
        from the v1 app by its Origin."""
        from routes.auth import token_delivery
        with ctx(ua=CHROME, origin='http://localhost:8081'):
            assert token_delivery.body_tokens('a', 'r')

    @pytest.mark.parametrize('ua', [SAFARI, IPHONE, EXPO_ANDROID, EXPO_IOS])
    def test_masquerade_still_reaches_clients_without_a_cookie_jar(self, ctx, ua):
        """The mobile app switches identity by swapping the token it holds, and
        needs the masquerade refresh token specifically: refreshing with the
        admin's own would silently drop it back into its own account."""
        from routes.auth import token_delivery
        with ctx(ua=ua, origin=_v1_origin()):
            tokens = token_delivery.masquerade_body_tokens('mq', 'mqr')
        assert tokens == {'masquerade_token': 'mq',
                          'masquerade_refresh_token': 'mqr'}

    def test_an_unknown_caller_is_not_broken(self, ctx):
        """No Origin means not the v1 web app: that call is cross-origin in
        every environment we run, so the browser always attaches one. Anything
        else keeps today's behaviour rather than losing its session to a
        classification we got wrong."""
        from routes.auth import token_delivery
        with ctx(ua=CHROME, origin=None):
            assert token_delivery.body_tokens('a', 'r')


# Endpoints whose job IS to hand a token to a machine, where a body token is the
# protocol rather than a convenience. Each needs a reason, and none of them serve
# a browser session.
_LEGITIMATE_TOKEN_ISSUERS = {
    # OAuth 2.0 token endpoint. RFC 6749 s5.1 defines the response body; there
    # is no cookie in this exchange and the caller is a server.
    'routes/auth/oauth.py',
    # LTI 1.3 client-credentials grant, same shape, same reason.
    'routes/lti/token.py',
    # Acting-as (parent -> dependent) START still hands out
    # `acting_as_refresh_token` in the body, because that flow has NO COOKIE of
    # its own: the token is replayed as a Bearer, so gating it would delete the
    # feature rather than harden it. Giving it a cookie the way masquerade has
    # one is the fix (FU-05), and it needs a browser to verify.
    #
    # NARROWED 2026-09-03: /stop-acting-as no longer qualifies. It was returning
    # the PARENT'S OWN access + 30-day refresh token to every client, which is
    # the same defect SEC-03 fixed on masquerade's /exit and has nothing to do
    # with the missing acting-as cookie -- de-escalation hands somebody back
    # their own cookie-anchored session. It now goes through
    # refresh_body_tokens() and sets auth cookies.
    'routes/dependents.py',
}

# Response-body field names that carry a durable credential.
_CREDENTIAL_FIELDS = (
    'app_refresh_token',
    'refresh_token',
    'masquerade_refresh_token',
    'acting_as_refresh_token',
)


@pytest.mark.unit
class TestNoEndpointBypassesTheGate:
    def test_no_route_hands_out_a_refresh_token_unconditionally(self):
        """The gate is only worth having if every emitter goes through it.

        There were seven separate places building a login response, each with
        its own literal `'app_refresh_token': ...`, which is how the same 30-day
        credential ended up in the JSON of endpoints nobody thought of as login
        (verify-email-otp, change-password, the OAuth TOS-acceptance step).

        This scan covered only routes/auth/ at first, and
        routes/admin/masquerade.py sat outside it returning both impersonation
        tokens to everyone -- and, on /exit, the admin's own 30-day refresh
        token (SEC-03). So it now walks every route module.
        """
        from pathlib import Path
        routes_dir = Path(__file__).resolve().parents[1] / 'routes'
        offenders = []
        for path in sorted(routes_dir.rglob('*.py')):
            rel = path.relative_to(routes_dir.parent).as_posix()
            if rel == 'routes/auth/token_delivery.py' or rel in _LEGITIMATE_TOKEN_ISSUERS:
                continue
            for lineno, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith('#'):
                    continue
                # A dict literal KEY, i.e. a hand-built response field. Reading
                # the field back off a request is fine, and so is passing the
                # variable into one of the *_body_tokens() helpers.
                if any(f"'{f}':" in stripped or f'"{f}":' in stripped
                       for f in _CREDENTIAL_FIELDS):
                    offenders.append(f'{rel}:{lineno}')
        assert not offenders, (
            'these build a response body with a refresh token directly instead '
            'of going through token_delivery: ' + ', '.join(offenders))

    def test_the_allowlist_names_files_that_exist(self):
        """An allowlist entry that no longer matches a file is a hole nobody
        can see -- the guard would skip nothing and report green."""
        from pathlib import Path
        backend = Path(__file__).resolve().parents[1]
        missing = [rel for rel in sorted(_LEGITIMATE_TOKEN_ISSUERS)
                   if not (backend / rel).exists()]
        assert not missing, f'allowlisted files no longer exist: {missing}'


@pytest.mark.unit
class TestTheServerAndClientAgree:
    def test_the_backend_splits_browsers_the_same_way_the_client_does(self):
        """`shouldUseAuthHeaders()` in browserDetection.js picks Safari, iOS and
        Firefox. If the two ever disagree, a browser asks for header auth and
        finds no token to send -- so the source of truth is duplicated on
        purpose and pinned here."""
        import re
        from pathlib import Path
        source = (Path(__file__).resolve().parents[2]
                  / 'frontend/src/utils/browserDetection.js').read_text()
        clause = re.search(r'shouldUseAuthHeaders\s*=\s*\(\)\s*=>\s*\{(.*?)\n\}',
                           source, re.S)
        assert clause, 'shouldUseAuthHeaders() not found in browserDetection.js'
        body = clause.group(1)
        for probe in ('isSafari()', 'isIOS()', 'isFirefox()'):
            assert probe in body, (
                f'{probe} no longer decides header auth on the client; '
                'update _blocks_our_cookies() in routes/auth/token_delivery.py '
                'to match or those users lose their session')


@pytest.mark.unit
class TestStopActingAsDeEscalation:
    """/stop-acting-as hands a parent back their OWN session.

    It was returning the parent's own access token and 30-day refresh token in
    the JSON body to every caller, and setting no cookies at all -- the same
    defect SEC-03 fixed on masquerade's /exit, in the endpoint right next to it.
    That is the widest possible delivery of the longest-lived credential the
    platform issues, to a browser that did not need it.

    This is separable from the rest of acting-as, which still needs its body
    token because that flow has no cookie of its own (FU-05). De-escalation is
    different: what it returns is the caller's own cookie-anchored session.
    """

    PARENT_ID = '11111111-1111-1111-1111-111111111111'

    def _stop(self, client, headers):
        from unittest.mock import MagicMock, patch
        from utils.session_manager import session_manager

        PARENT_ID = self.PARENT_ID
        admin = MagicMock()
        admin.table.return_value.select.return_value.eq.return_value.single \
            .return_value.execute.return_value = MagicMock(
                data={'id': PARENT_ID, 'display_name': 'Pat'})
        with patch('routes.dependents.get_supabase_admin_client', return_value=admin), \
             patch.object(session_manager, 'get_deescalation_user_id',
                          return_value=PARENT_ID):
            return client.post('/api/dependents/stop-acting-as', json={}, headers=headers)

    def test_a_cookie_capable_browser_gets_cookies_and_no_body_tokens(self, client):
        resp = self._stop(client, {'User-Agent': CHROME, 'Origin': _v1_origin()})
        assert resp.status_code == 200
        body = resp.get_json()
        assert 'access_token' not in body, (
            "the parent's own tokens must not travel in a body a script can read "
            "when the browser can hold an httpOnly cookie")
        assert 'refresh_token' not in body
        cookies = resp.headers.getlist('Set-Cookie')
        assert any('access_token=' in c for c in cookies), (
            'the endpoint set no cookies, so a cookie-capable browser would be '
            'left with no session at all')

    def test_a_header_auth_client_still_gets_its_tokens(self, client):
        """Safari/iOS and the mobile app cannot use our cookies. Gating them out
        would not harden anything, it would log the parent out."""
        resp = self._stop(client, {'User-Agent': IPHONE})
        assert resp.status_code == 200
        body = resp.get_json()
        assert body.get('access_token'), 'header-auth client lost its way back'
        assert body.get('refresh_token')
