"""
CSRF Protection middleware for the Flask application.
Uses Flask-WTF for CSRF token management.

✅ SECURITY FIX (Phase 1): CSRF protection is now REQUIRED, not optional.
This prevents Cross-Site Request Forgery attacks (OWASP A01:2021).

The application will fail to start if Flask-WTF is not installed.
"""

from utils.logger import get_logger

logger = get_logger(__name__)

try:
    from flask_wtf.csrf import CSRFProtect, generate_csrf, validate_csrf, CSRFError
    csrf = CSRFProtect()
except ImportError as e:
    # ✅ SECURITY FIX: CSRF protection is now REQUIRED
    raise RuntimeError(
        "Flask-WTF is required for CSRF protection but is not installed.\n"
        "Install it with: pip install Flask-WTF\n"
        "CSRF protection is mandatory for security (OWASP A01:2021)."
    ) from e

# Endpoints exempt from CSRF enforcement, resolved by ENDPOINT NAME at request
# time. Two hard-won lessons live here (2026-07-21 iCreate registration outage):
#   1. init_csrf() runs BEFORE blueprints are registered in app.py, so anything
#      that resolves app.view_functions at init time silently exempts nothing.
#   2. Flask-WTF's csrf.exempt() records the view's dotted path in
#      csrf._exempt_views — it does NOT set an attribute on the view, and
#      csrf.protect() (which we call manually) never consults that registry.
# These are public / pre-session endpoints or endpoints with their own auth
# (signature, device token, or opaque per-registration token).
CSRF_EXEMPT_ENDPOINTS = frozenset({
    'auth.login',  # Login uses username/password auth
    'auth.register',  # Registration is public
    'auth.refresh',  # Token refresh uses refresh token
    'health_check',  # Health check is public
    # Webhook endpoints that use signature verification
    'subscriptions.stripe_webhook',
    # LTI 1.3 endpoints — Canvas authenticates via signed id_token (JWS).
    # /lti/launch is a cross-origin POST from Canvas; /lti/login and
    # /lti/token are also cross-origin and pre-session.
    'lti.oidc_login_init',
    'lti.lti_launch',
    'lti.exchange_auth_code',
    'lti.deep_link_submit',
    # The Treehouse kiosk: pre-session, shared-device endpoints gated by a
    # device token (not a user session), so no CSRF cookie exists yet.
    'treehouse.kiosk_roster',
    'treehouse.kiosk_login',
    # iCreate parent registration funnel: designed as public/pre-session, but
    # the browser often DOES carry auth cookies here (the wizard logs new
    # parents into the platform mid-funnel, and existing parents arrive already
    # signed in) — so these MUST be exempt or the funnel breaks, e.g. the
    # payment-verification step right after the Stripe redirect. Every step is
    # gated by an opaque per-registration access_token in the request body
    # (constant-time compared), which a cross-site attacker cannot know, so
    # CSRF exemption is safe.
    'icreate_registration.start',
    'icreate_registration.verify_code',
    'icreate_registration.resend_code',
    'icreate_registration.login',
    'icreate_registration.submit_family',
    'icreate_registration.submit_details',
    'icreate_registration.submit_paperwork',
    'icreate_registration.create_checkout',
    'icreate_registration.preview_checkout',
    'icreate_registration.confirm_payment',
    'icreate_registration.record_fee',
    'icreate_registration.upload_photo',
    'icreate_registration.schedule_done',
    'icreate_registration.appointment_done',
})


def _is_csrf_exempt(app, endpoint):
    """Whether the resolved endpoint is exempt from CSRF enforcement, via the
    endpoint-name allowlist above, an explicit marker attribute, or a
    @csrf.exempt decorator (Flask-WTF's registry)."""
    if endpoint in CSRF_EXEMPT_ENDPOINTS:
        return True
    view = app.view_functions.get(endpoint)
    if view is None:
        return False
    if getattr(view, '_csrf_exempt', False) or getattr(view, 'csrf_exempt', False):
        return True
    dest = f'{view.__module__}.{view.__name__}'
    if dest in getattr(csrf, '_exempt_views', ()):
        return True
    blueprint = app.blueprints.get(endpoint.rpartition('.')[0]) if endpoint else None
    return blueprint is not None and blueprint in getattr(csrf, '_exempt_blueprints', ())


def init_csrf(app):
    """
    Initialize CSRF protection for the Flask app.

    ✅ SECURITY FIX: CSRF protection is now mandatory, not optional.

    Args:
        app: Flask application instance

    Returns:
        CSRFProtect instance

    Raises:
        RuntimeError: If CSRF initialization fails
    """
    # Configure CSRF settings
    app.config['WTF_CSRF_ENABLED'] = True
    # CVE-OPTIO-2025-009 FIX: Set CSRF token expiration to 1 hour for security
    # Tokens will auto-refresh on valid requests, providing seamless UX
    app.config['WTF_CSRF_TIME_LIMIT'] = 3600  # 1 hour (was None - never expired)
    app.config['WTF_CSRF_CHECK_DEFAULT'] = False  # We'll manually check for API routes

    # Configure CSRF headers for API usage
    app.config['WTF_CSRF_HEADERS'] = ['X-CSRF-Token', 'X-CSRFToken']
    app.config['WTF_CSRF_METHODS'] = ['POST', 'PUT', 'PATCH', 'DELETE']

    # SSL_STRICT adds a Referer check on top of token validation. It is OFF
    # because it can never pass in our topology: the app lives on
    # www.optioeducation.com while the API lives on api.optioeducation.com, and
    # browsers send at most `Referer: https://www.optioeducation.com/`
    # (strict-origin-when-cross-origin) — Flask-WTF requires the referrer to
    # match the API host, so every cookie-authenticated mutating request would
    # be rejected. Token validation is the actual CSRF defense.
    app.config['WTF_CSRF_SSL_STRICT'] = False

    # Initialize CSRF protection
    csrf.init_app(app)

    # Log successful initialization
    app.logger.info("✅ CSRF protection initialized successfully (mandatory)")

    # AUTH-H1 fix: actually ENFORCE CSRF. Previously WTF_CSRF_CHECK_DEFAULT was
    # False and no csrf.protect() ran anywhere, so CSRF was checked on ZERO
    # routes. We enforce here via a before_request, scoped to the only requests
    # that are CSRF-vulnerable: COOKIE-authenticated mutating requests.
    #
    # Deliberately skipped (not vulnerable / would break clients):
    #   - Non-mutating methods (GET/HEAD/OPTIONS).
    #   - Bearer/token-authenticated requests (mobile app + web SSO fallback):
    #     an attacker cannot set the Authorization header cross-site.
    #   - Requests with no auth cookie: no ambient authority to abuse
    #     (login/register/refresh/public/webhook/LTI/kiosk/iCreate funnel are
    #     all pre-session and carry no access_token cookie).
    _CSRF_EXEMPT_PREFIXES = (
        '/csrf-token', '/api/auth/csrf-token',
    )

    @app.before_request
    def _enforce_csrf_for_cookie_auth():
        from flask import request, jsonify
        if request.method not in ('POST', 'PUT', 'PATCH', 'DELETE'):
            return None
        # Token-authenticated requests are immune to CSRF.
        if request.headers.get('Authorization', '').startswith('Bearer '):
            return None
        # Only cookie-authenticated sessions are at risk.
        if not (request.cookies.get('access_token') or request.cookies.get('refresh_token')):
            return None
        path = request.path or ''
        if any(path.startswith(p) for p in _CSRF_EXEMPT_PREFIXES):
            return None
        if _is_csrf_exempt(app, request.endpoint):
            return None
        try:
            csrf.protect()
        except CSRFError as e:
            reason = getattr(e, 'description', None) or str(e)
            # A CSRF rejection blocks a real user action (or is an actual
            # attack) — either way we want to see it. The response below is a
            # handled 400, which Sentry's Flask integration never captures, so
            # report explicitly (no-op when Sentry is not initialized).
            logger.warning(
                f"CSRF rejection: {request.method} {path} "
                f"endpoint={request.endpoint} reason={reason}"
            )
            try:
                import sentry_sdk
                with sentry_sdk.new_scope() as scope:
                    scope.set_tag('csrf_endpoint', request.endpoint or 'unknown')
                    scope.set_extra('path', path)
                    scope.set_extra('method', request.method)
                    scope.set_extra('reason', reason)
                    sentry_sdk.capture_message(
                        'CSRF rejection on cookie-authenticated request',
                        level='warning',
                    )
            except Exception:
                pass
            return jsonify({
                'error': 'CSRF token missing or invalid',
                'message': 'Refresh the page and try again.',
                'csrf_required': True,
            }), 400
        return None

    # Verify CSRF is properly initialized
    if not csrf:
        raise RuntimeError("CSRF protection failed to initialize")

    return csrf

def get_csrf_token():
    """
    Generate a new CSRF token.

    ✅ SECURITY FIX: CSRF is now mandatory - this function will always succeed.

    Returns:
        str: CSRF token (guaranteed to be available)

    Raises:
        RuntimeError: If CSRF token generation fails
    """
    try:
        token = generate_csrf()
        if not token:
            raise RuntimeError("CSRF token generation returned empty value")
        return token
    except Exception as e:
        raise RuntimeError(f"Failed to generate CSRF token: {e}") from e

def validate_csrf_token(token):
    """
    Validate a CSRF token.

    ✅ SECURITY FIX: CSRF is now mandatory - validation always enforced.

    Args:
        token: The token to validate

    Returns:
        bool: True if valid, False otherwise
    """
    try:
        validate_csrf(token)
        return True
    except Exception:
        return False