"""Who gets a copy of their session tokens in the response body.

Every login-shaped endpoint used to return `app_access_token` and
`app_refresh_token` in the JSON, unconditionally, and the v1 web client stored
both in the JS heap for every visitor. That was written for one real problem --
Safari/iOS and Firefox drop our cross-site cookies, so those browsers genuinely
cannot authenticate any way but the `Authorization` header -- and then applied to
everyone.

The cost lands on the browsers that never needed it. A refresh token lives 30
days; handing one to JavaScript turns any XSS, present or future, from "read this
page's data" into "hold this account for a month". The cookies are httpOnly
precisely so that script cannot reach them, and then we posted the same
credential into a variable next to the script.

So the decision moves here, and it is made SERVER-SIDE. A client may ask to be
given LESS (`X-Optio-Auth-Mode: cookie` withholds the tokens) but never more:
an attacker who could talk us into header mode by setting a header would have
undone the whole thing.

The four cases, in the order they are checked:

  1. Not a browser at all -- the Expo mobile app (`okhttp`, `CFNetwork`) and
     anything else without a cookie jar. Tokens are the only auth it has.
  2. A browser that blocks our cookies -- Safari, any iOS browser, Firefox.
     This is the case the fallback was built for, and `shouldUseAuthHeaders()`
     in frontend/src/utils/browserDetection.js draws the same line client-side.
  3. A browser on some other origin -- frontend-v2's web target, which keeps the
     access token in memory and refreshes from the cookie (ADR-001).
  4. Everything else: a cookie-capable browser on the v1 web app. Cookies are
     already set on the same response; it gets nothing in the body.

Case 4 is the whole population this exists to change, and it is the majority of
traffic. The Origin header is what separates it from case 3, and it is
trustworthy for exactly the threat in question: an XSS payload running on
www.optioeducation.com cannot forge or suppress the Origin the browser attaches
to its cross-origin call to api.optioeducation.com.
"""

from typing import Dict, Optional

from flask import request

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

# Origins that are NOT the v1 web app, matched as substrings of the Origin
# header. frontend-v2's web target is a separate surface with its own storage
# model and must keep receiving tokens (ADR-001, "v2 web").
_NON_V1_ORIGIN_HINTS = (
    'optio-dev-v2-frontend',   # Render dev service for frontend-v2 web
    'localhost:8081',          # Expo dev server
    '127.0.0.1:8081',
)

# Header the client uses to decline body tokens. Only ever honoured in the
# restrictive direction.
AUTH_MODE_HEADER = 'X-Optio-Auth-Mode'


def _user_agent() -> str:
    return request.headers.get('User-Agent', '') or ''


def _is_browser(ua: str) -> bool:
    """Every browser sends a `Mozilla/` product token; the mobile app's HTTP
    stacks (okhttp on Android, CFNetwork/Darwin on iOS) do not."""
    return 'Mozilla' in ua


def _blocks_our_cookies(ua: str) -> bool:
    """Safari, any iOS browser, and Firefox.

    Deliberately the same three as `shouldUseAuthHeaders()` on the client. Safari
    and iOS drop cross-site cookies under ITP; Firefox's Enhanced Tracking
    Protection does the same. If the two ever disagree, the client asks for
    header auth and finds no token, so keep them in step.
    """
    if 'iPhone' in ua or 'iPad' in ua or 'iPod' in ua:
        return True  # every iOS browser is WebKit underneath
    if 'Firefox' in ua or 'FxiOS' in ua:
        return True
    return 'Safari' in ua and 'Chrome' not in ua and 'Chromium' not in ua


def _v1_web_origin(origin: str) -> bool:
    if not origin:
        # A browser that sent no Origin is not the v1 web app talking to the API:
        # that call is cross-origin in every environment we run (www -> api in
        # prod, :3000 -> :5001 in dev), so the browser always attaches one. Treat
        # the unknown caller as needing tokens rather than break it.
        return False
    if any(hint in origin for hint in _NON_V1_ORIGIN_HINTS):
        return False
    return origin in (Config.ALLOWED_ORIGINS or [])


def client_declined_body_tokens() -> bool:
    """True when the client has said it authenticates by cookie.

    Safe to trust because it can only ever REMOVE a credential from the
    response. v1 sends this from `shouldUseAuthHeaders()`, which knows things the
    server does not -- a previous cookie test in this tab, for instance.
    """
    header = (request.headers.get(AUTH_MODE_HEADER) or '').strip().lower()
    if header:
        return header == 'cookie'
    try:
        body = request.get_json(silent=True) or {}
    except Exception:  # noqa: BLE001
        return False
    return isinstance(body, dict) and str(body.get('auth_mode', '')).lower() == 'cookie'


def needs_header_auth() -> bool:
    """Whether this caller can only authenticate with an Authorization header."""
    if client_declined_body_tokens():
        return False
    ua = _user_agent()
    if not _is_browser(ua):
        return True
    if _blocks_our_cookies(ua):
        return True
    return not _v1_web_origin(request.headers.get('Origin', '') or '')


def body_tokens(access_token: str, refresh_token: Optional[str] = None) -> Dict[str, str]:
    """The `app_access_token` / `app_refresh_token` pair to merge into a login
    response body -- or an empty dict when the caller authenticates by cookie.

    Callers keep setting the httpOnly cookies exactly as before; this only
    decides what is additionally readable by script.
    """
    if not needs_header_auth():
        return {}
    tokens = {'app_access_token': access_token}
    if refresh_token:
        tokens['app_refresh_token'] = refresh_token
    return tokens


def refresh_body_tokens(access_token: str, refresh_token: str) -> Dict[str, str]:
    """Same decision for /api/auth/refresh, which names its fields differently.

    This endpoint is the one that mattered most. It answers to the refresh
    COOKIE, so before this an XSS payload did not need to steal anything -- it
    could POST /api/auth/refresh and be handed a fresh 30-day refresh token in
    readable JSON, from a session it never had the credentials for.
    """
    if not needs_header_auth():
        return {}
    return {'access_token': access_token, 'refresh_token': refresh_token}


def masquerade_body_tokens(access_token: str, refresh_token: str) -> Dict[str, str]:
    """Same decision for POST /api/admin/masquerade/<id>, which names its fields
    `masquerade_token` / `masquerade_refresh_token`.

    This one lives outside routes/auth/, which is why it kept handing both
    tokens to every caller long after login stopped. The response already sets
    the httpOnly `masquerade_token` cookie, and get_effective_user_id() reads
    it, so a cookie-capable browser needs nothing in the body -- v1 reloads the
    page immediately after starting a masquerade anyway, which throws away
    whatever it had in memory.
    """
    if not needs_header_auth():
        return {}
    return {
        'masquerade_token': access_token,
        'masquerade_refresh_token': refresh_token,
    }
