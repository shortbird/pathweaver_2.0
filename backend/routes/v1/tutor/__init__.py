"""
API v1 AI Tutor Routes

Registers AI tutor endpoints under /api/v1/tutor prefix.
Reuses existing tutor logic from routes/tutor/* but with:
- /api/v1/tutor prefix instead of /api/tutor
- Full backward compatibility with legacy endpoints

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: ACTIONABLE_PRIORITY_LIST_2025.md - Week 8
"""

from flask import Flask
from utils.logger import get_logger

logger = get_logger(__name__)


def register_tutor_blueprints_v1(app: Flask):
    """
    Register all API v1 AI tutor routes with the Flask app.

    All routes are registered under the '/api/v1/tutor' prefix.
    This reuses the existing tutor blueprints but registers them
    with the v1 prefix.

    Strategy: During migration period, we register the same blueprints
    multiple times with different prefixes. This allows both
    /api/tutor/* and /api/v1/tutor/* to work identically.

    Args:
        app: Flask application instance

    Example:
        >>> from routes.v1.tutor import register_tutor_blueprints_v1
        >>> register_tutor_blueprints_v1(app)
    """
    try:
        # Import existing tutor blueprints
        from routes.tutor import chat, history

        # Register tutor chat with v1 prefix
        app.register_blueprint(chat.bp, url_prefix='/api/v1/tutor',
                             name='tutor_chat_v1')

        # Register tutor history with v1 prefix
        app.register_blueprint(history.bp, url_prefix='/api/v1/tutor',
                             name='tutor_history_v1')

        logger.info(" API v1 tutor routes registered at /api/v1/tutor")

    except Exception as e:
        logger.error(f" Failed to register API v1 tutor routes: {e}")
        raise


# Export for convenience
__all__ = ['register_tutor_blueprints_v1']
