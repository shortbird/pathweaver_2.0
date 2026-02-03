"""
API v1 User Routes

Registers user endpoints under /api/v1/users prefix.
Reuses existing user logic from routes/users/* but with:
- /api/v1/users prefix instead of /api/users
- Full backward compatibility with legacy endpoints

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: ACTIONABLE_PRIORITY_LIST_2025.md - Week 8
"""

from flask import Flask
from utils.logger import get_logger

logger = get_logger(__name__)


def register_user_blueprints_v1(app: Flask):
    """
    Register all API v1 user routes with the Flask app.

    All routes are registered under the '/api/v1/users' prefix.
    This reuses the existing user blueprints but registers them
    with the v1 prefix.

    Strategy: During migration period, we register the same blueprints
    multiple times with different prefixes. This allows both
    /api/users/* and /api/v1/users/* to work identically.

    Args:
        app: Flask application instance

    Example:
        >>> from routes.v1.users import register_user_blueprints_v1
        >>> register_user_blueprints_v1(app)
    """
    try:
        # Import existing user blueprints
        from routes.users import profile, xp

        # Register profile routes with v1 prefix
        app.register_blueprint(profile.bp, url_prefix='/api/v1/users',
                             name='users_profile_v1')

        # Register XP routes with v1 prefix
        app.register_blueprint(xp.bp, url_prefix='/api/v1/users',
                             name='users_xp_v1')

        logger.info(" API v1 user routes registered at /api/v1/users")

    except Exception as e:
        logger.error(f" Failed to register API v1 user routes: {e}")
        raise


# Export for convenience
__all__ = ['register_user_blueprints_v1']
