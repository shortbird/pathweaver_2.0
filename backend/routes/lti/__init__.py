"""
Canvas LTI 1.3 blueprint.

Routes mounted under `/lti` (plus `/.well-known/jwks.json` registered
explicitly because it must live at the well-known path).

Frame-ancestors handling:
    The global security middleware sets `X-Frame-Options: DENY` and
    `Content-Security-Policy: frame-ancestors 'none'`. LTI launches must be
    embeddable inside Canvas iframes, so this blueprint's `after_request`
    hook strips those two headers for /lti/* responses. Frame-ancestors is
    NOT loosened globally — only on this blueprint.
"""

from flask import Blueprint, request

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint("lti", __name__, url_prefix="/lti")


@bp.after_request
def relax_frame_ancestors(response):
    """Allow Canvas to embed LTI responses; default global policy is `'none'`."""
    # Be precise: only override frame-ancestors / X-Frame-Options. Leave the
    # rest of the CSP intact so we don't accidentally weaken script-src.
    response.headers.pop("X-Frame-Options", None)

    # If a CSP is set, replace just the frame-ancestors directive. Otherwise
    # just set frame-ancestors. Canvas-hosted instances all live under
    # *.instructure.com or sso.canvaslms.com.
    allowed = "https://*.instructure.com https://sso.canvaslms.com"
    existing = response.headers.get("Content-Security-Policy", "")
    if "frame-ancestors" in existing:
        directives = []
        for directive in existing.split(";"):
            d = directive.strip()
            if d.startswith("frame-ancestors"):
                directives.append(f"frame-ancestors {allowed}")
            elif d:
                directives.append(d)
        response.headers["Content-Security-Policy"] = "; ".join(directives)
    else:
        response.headers["Content-Security-Policy"] = (
            (existing + "; " if existing else "") + f"frame-ancestors {allowed}"
        )
    return response


# Submodule imports register their handlers on `bp`.
from . import config  # noqa: E402,F401
from . import jwks    # noqa: E402,F401
from . import launch  # noqa: E402,F401
from . import deep_linking  # noqa: E402,F401
from . import token   # noqa: E402,F401
from . import evidence  # noqa: E402,F401
