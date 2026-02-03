"""
API v1 Routes Registration

Centralized registration for all API v1 routes.
All v1 routes use the /api/v1 prefix and standardized response formats.

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: API_VERSIONING_MIGRATION_PLAN.md
"""

from flask import Flask
from utils.logger import get_logger

logger = get_logger(__name__)


def register_v1_routes(app: Flask):
    """
    Register all API v1 routes with the Flask application.

    This function will be expanded as routes are migrated from legacy to v1.
    Routes are registered in order of priority:
    1. Authentication (login, register, session management)
    2. Core features (quests, tasks, badges)
    3. User management
    4. Admin features
    5. Additional features (parent, observer, community, etc.)

    Args:
        app: Flask application instance

    Example:
        >>> from routes.v1 import register_v1_routes
        >>> register_v1_routes(app)
    """
    logger.info("Registering API v1 routes...")

    # Track registration counts for logging
    registered_count = 0

    # Phase 1: Authentication routes (HIGH PRIORITY)
    try:
        from routes.v1.auth import register_auth_routes_v1
        register_auth_routes_v1(app)
        registered_count += 1
        logger.info("✓ Registered v1 auth routes")
    except ImportError:
        logger.warning("✗ Auth routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 auth routes: {e}")

    # Phase 1: Quest routes (HIGH PRIORITY)
    try:
        from routes.v1.quest import register_quest_blueprints_v1
        register_quest_blueprints_v1(app)
        registered_count += 1
        logger.info("✓ Registered v1 quest routes")
    except ImportError:
        logger.warning("✗ Quest routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 quest routes: {e}")

    # Phase 1: Task routes (HIGH PRIORITY)
    try:
        from routes.v1 import tasks
        app.register_blueprint(tasks.bp, url_prefix='/api/v1/tasks', name='tasks_v1')
        registered_count += 1
        logger.info("✓ Registered v1 task routes")
    except ImportError:
        logger.warning("✗ Task routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 task routes: {e}")

    # Phase 1: Badge routes (HIGH PRIORITY)
    try:
        from routes.v1 import badges, badge_claiming
        app.register_blueprint(badges.bp, url_prefix='/api/v1/badges', name='badges_v1')
        app.register_blueprint(badge_claiming.badge_claiming_bp, url_prefix='/api/v1', name='badge_claiming_v1')
        registered_count += 1
        logger.info("✓ Registered v1 badge routes")
    except ImportError:
        logger.warning("✗ Badge routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 badge routes: {e}")

    # Phase 1: User profile routes (HIGH PRIORITY)
    try:
        from routes.v1.users import register_user_blueprints_v1
        register_user_blueprints_v1(app)
        registered_count += 1
        logger.info("✓ Registered v1 user routes")
    except ImportError:
        logger.warning("✗ User routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 user routes: {e}")

    # Phase 2: Admin routes (MEDIUM PRIORITY)
    try:
        from routes.v1.admin import register_admin_blueprints_v1
        register_admin_blueprints_v1(app)
        registered_count += 1
        logger.info("✓ Registered v1 admin routes")
    except ImportError:
        logger.warning("✗ Admin routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 admin routes: {e}")

    # Phase 2: Portfolio routes (MEDIUM PRIORITY)
    try:
        from routes.v1 import portfolio
        app.register_blueprint(portfolio.bp, url_prefix='/api/v1/portfolio', name='portfolio_v1')
        registered_count += 1
        logger.info("✓ Registered v1 portfolio routes")
    except ImportError:
        logger.warning("✗ Portfolio routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 portfolio routes: {e}")

    # Phase 2: Parent/Dependent routes (MEDIUM PRIORITY)
    try:
        from routes.v1.parent import register_parent_blueprints_v1
        register_parent_blueprints_v1(app)
        registered_count += 1
        logger.info("✓ Registered v1 parent routes")
    except ImportError:
        logger.warning("✗ Parent routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 parent routes: {e}")

    try:
        from routes.v1 import dependents
        app.register_blueprint(dependents.bp, url_prefix='/api/v1/dependents', name='dependents_v1')
        registered_count += 1
        logger.info("✓ Registered v1 dependent routes")
    except ImportError:
        logger.warning("✗ Dependent routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 dependent routes: {e}")

    # Phase 2: Observer routes (MEDIUM PRIORITY)
    try:
        from routes.v1 import observer
        app.register_blueprint(observer.bp, url_prefix='/api/v1/observers', name='observers_v1')
        registered_count += 1
        logger.info("✓ Registered v1 observer routes")
    except ImportError:
        logger.warning("✗ Observer routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 observer routes: {e}")

    # Phase 3: Community/Social routes (LOW PRIORITY)
    try:
        from routes.v1 import community
        app.register_blueprint(community.bp, url_prefix='/api/v1/community', name='community_v1')
        registered_count += 1
        logger.info("✓ Registered v1 community routes")
    except ImportError:
        logger.warning("✗ Community routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 community routes: {e}")

    # Phase 3: AI Tutor routes (LOW PRIORITY)
    try:
        from routes.v1.tutor import register_tutor_blueprints_v1
        register_tutor_blueprints_v1(app)
        registered_count += 1
        logger.info("✓ Registered v1 tutor routes")
    except ImportError:
        logger.warning("✗ Tutor routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 tutor routes: {e}")

    # Phase 3: LMS Integration routes (LOW PRIORITY)
    try:
        from routes.v1 import lms_integration
        app.register_blueprint(lms_integration.bp, url_prefix='/api/v1/lms', name='lms_integration_v1')
        registered_count += 1
        logger.info("✓ Registered v1 LMS integration routes")
    except ImportError:
        logger.warning("✗ LMS integration routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 LMS integration routes: {e}")

    # Phase 4: Additional API routes (MEDIUM PRIORITY)
    try:
        from routes.v1 import uploads
        app.register_blueprint(uploads.bp, url_prefix='/api/v1/uploads', name='uploads_v1')
        registered_count += 1
        logger.info("✓ Registered v1 uploads routes")
    except ImportError:
        logger.warning("✗ Uploads routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 uploads routes: {e}")

    try:
        from routes.v1 import settings
        app.register_blueprint(settings.bp, url_prefix='/api/v1', name='settings_v1')
        registered_count += 1
        logger.info("✓ Registered v1 settings routes")
    except ImportError:
        logger.warning("✗ Settings routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 settings routes: {e}")

    try:
        from routes.v1 import credits
        app.register_blueprint(credits.bp, url_prefix='/api/v1/credits', name='credits_v1')
        registered_count += 1
        logger.info("✓ Registered v1 credits routes")
    except ImportError:
        logger.warning("✗ Credits routes v1 not yet migrated")
    except Exception as e:
        logger.error(f"✗ Failed to register v1 credits routes: {e}")

    # Log summary
    logger.info(f"API v1 route registration complete: {registered_count} route groups registered")


def get_v1_route_info():
    """
    Get information about registered v1 routes.

    Returns:
        dict: Information about v1 routes including counts and status

    Example:
        >>> get_v1_route_info()
        {
            "version": "v1",
            "total_routes": 288,
            "migrated_routes": 45,
            "pending_routes": 243,
            "migration_progress": "15.6%"
        }
    """
    # This would ideally query the actual registered routes
    # For now, return static info
    return {
        "version": "v1",
        "total_routes": 288,
        "migrated_routes": 0,  # Will increase as routes are migrated
        "pending_routes": 288,
        "migration_progress": "0%",
        "priority_routes_migrated": False,
        "target_completion": "2026-01-10"
    }
