"""
Parent routes package.
Refactored parent dashboard blueprints for better maintainability.
Part of Month 6 Backend Optimization (Dec 2025).

Modules:
- dashboard_overview.py: Main dashboard with learning rhythm, active quests, weekly wins
- quests_view.py: Quest calendar, completed quests, and detailed quest views
- evidence_view.py: Task details and recent completions with evidence viewing
- analytics_insights.py: Progress tracking, learning insights, communications, tips
- analytics.py: Legacy analytics helpers (reserved for future use)

All blueprints use '/api/parent' prefix for backward compatibility.

Refactoring History:
- Dec 26, 2025: Split dashboard.py (1,405 lines) into 4 modular files (~300-400 lines each)
- Previously removed duplicate quests.py and evidence.py files in Dec 2025
"""

from flask import Flask
from .dashboard_overview import bp as dashboard_overview_bp
from .quests_view import bp as quests_view_bp
from .evidence_view import bp as evidence_view_bp
from .analytics_insights import bp as analytics_insights_bp
from .analytics import bp as analytics_bp
from .engagement import bp as engagement_bp
from .child_overview import bp as child_overview_bp

# Export blueprints for direct import
__all__ = [
    'dashboard_overview_bp',
    'quests_view_bp',
    'evidence_view_bp',
    'analytics_insights_bp',
    'analytics_bp',
    'engagement_bp',
    'child_overview_bp',
    'register_parent_blueprints'
]


def register_parent_blueprints(app: Flask):
    """Register all parent dashboard blueprints."""
    app.register_blueprint(dashboard_overview_bp)
    app.register_blueprint(quests_view_bp)
    app.register_blueprint(evidence_view_bp)
    app.register_blueprint(analytics_insights_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(engagement_bp)
    app.register_blueprint(child_overview_bp)
