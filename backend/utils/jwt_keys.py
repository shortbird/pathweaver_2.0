"""Decoding app-signed JWTs while JWT_SECRET_KEY is mid-rotation.

session_manager has carried a current-key/previous-key fallback in all six of
its verify methods since M5, so rotating the signing key does not sign everyone
out. The three app-signed token types that live OUTSIDE session_manager never
got one:

    lti_service evidence tokens    180 days   <- the one that matters
    lti_service OIDC state          10 min
    google_oauth TOS acceptance     15 min

Each decodes against `Config.JWT_SECRET_KEY` alone, so the moment that value
changes every outstanding token of that kind is void. For the evidence tokens
that is up to six months of SpeedGrader links already sitting in live Canvas
gradebooks -- a teacher clicking one gets a dead link, with nothing to retry.

SEC-14 requires exactly that rotation (prod's key is not the Supabase JWT
secret, so RLS has never actually run). This closes the gap first.

`Config.JWT_PREVIOUS_SECRET_KEY` reads env `FLASK_SECRET_KEY_OLD` and is unset
in steady state, in which case this is a plain single-key decode.
"""

from typing import Any, Dict, List, Optional

import jwt

from app_config import Config


def decode_app_jwt(token: str, *, require: Optional[List[str]] = None
                   ) -> Optional[Dict[str, Any]]:
    """Decode an HS256 token signed with JWT_SECRET_KEY, current key or previous.

    Returns the claims, or None if the token is malformed, expired, signed with
    neither key, or missing a claim named in `require`. Callers that need to
    tell those apart should check the claims they care about themselves --
    every current caller treats all of them the same way.
    """
    if not token:
        return None

    options = {'require': require} if require else {}
    for key in filter(None, (Config.JWT_SECRET_KEY, Config.JWT_PREVIOUS_SECRET_KEY)):
        try:
            return jwt.decode(token, key, algorithms=['HS256'], options=options)
        except jwt.PyJWTError:
            # wrong key: try the next one
            continue
    return None
