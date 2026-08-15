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

    def test_an_unknown_caller_is_not_broken(self, ctx):
        """No Origin means not the v1 web app: that call is cross-origin in
        every environment we run, so the browser always attaches one. Anything
        else keeps today's behaviour rather than losing its session to a
        classification we got wrong."""
        from routes.auth import token_delivery
        with ctx(ua=CHROME, origin=None):
            assert token_delivery.body_tokens('a', 'r')


@pytest.mark.unit
class TestNoEndpointBypassesTheGate:
    def test_no_auth_route_hands_out_tokens_unconditionally(self):
        """The gate is only worth having if every emitter goes through it.

        There were seven separate places building a login response, each with
        its own literal `'app_refresh_token': ...`, which is how the same 30-day
        credential ended up in the JSON of endpoints nobody thought of as login
        (verify-email-otp, change-password, the OAuth TOS-acceptance step). A new
        one added by hand would reopen this silently, so fail here instead.
        """
        from pathlib import Path
        auth_dir = Path(__file__).resolve().parents[1] / 'routes/auth'
        offenders = []
        for path in sorted(auth_dir.rglob('*.py')):
            if path.name == 'token_delivery.py':
                continue
            for lineno, line in enumerate(path.read_text().splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith('#'):
                    continue
                # A dict literal KEY, i.e. a hand-built response field. Reading
                # the field back off a request is fine, and so is passing the
                # variable into body_tokens().
                if "'app_refresh_token':" in stripped or '"app_refresh_token":' in stripped:
                    offenders.append(f'{path.name}:{lineno}')
        assert not offenders, (
            'these build a response body with a refresh token directly instead '
            f'of going through token_delivery.body_tokens(): {offenders}')


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
