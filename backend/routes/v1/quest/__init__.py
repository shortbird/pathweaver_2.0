"""
API v1 Quest Routes

Registers quest endpoints under /api/v1/quests prefix.
Reuses existing quest logic from routes/quest/* but with:
- /api/v1/quests prefix instead of /api/quests
- Full backward compatibility with legacy endpoints

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: API_VERSIONING_MIGRATION_PLAN.md

Quest Module Structure (refactored from quest.py mega-file):
- listing.py: Quest listing, filtering, pagination
- detail.py: Quest detail views, enrollment status
- enrollment.py: Enrollment logic, quest creation
- completion.py: Progress tracking, completion, utilities
"""

from flask import Flask
from utils.logger import get_logger

logger = get_logger(__name__)


def register_quest_blueprints_v1(app: Flask):
    """
    Register all API v1 quest routes with the Flask app.

    All routes are registered under the '/api/v1/quests' prefix.
    This reuses the existing quest blueprints but registers them
    with the v1 prefix.

    Strategy: During migration period, we register the same blueprints
    multiple times with different prefixes. This allows both
    /api/quests/* and /api/v1/quests/* to work identically.

    Args:
        app: Flask application instance

    Example:
        >>> from routes.v1.quest import register_quest_blueprints_v1
        >>> register_quest_blueprints_v1(app)
    """
    try:
        # Import existing quest blueprints
        from routes.quest.listing import bp as listing_bp
        from routes.quest.detail import bp as detail_bp
        from routes.quest.enrollment import bp as enrollment_bp
        from routes.quest.completion import bp as completion_bp

        # Register with v1 prefix and unique names
        app.register_blueprint(listing_bp, url_prefix='/api/v1/quests',
                             name='quests_listing_v1')
        app.register_blueprint(detail_bp, url_prefix='/api/v1/quests',
                             name='quests_detail_v1')
        app.register_blueprint(enrollment_bp, url_prefix='/api/v1/quests',
                             name='quests_enrollment_v1')
        app.register_blueprint(completion_bp, url_prefix='/api/v1/quests',
                             name='quests_completion_v1')

        logger.info(" API v1 quest routes registered at /api/v1/quests")

    except Exception as e:
        logger.error(f" Failed to register API v1 quest routes: {e}")
        raise


# Export for convenience
__all__ = ['register_quest_blueprints_v1']
