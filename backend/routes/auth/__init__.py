"""
Authentication Module

Refactored from mega-file auth.py (1,523 lines) into focused modules:
- login.py: Login, logout, token refresh, session validation
- registration.py: User registration and email verification
- password.py: Password reset and forgot password
- session.py: CSRF token management

Usage in app.py:
    from routes.auth import register_auth_routes
    register_auth_routes(app)
"""

from flask import Flask
from .login import bp as login_bp
from .registration import bp as registration_bp
from .password import bp as password_bp
from .session import bp as session_bp
from .google_oauth import bp as google_oauth_bp


def register_auth_routes(app: Flask):
    """
    Register all authentication route modules with the Flask app.

    All routes are registered under the '/api/auth' prefix:
    - /api/auth/login, /api/auth/logout, /api/auth/me, /api/auth/refresh
    - /api/auth/register, /api/auth/resend-verification
    - /api/auth/forgot-password, /api/auth/reset-password
    - /api/auth/csrf-token
    - /api/auth/token-health, /api/auth/cookie-debug
    - /api/auth/google/callback (Google OAuth)

    Args:
        app: Flask application instance
    """
    # Register each auth module blueprint with /api/auth prefix
    app.register_blueprint(login_bp, url_prefix='/api/auth')
    app.register_blueprint(registration_bp, url_prefix='/api/auth')
    app.register_blueprint(password_bp, url_prefix='/api/auth')
    app.register_blueprint(session_bp, url_prefix='/api/auth')
    app.register_blueprint(google_oauth_bp, url_prefix='/api/auth')
