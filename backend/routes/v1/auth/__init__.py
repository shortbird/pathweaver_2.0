"""
API v1 Authentication Routes

Registers authentication endpoints under /api/v1/auth prefix.
Reuses existing auth logic from routes/auth/* but with:
- /api/v1/auth prefix instead of /api/auth
- Full backward compatibility with legacy endpoints

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: API_VERSIONING_MIGRATION_PLAN.md

Available Endpoints:
- POST /api/v1/auth/login - User login
- POST /api/v1/auth/logout - User logout
- POST /api/v1/auth/refresh - Token refresh
- GET /api/v1/auth/me - Get current user
- POST /api/v1/auth/register - User registration
- POST /api/v1/auth/resend-verification - Resend verification email
- POST /api/v1/auth/forgot-password - Request password reset
- POST /api/v1/auth/reset-password - Reset password with token
- GET /api/v1/auth/csrf-token - Get CSRF token
- GET /api/v1/auth/token-health - Check token health
- GET /api/v1/auth/cookie-debug - Debug cookie issues
"""

from flask import Flask
from utils.logger import get_logger

logger = get_logger(__name__)


def register_auth_routes_v1(app: Flask):
    """
    Register all API v1 authentication routes with the Flask app.

    All routes are registered under the '/api/v1/auth' prefix.
    This reuses the existing auth blueprints but registers them
    with the v1 prefix.

    Strategy: During migration period, we simply register the same
    blueprints multiple times with different prefixes. This allows
    both /api/auth/* and /api/v1/auth/* to work identically.

    Args:
        app: Flask application instance

    Example:
        >>> from routes.v1.auth import register_auth_routes_v1
        >>> register_auth_routes_v1(app)
    """
    try:
        # Import existing auth blueprints
        # These blueprints define the routes but don't include the prefix
        # The prefix is added at registration time
        from routes.auth.login import bp as login_bp
        from routes.auth.registration import bp as registration_bp
        from routes.auth.password import bp as password_bp
        from routes.auth.session import bp as session_bp

        # Register the same blueprints with v1 prefix
        # Flask allows registering the same blueprint multiple times
        # as long as we provide a unique name parameter
        app.register_blueprint(login_bp, url_prefix='/api/v1/auth',
                             name='auth_login_v1')
        app.register_blueprint(registration_bp, url_prefix='/api/v1/auth',
                             name='auth_registration_v1')
        app.register_blueprint(password_bp, url_prefix='/api/v1/auth',
                             name='auth_password_v1')
        app.register_blueprint(session_bp, url_prefix='/api/v1/auth',
                             name='auth_session_v1')

        logger.info(" API v1 auth routes registered at /api/v1/auth")

    except Exception as e:
        logger.error(f" Failed to register API v1 auth routes: {e}")
        raise


# Export for convenience
__all__ = ['register_auth_routes_v1']
