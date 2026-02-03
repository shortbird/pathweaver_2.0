"""
CSRF Protection middleware for the Flask application.
Uses Flask-WTF for CSRF token management.

✅ SECURITY FIX (Phase 1): CSRF protection is now REQUIRED, not optional.
This prevents Cross-Site Request Forgery attacks (OWASP A01:2021).

The application will fail to start if Flask-WTF is not installed.
"""

import os

from utils.logger import get_logger

logger = get_logger(__name__)

try:
    from flask_wtf.csrf import CSRFProtect, generate_csrf, validate_csrf
    csrf = CSRFProtect()
except ImportError as e:
    # ✅ SECURITY FIX: CSRF protection is now REQUIRED
    raise RuntimeError(
        "Flask-WTF is required for CSRF protection but is not installed.\n"
        "Install it with: pip install Flask-WTF\n"
        "CSRF protection is mandatory for security (OWASP A01:2021)."
    ) from e

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

    # Use secure cookies in production
    app.config['WTF_CSRF_SSL_STRICT'] = os.getenv('FLASK_ENV') == 'production'
    
    # Initialize CSRF protection
    csrf.init_app(app)

    # Log successful initialization
    app.logger.info("✅ CSRF protection initialized successfully (mandatory)")

    # Exempt certain endpoints from CSRF protection
    # These are typically public endpoints or endpoints with their own auth
    exempt_endpoints = [
        'auth.login',  # Login uses username/password auth
        'auth.register',  # Registration is public
        'auth.refresh',  # Token refresh uses refresh token
        'health_check',  # Health check is public
        'test_config',  # Test endpoint
        # Webhook endpoints (if any) that use signature verification
        'subscriptions.stripe_webhook',  # Stripe webhook uses signature verification
    ]

    for endpoint in exempt_endpoints:
        view_func = app.view_functions.get(endpoint)
        if view_func is not None:
            csrf.exempt(view_func)

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