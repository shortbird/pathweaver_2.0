"""
API v1 Admin Routes

Registers admin endpoints under /api/v1/admin prefix.
Reuses existing admin logic from routes/admin/* but with:
- /api/v1/admin prefix instead of /api/admin
- Full backward compatibility with legacy endpoints

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: ACTIONABLE_PRIORITY_LIST_2025.md - Week 8
"""

from flask import Flask
from utils.logger import get_logger

logger = get_logger(__name__)


def register_admin_blueprints_v1(app: Flask):
    """
    Register all API v1 admin routes with the Flask app.

    All routes are registered under the '/api/v1/admin' prefix.
    This reuses the existing admin blueprints but registers them
    with the v1 prefix.

    Strategy: During migration period, we register the same blueprints
    multiple times with different prefixes. This allows both
    /api/admin/* and /api/v1/admin/* to work identically.

    Args:
        app: Flask application instance

    Example:
        >>> from routes.v1.admin import register_admin_blueprints_v1
        >>> register_admin_blueprints_v1(app)
    """
    try:
        # Import existing admin blueprints
        from routes import admin_core
        from routes.admin import (
            user_management, quest_management, badge_management,
            analytics, student_task_management, sample_task_management,
            course_quest_management, task_flags, advisor_management,
            parent_connections, masquerade, crm, course_import,
            organization_management, observer_audit, ferpa_compliance
        )

        # Register admin core with v1 prefix
        app.register_blueprint(admin_core.bp, url_prefix='/api/v1/admin',
                             name='admin_core_v1')

        # Register user management with v1 prefix
        app.register_blueprint(user_management.bp, url_prefix='/api/v1/admin',
                             name='admin_user_management_v1')

        # Register quest management with v1 prefix
        app.register_blueprint(quest_management.bp, url_prefix='/api/v1/admin',
                             name='admin_quest_management_v1')

        # Register badge management with v1 prefix
        app.register_blueprint(badge_management.bp, url_prefix='/api/v1/admin',
                             name='admin_badge_management_v1')

        # Register analytics with v1 prefix
        app.register_blueprint(analytics.bp, url_prefix='/api/v1/admin/analytics',
                             name='admin_analytics_v1')

        # Register student task management with v1 prefix
        app.register_blueprint(student_task_management.bp, url_prefix='/api/v1/admin/users',
                             name='admin_student_task_management_v1')

        # Register sample task management with v1 prefix
        app.register_blueprint(sample_task_management.bp, url_prefix='/api/v1/admin',
                             name='admin_sample_task_management_v1')

        # Register course quest management with v1 prefix
        app.register_blueprint(course_quest_management.bp, url_prefix='/api/v1/admin',
                             name='admin_course_quest_management_v1')

        # Register task flags with v1 prefix
        app.register_blueprint(task_flags.bp, url_prefix='/api/v1/admin',
                             name='admin_task_flags_v1')

        # Register advisor management with v1 prefix
        app.register_blueprint(advisor_management.bp, url_prefix='/api/v1/admin',
                             name='admin_advisor_management_v1')

        # Register parent connections with v1 prefix
        app.register_blueprint(parent_connections.bp, url_prefix='/api/v1/admin/parent-connections',
                             name='admin_parent_connections_v1')

        # Register masquerade with v1 prefix
        app.register_blueprint(masquerade.masquerade_bp, url_prefix='/api/v1/admin/masquerade',
                             name='admin_masquerade_v1')

        # Register CRM with v1 prefix
        app.register_blueprint(crm.crm_bp, url_prefix='/api/v1/admin/crm',
                             name='admin_crm_v1')

        # Register course import with v1 prefix
        app.register_blueprint(course_import.bp, url_prefix='/api/v1/admin/courses',
                             name='admin_course_import_v1')

        # Register organization management with v1 prefix
        app.register_blueprint(organization_management.bp, url_prefix='/api/v1/admin/organizations',
                             name='admin_organization_management_v1')

        # Register observer audit with v1 prefix
        app.register_blueprint(observer_audit.bp, url_prefix='/api/v1/admin/observer-audit',
                             name='admin_observer_audit_v1')

        # Register FERPA compliance with v1 prefix
        app.register_blueprint(ferpa_compliance.bp, url_prefix='/api/v1/admin/ferpa',
                             name='admin_ferpa_compliance_v1')

        logger.info(" API v1 admin routes registered at /api/v1/admin")

    except Exception as e:
        logger.error(f" Failed to register API v1 admin routes: {e}")
        raise


# Export for convenience
__all__ = ['register_admin_blueprints_v1']
