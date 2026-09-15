"""Which surface a request came from: the mobile app, the web app, or the SIS
console.

The first use is the `sent_from` stamp on a message. A superadmin reading a
thread sees "Mobile" or "Web" under each bubble; nobody else does. Support
asked for it because "the message did not send" means something different
depending on which client was in the user's hand, and the thread was the only
place that could not say.

The answer comes from three things, checked in this order:

  1. `X-Optio-Client`. The mobile app's HTTP client stamps every request with
     `mobile`. Native traffic is not subject to CORS, so the header costs
     nothing there. The web app deliberately does NOT send one: a custom
     header on every web request needs a matching CORS allow-list entry, and
     release.yml deploys the web and the backend concurrently, so for the
     minutes a new bundle talked to the old API every preflight would fail
     and the whole site would look down. Inferring the web is free.
  2. The User-Agent. Every browser sends a `Mozilla/` product token; the
     mobile app's HTTP stacks (okhttp on Android, CFNetwork on iOS) do not.
     This is the same line routes/auth/token_delivery.py draws to decide who
     gets tokens in a response body, and it is what covers a mobile build
     older than the header.
  3. The Origin. `sis.optioeducation.com` is the SIS console, its own surface
     with its own roles (CLAUDE.md); the mobile app's web target announces
     itself on port 8081. Anything else that is a browser is the web app.

None of this is a security decision. A caller who lies about the header gets a
wrong label under their own message and nothing else, which is why the header
is trusted at face value here and not in token_delivery.
"""

from typing import Optional

from flask import has_request_context, request

CLIENT_HEADER = 'X-Optio-Client'

MOBILE = 'mobile'
WEB = 'web'
SIS = 'sis'
EMAIL = 'email'   # an inbound email reply relayed into a thread; never a client

# What a request may claim about itself. `email` is set by the relay service
# on the server side, so it is not accepted from the header.
CLIENT_PLATFORMS = (MOBILE, WEB, SIS)
PLATFORMS = CLIENT_PLATFORMS + (EMAIL,)

_SIS_ORIGIN_HINTS = ('sis.optioeducation.com',)
_MOBILE_WEB_ORIGIN_HINTS = (
    'optio-dev-v2-frontend',   # Render dev service for mobile's web target
    'localhost:8081',          # Expo dev server
    '127.0.0.1:8081',
)


def request_client_platform() -> Optional[str]:
    """The surface behind the current request, or None outside a request."""
    if not has_request_context():
        return None

    claimed = (request.headers.get(CLIENT_HEADER) or '').strip().lower()
    if claimed in CLIENT_PLATFORMS:
        return claimed

    ua = request.headers.get('User-Agent', '') or ''
    if 'Mozilla' not in ua:
        return MOBILE

    origin = (request.headers.get('Origin', '') or '').lower()
    if any(hint in origin for hint in _MOBILE_WEB_ORIGIN_HINTS):
        return MOBILE
    if any(hint in origin for hint in _SIS_ORIGIN_HINTS):
        return SIS
    return WEB
