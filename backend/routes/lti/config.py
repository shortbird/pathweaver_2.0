"""
LTI tool configuration JSON.

Canvas admins paste this URL into a Developer Key (LTI Key → Method: Enter URL)
and Canvas pulls the configuration from us — no manual JSON copy/paste.

Endpoint URLs use `sso.canvaslms.com` per the 2024 Canvas migration; institution-
specific URLs (e.g., `https://<school>.instructure.com/api/lti/...`) also work
but the unified domain is the new default.

Scopes requested cover Deep Linking + AGS Score + line item read/write, which
matches the v1 implementation surface (no NRPS yet).
"""

from flask import jsonify, request

from app_config import Config
from routes.lti import bp


def _backend_origin() -> str:
    if Config.BACKEND_URL:
        return Config.BACKEND_URL.rstrip("/")
    return request.url_root.rstrip("/")


@bp.route("/config.json", methods=["GET"])
def tool_config():
    base = _backend_origin()
    config_doc = {
        "title": "Optio",
        "description": "Self-validated, personalized learning quests inside Canvas.",
        "oidc_initiation_url": f"{base}/lti/login",
        "target_link_uri": f"{base}/lti/launch",
        "scopes": [
            "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
            "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly",
            "https://purl.imsglobal.org/spec/lti-ags/scope/score",
            "https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly",
        ],
        "extensions": [
            {
                "platform": "canvas.instructure.com",
                "settings": {
                    "platform": "canvas.instructure.com",
                    "placements": [
                        {
                            "placement": "course_navigation",
                            "message_type": "LtiResourceLinkRequest",
                            "target_link_uri": f"{base}/lti/launch",
                            "text": "Optio",
                            "default": "enabled",
                        },
                        {
                            "placement": "link_selection",
                            "message_type": "LtiDeepLinkingRequest",
                            "target_link_uri": f"{base}/lti/launch",
                            "text": "Add Optio Quest",
                        },
                        {
                            "placement": "assignment_selection",
                            "message_type": "LtiDeepLinkingRequest",
                            "target_link_uri": f"{base}/lti/launch",
                            "text": "Optio Quest",
                        },
                    ],
                },
                "privacy_level": "public",
            }
        ],
        "public_jwk_url": f"{base}/lti/jwks",
        "custom_fields": {
            # Canvas substitutes these at launch time. We mirror the standard
            # IMS variable names so we can read them from the `custom` claim
            # without depending on Canvas-specific extensions.
            "canvas_user_id": "$Canvas.user.id",
            "canvas_course_id": "$Canvas.course.id",
            "canvas_assignment_id": "$Canvas.assignment.id",
        },
    }
    return jsonify(config_doc), 200
