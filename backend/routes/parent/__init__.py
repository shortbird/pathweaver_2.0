"""
Parent routes package.
Refactored parent dashboard blueprints for better maintainability.
Part of Month 6 Backend Optimization (Dec 2025).

Modules:
- dashboard_overview.py: Main dashboard with learning rhythm, active quests, weekly wins
- analytics_insights.py: Progress tracking, learning insights, communications, tips
- analytics.py: Legacy analytics helpers (reserved for future use)

All blueprints use '/api/parent' prefix for backward compatibility.

Refactoring History:
- Dec 26, 2025: Split dashboard.py (1,405 lines) into 4 modular files (~300-400 lines each)
- Previously removed duplicate quests.py and evidence.py files in Dec 2025
- Sep 15, 2026: deleted quests_view.py and evidence_view.py -- no client had
  called them since the parent dashboard was retired, and both read
  user_quest_deadlines, a table the database no longer has
"""

from flask import Flask
from .dashboard_overview import bp as dashboard_overview_bp
from .analytics_insights import bp as analytics_insights_bp
from .analytics import bp as analytics_bp
from .engagement import bp as engagement_bp
from .child_overview import bp as child_overview_bp
from .child_profile import bp as child_profile_bp
from .communications import bp as communications_bp
from .learning_moments import bp as learning_moments_bp
from .family_cover import bp as family_cover_bp

# Export blueprints for direct import
__all__ = [
    'dashboard_overview_bp',
    'analytics_insights_bp',
    'analytics_bp',
    'engagement_bp',
    'child_overview_bp',
    'child_profile_bp',
    'communications_bp',
    'learning_moments_bp',
    'family_cover_bp',
    'register_parent_blueprints'
]


def register_parent_blueprints(app: Flask):
    """Register all parent dashboard blueprints."""
    app.register_blueprint(dashboard_overview_bp)
    app.register_blueprint(analytics_insights_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(engagement_bp)
    app.register_blueprint(child_overview_bp)
    app.register_blueprint(child_profile_bp)
    app.register_blueprint(communications_bp)
    app.register_blueprint(learning_moments_bp)
    app.register_blueprint(family_cover_bp)
