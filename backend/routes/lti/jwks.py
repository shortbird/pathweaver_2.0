"""
Public JWKS endpoint. Canvas fetches this when verifying our Deep Linking
response JWTs and our AGS service-token assertions. The path is `/lti/jwks`
(the spec lets the platform discover the URL from the tool config), but
many integrations also expect `/.well-known/jwks.json` — we serve both via
a small wrapper in app.py if needed.
"""

from flask import jsonify

from routes.lti import bp
from utils.lti_keys import get_public_jwks


@bp.route("/jwks", methods=["GET"])
def jwks():
    return jsonify(get_public_jwks()), 200
