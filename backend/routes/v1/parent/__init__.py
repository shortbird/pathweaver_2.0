"""
API v1 Parent Routes

Registers parent endpoints under /api/v1/parents prefix.
Reuses existing parent logic from routes/parent/* but with:
- /api/v1/parents prefix instead of /api/parents
- Full backward compatibility with legacy endpoints

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: ACTIONABLE_PRIORITY_LIST_2025.md - Week 8
"""

from flask import Flask
from utils.logger import get_logger

logger = get_logger(__name__)


def register_parent_blueprints_v1(app: Flask):
    """
    Register all API v1 parent routes with the Flask app.

    All routes are registered under the '/api/v1/parents' prefix.
    This reuses the existing parent blueprints but registers them
    with the v1 prefix.

    Strategy: During migration period, we register the same blueprints
    multiple times with different prefixes. This allows both
    /api/parents/* and /api/v1/parents/* to work identically.

    Args:
        app: Flask application instance

    Example:
        >>> from routes.v1.parent import register_parent_blueprints_v1
        >>> register_parent_blueprints_v1(app)
    """
    try:
        # Import refactored parent blueprints (Dec 2025 refactor)
        from routes.parent import (
            dashboard_overview_bp,
            quests_view_bp,
            evidence_view_bp,
            analytics_insights_bp,
            analytics_bp
        )

        # Register parent modules with v1 prefix
        app.register_blueprint(dashboard_overview_bp, url_prefix='/api/v1/parents',
                             name='parent_dashboard_overview_v1')
        app.register_blueprint(quests_view_bp, url_prefix='/api/v1/parents',
                             name='parent_quests_view_v1')
        app.register_blueprint(evidence_view_bp, url_prefix='/api/v1/parents',
                             name='parent_evidence_view_v1')
        app.register_blueprint(analytics_insights_bp, url_prefix='/api/v1/parents',
                             name='parent_analytics_insights_v1')
        app.register_blueprint(analytics_bp, url_prefix='/api/v1/parents',
                             name='parent_analytics_v1')

        logger.info(" API v1 parent routes registered at /api/v1/parents")

    except Exception as e:
        logger.error(f" Failed to register API v1 parent routes: {e}")
        raise


# Export for convenience
__all__ = ['register_parent_blueprints_v1']
